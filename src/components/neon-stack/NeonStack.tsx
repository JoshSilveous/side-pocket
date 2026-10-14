import { withLayoutContext } from "expo-router";
import {
    createNavigatorFactory,
    StackActions,
    StackRouter,
    useNavigationBuilder,
    type DefaultNavigatorOptions,
    type Descriptor,
    type EventMapBase,
    type ParamListBase,
    type StackActionHelpers,
    type StackNavigationState,
    type StackRouterOptions,
} from "expo-router/react-navigation";
import {
    createContext,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
    cancelAnimation,
    Easing,
    useDerivedValue,
    useSharedValue,
    withSequence,
    withTiming,
    type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { LightFrame, WALL_LIGHT_REACH } from "@/components/neon-renderer";
import { createPowerOnScope, PowerOnContext } from "@/components/power-on";

const DURATION = 480;
/**
 * Dark gap between adjacent screens while sliding. Wall glow reaches far past a
 * tube, so without it an off-screen screen's light visibly pops on/off at the
 * edge. At 60% of reach the (1 − d/reach)⁴ falloff is ~2.5% — effectively dark.
 */
const SCREEN_GAP = Math.round(WALL_LIGHT_REACH * 0.6);
const EASE = Easing.inOut(Easing.cubic);
/** Width (px) of the left-edge strip that starts a swipe-back. */
const EDGE_WIDTH = 28;
const SWIPE_COMMIT_FRACTION = 0.35;
const SWIPE_COMMIT_VELOCITY = 800;

export type NeonStackOptions = {
    /** Allow edge swipe-back on this screen. Default: true */
    gestureEnabled?: boolean;
};

type Direction = "forward" | "back";
type Role = "top" | "in" | "out" | "hidden";
type Transition = {
    from: string;
    to: string;
    dir: Direction;
    interactive?: boolean;
};

export type ScreenTransitionStatus = "active" | "entering" | "leaving" | "hidden";

type ScreenTransition = {
    status: ScreenTransitionStatus;
    direction: Direction;
    /** 0 → 1 over the current transition. */
    progress: SharedValue<number>;
};

const ScreenTransitionContext = createContext<ScreenTransition | null>(null);

/**
 * Where this screen is in the stack's slide. Use `status === "entering"` with
 * `direction === "forward"` to kick off power-on animations as a screen slides in.
 */
export function useScreenTransition(): ScreenTransition | null {
    return useContext(ScreenTransitionContext);
}

const STATUS: Record<Role, ScreenTransitionStatus> = {
    top: "active",
    in: "entering",
    out: "leaving",
    hidden: "hidden",
};

function ScreenLayer({
    role,
    dir,
    progress,
    width,
    children,
}: {
    role: Role;
    dir: Direction;
    progress: SharedValue<number>;
    width: number;
    children: ReactNode;
}) {
    const tx = useDerivedValue(() => {
        const p = progress.value;
        const d = width + SCREEN_GAP;
        if (role === "in") return (dir === "forward" ? 1 : -1) * d * (1 - p);
        if (role === "out") return (dir === "forward" ? -1 : 1) * d * p;
        return 0;
    }, [role, dir, width]);

    // Driven on the UI thread alongside `tx` so a role change can't show one frame
    // of a screen at the wrong position/visibility.
    const opacity = useDerivedValue<number>(() => (role === "hidden" ? 0 : 1), [role]);

    const ctx = useMemo(
        () => ({ status: STATUS[role], direction: dir, progress }),
        [role, dir, progress],
    );

    // A pushed screen mounts hidden → its tubes start dark and stagger on the
    // moment it starts sliding in. The initial screen mounts on top, already lit.
    const scope = useRef(createPowerOnScope(role !== "top")).current;
    useEffect(() => {
        if (role !== "hidden") scope.fire();
    }, [role, scope]);
    const hidden = role === "hidden";

    return (
        <ScreenTransitionContext.Provider value={ctx}>
            <PowerOnContext.Provider value={scope}>
                <LightFrame
                    translateX={tx}
                    opacity={opacity}
                    style={StyleSheet.absoluteFill}
                    pointerEvents={role === "top" ? "auto" : "none"}
                    accessibilityElementsHidden={hidden}
                    importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
                >
                    {children}
                </LightFrame>
            </PowerOnContext.Provider>
        </ScreenTransitionContext.Provider>
    );
}

type Props = DefaultNavigatorOptions<
    ParamListBase,
    string | undefined,
    StackNavigationState<ParamListBase>,
    NeonStackOptions,
    EventMapBase,
    unknown
> &
    StackRouterOptions;

/**
 * Stack navigator whose transitions are driven by Reanimated instead of the
 * native stack, so every screen sits in a <LightFrame> and neon light slides
 * with its tubes while the wall stays put. Screens below the top stay mounted
 * but hidden (opacity 0 → they cast no light and cost no wall emitters).
 */
function NeonStackNavigator({
    id,
    initialRouteName,
    children,
    layout,
    screenListeners,
    screenOptions,
    screenLayout,
    UNSTABLE_router,
}: Props) {
    const { state, descriptors, navigation, NavigationContent } =
        useNavigationBuilder<
            StackNavigationState<ParamListBase>,
            StackRouterOptions,
            StackActionHelpers<ParamListBase>,
            NeonStackOptions,
            EventMapBase
        >(StackRouter, {
            id,
            initialRouteName,
            children,
            layout,
            screenListeners,
            screenOptions,
            screenLayout,
            UNSTABLE_router,
        });

    const { width } = useWindowDimensions();
    const progress = useSharedValue(1);

    // Popped routes vanish from `descriptors` before their exit slide finishes.
    const cache = useRef<Record<string, Descriptor<NeonStackOptions, any, any>>>({});
    Object.assign(cache.current, descriptors);

    const stateTop = state.routes[state.index].key;
    const [shown, setShown] = useState(stateTop);
    const [tr, setTr] = useState<Transition | null>(null);
    const prevKeys = useRef(state.routes.map((r) => r.key));
    const swipeCommitted = useRef<string | null>(null);

    const finish = (to: string) => {
        setTr(null);
        setShown(to);
        const live = new Set(state.routes.map((r) => r.key));
        for (const k of Object.keys(cache.current)) {
            if (!live.has(k) && k !== to) delete cache.current[k];
        }
    };

    useLayoutEffect(() => {
        const keys = state.routes.map((r) => r.key);
        const wasInStack = prevKeys.current.includes(stateTop);
        prevKeys.current = keys;

        const from = tr && !tr.interactive ? tr.to : shown;
        if (swipeCommitted.current === stateTop) {
            swipeCommitted.current = null;
            finish(stateTop);
            return;
        }
        if (stateTop === from) return;

        const next: Transition = {
            from,
            to: stateTop,
            dir: wasInStack ? "back" : "forward",
        };
        setTr(next);
        cancelAnimation(progress);
        progress.value = withSequence(
            withTiming(0, { duration: 0 }),
            withTiming(1, { duration: DURATION, easing: EASE }, (done) => {
                if (done) scheduleOnRN(finish, next.to);
            }),
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stateTop]);

    // ── Edge swipe-back: the finger drives the same progress the animation does ──
    const prevKey = state.index > 0 ? state.routes[state.index - 1].key : null;
    const canSwipe =
        !tr &&
        prevKey !== null &&
        descriptors[shown]?.options.gestureEnabled !== false;

    const beginSwipe = () => {
        if (prevKey) setTr({ from: shown, to: prevKey, dir: "back", interactive: true });
    };
    const commitSwipe = () => {
        swipeCommitted.current = prevKey;
        navigation.dispatch({
            ...StackActions.pop(),
            source: shown,
            target: state.key,
        });
    };
    const cancelSwipe = () => setTr(null);

    const pan = Gesture.Pan()
        .enabled(canSwipe)
        .hitSlop({ left: 0, width: EDGE_WIDTH })
        .activeOffsetX(10)
        .failOffsetY([-20, 20])
        .onStart(() => {
            cancelAnimation(progress);
            progress.value = 0;
            scheduleOnRN(beginSwipe);
        })
        .onUpdate((e) => {
            // Keeps the outgoing screen exactly under the finger.
            const p = e.translationX / (width + SCREEN_GAP);
            progress.value = p < 0 ? 0 : p > 1 ? 1 : p;
        })
        .onEnd((e) => {
            const commit =
                e.translationX > width * SWIPE_COMMIT_FRACTION ||
                e.velocityX > SWIPE_COMMIT_VELOCITY;
            progress.value = withTiming(
                commit ? 1 : 0,
                { duration: 220, easing: Easing.out(Easing.cubic) },
                (done) => {
                    if (done) scheduleOnRN(commit ? commitSwipe : cancelSwipe);
                },
            );
        });

    const roleOf = (key: string): Role => {
        if (tr) {
            if (key === tr.to) return "in";
            if (key === tr.from) return "out";
            return "hidden";
        }
        return key === shown ? "top" : "hidden";
    };

    const keys = state.routes.map((r) => r.key);
    for (const k of [shown, tr?.from, tr?.to]) {
        if (k && !keys.includes(k) && cache.current[k]) keys.push(k);
    }

    return (
        <NavigationContent>
            <GestureDetector gesture={pan}>
                <View style={styles.fill}>
                    {keys.map((key) => {
                        const descriptor = descriptors[key] ?? cache.current[key];
                        if (!descriptor) return null;
                        return (
                            <ScreenLayer
                                key={key}
                                role={roleOf(key)}
                                dir={tr?.dir ?? "forward"}
                                progress={progress}
                                width={width}
                            >
                                {descriptor.render()}
                            </ScreenLayer>
                        );
                    })}
                </View>
            </GestureDetector>
        </NavigationContent>
    );
}

const styles = StyleSheet.create({
    fill: { flex: 1 },
});

const NeonStackNavigatorComponent = createNavigatorFactory(NeonStackNavigator)().Navigator;

/** Expo Router layout navigator: `<NeonStack />` in a `_layout.tsx`. */
export const NeonStack = withLayoutContext<
    NeonStackOptions,
    typeof NeonStackNavigatorComponent,
    StackNavigationState<ParamListBase>,
    EventMapBase
>(NeonStackNavigatorComponent);
