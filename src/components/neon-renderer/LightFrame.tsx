import { createContext, useCallback, useContext, useEffect, useId } from "react";
import type { LayoutChangeEvent, View, ViewProps } from "react-native";
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
  ref: AnimatedRef<View>;
  world: SharedValue<FrameWorld>;
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

type Props = ViewProps & {
  translateX?: Animatable;
  translateY?: Animatable;
  /** Uniform scale around the frame's centre. */
  scale?: Animatable;
  /** Multiplies both the content's opacity and the light it casts. */
  opacity?: Animatable;
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
  style,
  onLayout,
  children,
  ...rest
}: Props) {
  "use no memo";
  const renderer = useNeonRenderer();
  const parent = useLightFrame();
  const id = useId();
  const ref = useAnimatedRef<View>();

  const tx = useAnimatable(translateX, 0);
  const ty = useAnimatable(translateY, 0);
  const sc = useAnimatable(scale, 1);
  const op = useAnimatable(opacity, 1);

  // Untransformed layout size + top-left in the parent frame's local space.
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
    return {
      ox: P.ox + P.s * (b.x + cx + tx.value - s * cx),
      oy: P.oy + P.s * (b.y + cy + ty.value - s * cy),
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

  // Solve for `base` from where the frame actually is right now: measured
  // top-left = parentOrigin + parentScale·(base + c + t − s·c). Measuring and
  // reading the transform in one UI tick keeps this exact even mid-animation.
  const solveBase = useCallback(
    (w: number, h: number) => {
      if (!containerRef) return;
      scheduleOnUI(() => {
        "worklet";
        size.value = { w, h };
        const m = measure(ref);
        const c = measure(containerRef);
        if (!m || !c) return;
        let px = 0;
        let py = -(scroll?.value ?? 0);
        let ps = 1;
        if (parentRef && parentWorld) {
          const pm = measure(parentRef);
          if (!pm) return;
          px = pm.pageX - c.pageX;
          py = pm.pageY - c.pageY;
          ps = parentWorld.value.s;
        }
        const s = sc.value;
        const cx = w / 2;
        const cy = h / 2;
        base.value = {
          x: (m.pageX - c.pageX - px) / ps - cx - tx.value + s * cx,
          y: (m.pageY - c.pageY - py) / ps - cy - ty.value + s * cy,
        };
      });
    },
    [containerRef, parentRef, parentWorld, scroll, ref, size, base, sc, tx, ty],
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

  return (
    <LightFrameContext.Provider value={{ id, ref, world }}>
      <Animated.View
        ref={ref}
        style={[style, animatedStyle]}
        onLayout={handleLayout}
        {...rest}
      >
        {children}
      </Animated.View>
    </LightFrameContext.Provider>
  );
}
