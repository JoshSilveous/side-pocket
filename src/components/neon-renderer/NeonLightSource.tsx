import {
  useCallback,
  useEffect,
  useId,
  useRef,
} from "react";
import { View, type ViewProps } from "react-native";

import { useNeonRenderer } from "./NeonRendererContext";
import { hueToRgb } from "./utils";

type Props = ViewProps & {
  /** Hue 0–360 — should match the NeonTube/NeonButton inside */
  hue: number;
  /** Brightness 0–1. Default: 1 */
  brightness?: number;
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

  const lightParamsRef = useRef({ r, g, b, brightness, radiusMultiplier });
  lightParamsRef.current = { r, g, b, brightness, radiusMultiplier };

  const measureAndRegister = useCallback(() => {
    const rdr = rendererRef.current;
    if (!rdr || !viewRef.current) return;

    const { r: lr, g: lg, b: lb, brightness: lbright, radiusMultiplier: lrm } = lightParamsRef.current;

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

        rdr.registerLight({ id, x: cx, y: cy, r: lr, g: lg, b: lb, intensity: lbright, radius });
      });
    });
  }, [id]);

  // Full measure + register on mount (needs layout to know position)
  useEffect(() => {
    measureAndRegister();
  }, [measureAndRegister]);

  // Colour/brightness changed — update intensity & colour without re-measuring.
  // This skips the async native measure() call, making slider drags smooth.
  useEffect(() => {
    const rdr = rendererRef.current;
    if (!rdr) return;
    rdr.updateLight(id, { r, g, b, intensity: brightness });
  }, [r, g, b, brightness, id]);

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
