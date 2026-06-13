import {
  useCallback,
  useEffect,
  useId,
  useRef,
} from "react";
import { View, type ViewProps } from "react-native";
import {
  useAnimatedReaction,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import { useNeonRenderer } from "./NeonRendererContext";
import { hueToRgb } from "./utils";

type Props = ViewProps & {
  /** Hue 0–360 — should match the NeonTube/NeonButton inside */
  hue: number;
  /**
   * Brightness 0–1. Pass a Reanimated `SharedValue<number>` (recommended) so
   * brightness/flicker updates the wall + dust lighting on the UI thread without
   * a React re-render. A plain number also works for static lights. Default: 1
   */
  brightness?: number | SharedValue<number>;
  /**
   * Light radius as a multiplier on the component's bounding-box diagonal.
   * Larger = light spreads further across the brick wall. Default: 2.2
   */
  radiusMultiplier?: number;
};

export function NeonLightSource({
  hue,
  brightness = 1,
  radiusMultiplier = 2.2,
  children,
  style,
  ...rest
}: Props) {
  const renderer = useNeonRenderer();
  const viewRef = useRef<View>(null);
  const id = useId();

  const [r, g, b] = hueToRgb(hue);

  const rendererRef = useRef(renderer);
  rendererRef.current = renderer;

  // Normalise brightness to a single SharedValue — the UI-thread source of truth.
  const internalBrightness = useSharedValue(
    typeof brightness === "number" ? brightness : 1
  );
  const bv: SharedValue<number> =
    brightness !== undefined && typeof brightness !== "number"
      ? brightness
      : internalBrightness;
  useEffect(() => {
    if (typeof brightness === "number") internalBrightness.value = brightness;
  }, [brightness, internalBrightness]);

  const lightParamsRef = useRef({ r, g, b, radiusMultiplier });
  lightParamsRef.current = { r, g, b, radiusMultiplier };

  const measureAndRegister = useCallback(() => {
    const rdr = rendererRef.current;
    if (!rdr || !viewRef.current) return;

    const { r: lr, g: lg, b: lb, radiusMultiplier: lrm } = lightParamsRef.current;

    // Use measure() + container measure() to get relative position.
    // More reliable than measureLayout() on new arch (RN 0.73+).
    viewRef.current.measure((_, __, w, h, pageX, pageY) => {
      if (w === 0 && h === 0) return; // not yet laid out

      const containerView = rdr.containerRef.current;
      if (!containerView) return;

      containerView.measure((_, __, _cw, _ch, containerPageX, containerPageY) => {
        const relX = pageX - containerPageX;
        const relY = pageY - containerPageY;
        const cx = relX + w / 2;
        const cy = relY + h / 2;
        const radius = Math.sqrt(w * w + h * h) * lrm;

        rdr.registerLight({ id, x: cx, y: cy, r: lr, g: lg, b: lb, intensity: bv.value, radius });
      });
    });
  }, [id, bv]);

  // Full measure + register on mount (needs layout to know position)
  useEffect(() => {
    measureAndRegister();
  }, [measureAndRegister]);

  // Colour changed — update colour without re-measuring (skips async native measure()).
  useEffect(() => {
    rendererRef.current?.updateLight(id, { r, g, b });
  }, [r, g, b, id]);

  // Brightness/flicker → push live intensity into the shared buffer on the UI
  // thread. No React state, so slider drags + flicker never trigger a re-render.
  const intensityShared = renderer?.intensityShared ?? null;
  useAnimatedReaction(
    () => bv.value,
    (v) => {
      "worklet";
      if (!intensityShared) return;
      intensityShared.value = { ...intensityShared.value, [id]: v };
    },
    [id, intensityShared]
  );

  useEffect(() => {
    return () => { rendererRef.current?.unregisterLight(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View ref={viewRef} style={style} onLayout={measureAndRegister} {...rest}>
      {children}
    </View>
  );
}
