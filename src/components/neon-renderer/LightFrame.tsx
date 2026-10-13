import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
} from "react";
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import Animated, {
  measure,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type AnimatedRef,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnUI } from "react-native-worklets";

import { useNeonRenderer } from "./NeonRendererContext";
import type { FrameWorld } from "./types";

type Animatable = number | SharedValue<number>;

export type LightFrameContextValue = {
  id: string;
  /** The transformed (inner) view — its top-left is the frame's local origin. */
  ref: AnimatedRef<View>;
  world: SharedValue<FrameWorld>;
  /** Untransformed layout size. */
  size: SharedValue<{ w: number; h: number }>;
};

const LightFrameContext = createContext<LightFrameContextValue | null>(null);

/** The nearest enclosing <LightFrame>, or null when lights live in root space. */
export function useLightFrame(): LightFrameContextValue | null {
  return useContext(LightFrameContext);
}

function useAnimatable(v: Animatable | undefined, fallback: number): SharedValue<number> {
  const own = useSharedValue(typeof v === "number" ? v : fallback);
  useEffect(() => {
    if (typeof v === "number") own.value = v;
  }, [v, own]);
  return v !== undefined && typeof v !== "number" ? v : own;
}

// Styles that lay out / paint the children go on the transformed inner view;
// everything else (size, position, margins, flex) stays on the static outer view.
const INNER_KEYS = new Set([
  "flexDirection",
  "flexWrap",
  "justifyContent",
  "alignItems",
  "alignContent",
  "gap",
  "rowGap",
  "columnGap",
  "backgroundColor",
  "overflow",
  "elevation",
  "direction",
  "transform",
]);
const isInnerKey = (k: string) =>
  INNER_KEYS.has(k) ||
  k.startsWith("padding") ||
  k.startsWith("border") ||
  k.startsWith("shadow");

function splitStyle(style: StyleProp<ViewStyle>): [ViewStyle, ViewStyle] {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const k in flat) (isInnerKey(k) ? inner : outer)[k] = flat[k];
  return [outer as ViewStyle, inner as ViewStyle];
}

type Props = ViewProps & {
  translateX?: Animatable;
  translateY?: Animatable;
  /** Uniform scale around the frame's centre. */
  scale?: Animatable;
  /** Multiplies both the content's opacity and the light it casts. */
  opacity?: Animatable;
  /**
   * Native scroll offset of a ScrollView this frame sits inside (e.g. from
   * `useScrollOffset`). Tracked for lighting only — the ScrollView moves the content.
   */
  scrollY?: SharedValue<number>;
};

/**
 * A moving container whose neon lights move with it.
 *
 * Wrap anything that slides, scales or fades (screens during a transition, wheel
 * rows, a dragged chip). Drive it with SharedValues: the same values move the
 * content AND the light it casts on the wall/dust in the same UI frame, so glow
 * can never lag its tube. Frames nest. Translate + uniform scale only.
 */
export function LightFrame({
  translateX,
  translateY,
  scale,
  opacity,
  scrollY,
  style,
  onLayout,
  children,
  ...rest
}: Props) {
  "use no memo";
  const renderer = useNeonRenderer();
  const parent = useLightFrame();
  const id = useId();
  const outerRef = useAnimatedRef<View>();
  const ref = useAnimatedRef<View>();

  const tx = useAnimatable(translateX, 0);
  const ty = useAnimatable(translateY, 0);
  const sc = useAnimatable(scale, 1);
  const op = useAnimatable(opacity, 1);

  // Untransformed size + top-left in the parent frame's local space.
  const size = useSharedValue({ w: 0, h: 0 });
  const base = useSharedValue<{ x: number; y: number } | null>(null);

  const scroll = renderer?.scrollShared;
  const parentWorld = parent?.world;

  const world = useDerivedValue<FrameWorld>(() => {
    const P: FrameWorld = parentWorld
      ? parentWorld.value
      : { ox: 0, oy: -(scroll?.value ?? 0), s: 1, a: 1, ready: true };
    const s = sc.value;
    const ws = P.s * s;
    const a = P.a * op.value;
    const b = base.value;
    if (!b || !P.ready) return { ox: 0, oy: 0, s: ws, a, ready: false };
    // RN scales around the centre: local p → base + c + t + s·(p − c).
    const cx = size.value.w / 2;
    const cy = size.value.h / 2;
    const sy = scrollY ? scrollY.value : 0;
    return {
      ox: P.ox + P.s * (b.x + cx + tx.value - s * cx),
      oy: P.oy + P.s * (b.y + cy + ty.value - sy - s * cy),
      s: ws,
      a,
      ready: true,
    };
  });

  const framesShared = renderer?.framesShared;
  const framesVersion = renderer?.framesVersion;
  useAnimatedReaction(
    () => world.value,
    (w) => {
      if (!framesShared || !framesVersion) return;
      framesShared.modify((m) => {
        "worklet";
        m[id] = w;
        return m;
      });
      framesVersion.value += 1;
    },
    [id],
  );

  useEffect(() => {
    return () => {
      framesShared?.modify((m) => {
        "worklet";
        delete m[id];
        return m;
      });
    };
  }, [framesShared, id]);

  const containerRef = renderer?.containerRef;
  const parentRef = parent?.ref;
  const parentSize = parent?.size;

  // The outer view never carries this frame's transform, so measuring it (and the
  // parent's origin) in one UI tick gives `base` from measurements alone — no
  // mixing with a transform SharedValue that may be a frame ahead of the view.
  const solveBase = useCallback(
    (w: number, h: number) => {
      if (!containerRef) return;
      scheduleOnUI(() => {
        "worklet";
        size.value = { w, h };
        const m = measure(outerRef);
        const c = measure(containerRef);
        if (!m || !c) return;
        let px = 0;
        let py = -(scroll?.value ?? 0);
        let ps = 1;
        if (parentRef && parentSize) {
          const pm = measure(parentRef);
          if (!pm) return;
          px = pm.pageX - c.pageX;
          py = pm.pageY - c.pageY;
          const pw = parentSize.value.w;
          ps = pw > 0 ? pm.width / pw : 1;
        }
        const sy = scrollY ? scrollY.value : 0;
        base.value = {
          x: (m.pageX - c.pageX - px) / ps,
          y: (m.pageY - c.pageY - py) / ps + sy,
        };
      });
    },
    [containerRef, parentRef, parentSize, scroll, scrollY, outerRef, size, base],
  );

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      solveBase(width, height);
      onLayout?.(e);
    },
    [solveBase, onLayout],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: sc.value },
    ],
  }));

  const [outerStyle, innerStyle] = useMemo(() => splitStyle(style), [style]);
  // Only stretch the inner view when the outer has a set size. An auto-sized
  // outer with a flexGrow child balloons to all available space (Yoga quirk).
  const fills = useMemo(() => {
    const o = outerStyle;
    return (
      o.height != null ||
      o.minHeight != null ||
      o.flex != null ||
      o.flexGrow != null ||
      o.flexBasis != null ||
      (o.position === "absolute" && o.top != null && o.bottom != null)
    );
  }, [outerStyle]);
  const ctx = useMemo(() => ({ id, ref, world, size }), [id, ref, world, size]);

  return (
    <LightFrameContext.Provider value={ctx}>
      <View ref={outerRef} style={outerStyle} onLayout={handleLayout} {...rest}>
        <Animated.View
          ref={ref}
          style={[fills && styles.fill, innerStyle, animatedStyle]}
        >
          {children}
        </Animated.View>
      </View>
    </LightFrameContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { flexGrow: 1 },
});
