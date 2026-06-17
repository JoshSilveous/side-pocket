import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import {
    cancelAnimation,
    makeMutable,
    withDelay,
    withSequence,
    withTiming,
    type SharedValue,
} from "react-native-reanimated";

import { splashArt } from "@/generated/splash-paths";
import { useNeonRenderer } from "../neon-renderer/NeonRendererContext";
import { ColdTubes } from "./ColdTubes";
import { PathLight } from "./PathLight";
import { PathTube } from "./PathTube";
import { lightenHex, scaledSkPath, scaleMatrix } from "./utils";

// ════════════════════════════════════════════════════════════════════════════
//  CONFIG — tweak the sign here.
// ════════════════════════════════════════════════════════════════════════════

/** The artwork. `paths` are SVG path strings in `viewBox` coords, in draw order. */
const SIGN = splashArt;

/** Default tube colour for any path not overridden below. */
const DEFAULT_COLOR = "#ba1616";

/**
 * Per-path colour overrides, keyed by index (= draw order in splash.svg: the
 * "SIDE POCKET" letters come first, then the pool cue + accent lines). Anything
 * not listed uses DEFAULT_COLOR.
 *
 *   const PATH_COLORS = { 0: "#39ff14", 5: "#1e90ff", 14: "#ffd400" };
 */
const STICK_BUTT_COLOR = "#ffc31e";
const STICK_MID_COLOR = "#ff8f1e";
const STICK_LONG_COLOR = "#ffc31e";
const STICK_TIP_COLOR = "#148dff";

const PATH_COLORS = {
    18: STICK_BUTT_COLOR,
    19: STICK_BUTT_COLOR,
    20: STICK_BUTT_COLOR,
    21: STICK_MID_COLOR,
    22: STICK_TIP_COLOR,
    29: STICK_LONG_COLOR,
    30: STICK_LONG_COLOR,
};

/** Power-on timing. Each tube waits a random delay in this range, then flickers on. */
const POWER_ON_MIN_DELAY_MS = 0;
const POWER_ON_MAX_DELAY_MS = 1000;

/**
 * Staged "false start": when power-on is triggered, the whole animation restarts
 * after each of these gaps (ms) before the final run is allowed to play out. This
 * recreates the effect of tapping POWER ON a few times in quick succession — the
 * sign begins to appear, cuts out, and restarts a couple times before settling on.
 * Set to [] for a single clean power-on.
 */
const POWER_ON_RESTART_GAPS_MS = [367, 292];

/**
 * The per-tube "power on" animation: brightness 0 → 1 with a couple of brief
 * flickers, like a tube warming up. Edit the steps to taste.
 */
function powerOnAnimation() {
    return withSequence(
        withTiming(0.55, { duration: 70 }), // first surge
        withTiming(0.05, { duration: 60 }), // flicker off
        withTiming(0.9, { duration: 70 }), // surge again
        withTiming(0.18, { duration: 50 }), // brief dip
        withTiming(1, { duration: 160 }), // settle fully on
    );
}

// ════════════════════════════════════════════════════════════════════════════

const PAD = 32; // glow padding around the sign (px)

export type SidePocketNeonHandle = {
    /** Replay the power-on animation (random per-tube delays + flicker). */
    powerOn: () => void;
    /** Snap every tube to a fixed brightness (0..1) with no animation. */
    setBrightness: (value: number) => void;
};

type Props = {
    /** Target on-screen width (px). Height follows the art's aspect ratio. */
    width: number;
    /** Tube thickness (screen px). */
    tubeWidth?: number;
    /** Play the power-on animation automatically on mount. Default: true. */
    autoPlay?: boolean;
    style?: StyleProp<ViewStyle>;
};

/**
 * The Side Pocket neon sign. Each tube is an individual path with its own colour
 * (PATH_COLORS) and its own brightness SharedValue, which also drives that tube's
 * wall + dust light. The sign animates "on" on mount and can be replayed via the
 * `powerOn()` handle (see the ref below).
 *
 * Architecture note: the shared <Canvas> contains only pure Skia <PathTube>s
 * (RN Skia's canvas reconciler can't run hooks/context). The matching <PathLight>s
 * live in the normal React tree and register each tube as a NeonRenderer light.
 */
export const SidePocketNeon = forwardRef<SidePocketNeonHandle, Props>(
    function SidePocketNeon(
        { width, tubeWidth = 4, autoPlay = true, style },
        ref,
    ) {
        const renderer = useNeonRenderer();
        const rendererRef = useRef(renderer);
        rendererRef.current = renderer;
        const viewRef = useRef<View>(null);
        const restartTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
        const [origin, setOrigin] = useState<{ x: number; y: number } | null>(
            null,
        );

        const scale = width / SIGN.viewBox.width;
        const signW = SIGN.viewBox.width * scale;
        const signH = SIGN.viewBox.height * scale;

        // Parse + scale each path once.
        const scaled = useMemo(() => {
            const matrix = scaleMatrix(scale);
            return SIGN.paths.map((d) => scaledSkPath(d, matrix));
        }, [scale]);

        // Per-tube colours (+ a lightened warm core), resolved from PATH_COLORS.
        const colors = useMemo(
            () => SIGN.paths.map((_, i) => PATH_COLORS[i] ?? DEFAULT_COLOR),
            [],
        );
        const warmColors = useMemo(
            () => colors.map((c) => lightenHex(c, 0.6)),
            [colors],
        );

        // One brightness SharedValue per tube. makeMutable (not useSharedValue) so we
        // can have N of them without calling a hook in a loop. Drives both the tube
        // glow opacity and the wall/dust light intensity.
        const brightness = useMemo<SharedValue<number>[]>(
            () => SIGN.paths.map(() => makeMutable(autoPlay ? 0 : 1)),
            // Count is fixed; created once.
            // eslint-disable-next-line react-hooks/exhaustive-deps
            [],
        );

        // ── Imperative controls (used by the temp button on the splash screen) ──

        // Cancel any pending staged restarts from a previous trigger.
        const clearRestarts = useCallback(() => {
            restartTimers.current.forEach(clearTimeout);
            restartTimers.current = [];
        }, []);

        // One full power-on pass: reset to off, then each tube flickers on after a
        // random delay.
        const runPowerOnOnce = useCallback(() => {
            brightness.forEach((sv) => {
                cancelAnimation(sv);
                sv.value = 0;
                const delay =
                    POWER_ON_MIN_DELAY_MS +
                    Math.random() *
                        (POWER_ON_MAX_DELAY_MS - POWER_ON_MIN_DELAY_MS);
                sv.value = withDelay(delay, powerOnAnimation());
            });
        }, [brightness]);

        // Staged "false start": run now, then restart after each gap, then let the
        // final pass play out (see POWER_ON_RESTART_GAPS_MS).
        const powerOn = useCallback(() => {
            clearRestarts();
            runPowerOnOnce();
            let elapsed = 0;
            for (const gap of POWER_ON_RESTART_GAPS_MS) {
                elapsed += gap;
                restartTimers.current.push(setTimeout(runPowerOnOnce, elapsed));
            }
        }, [clearRestarts, runPowerOnOnce]);

        const setBrightness = useCallback(
            (value: number) => {
                clearRestarts();
                brightness.forEach((sv) => {
                    cancelAnimation(sv);
                    sv.value = value;
                });
            },
            [brightness, clearRestarts],
        );

        useImperativeHandle(ref, () => ({ powerOn, setBrightness }), [
            powerOn,
            setBrightness,
        ]);

        // Play (or skip) the animation on mount; cancel timers + anims on unmount.
        useEffect(() => {
            if (autoPlay) powerOn();
            else setBrightness(1);
            return () => {
                clearRestarts();
                brightness.forEach((sv) => cancelAnimation(sv));
            };
        }, [autoPlay, powerOn, setBrightness, brightness, clearRestarts]);

        // Measure the sign's position so each tube's light emitters land on its
        // tubes. rendererRef avoids a re-register loop (the renderer context object
        // changes on every light registration).
        const measure = useCallback(() => {
            const rdr = rendererRef.current;
            const v = viewRef.current;
            if (!rdr || !v) return;
            const container = rdr.containerRef.current;
            if (!container) return;
            v.measure((_, __, w, h, pageX, pageY) => {
                if (w === 0 && h === 0) return;
                container.measure((___, ____, _cw, _ch, cPageX, cPageY) => {
                    const nx = pageX - cPageX;
                    const ny = pageY - cPageY;
                    setOrigin((prev) =>
                        prev && prev.x === nx && prev.y === ny
                            ? prev
                            : { x: nx, y: ny },
                    );
                });
            });
        }, []);

        // Drawn content origin = View top-left + glow pad. Memoised so PathLight's
        // effect doesn't re-fire (and re-register) on every render.
        const lightOrigin = useMemo(
            () => (origin ? { x: origin.x + PAD, y: origin.y + PAD } : null),
            [origin],
        );

        return (
            <View
                ref={viewRef}
                onLayout={measure}
                pointerEvents="none"
                style={[
                    { width: signW + PAD * 2, height: signH + PAD * 2 },
                    style,
                ]}
            >
                {/* Unlit glass tubes — always visible (powered-off look) in one canvas. */}
                <ColdTubes
                    paths={scaled}
                    contentPad={PAD}
                    tubeWidth={tubeWidth}
                />

                {/* One small canvas per tube; brightness animates its Animated.View. */}
                {scaled.map((p, i) => (
                    <PathTube
                        key={`tube-${i}`}
                        skPath={p}
                        contentPad={PAD}
                        color={colors[i]}
                        warmColor={warmColors[i]}
                        tubeWidth={tubeWidth}
                        brightness={brightness[i]}
                    />
                ))}

                {/* Headless per-tube lights (normal React tree — effects run here). */}
                {scaled.map((p, i) => (
                    <PathLight
                        key={`light-${i}`}
                        skPath={p}
                        origin={lightOrigin}
                        color={colors[i]}
                        brightness={brightness[i]}
                        enabled
                    />
                ))}
            </View>
        );
    },
);
