import { useCallback, useEffect, useId, useRef } from "react";
import type { View } from "react-native";
import {
  measure,
  useAnimatedReaction,
  type AnimatedRef,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

import { useLightFrame } from "./LightFrame";
import { useNeonRenderer } from "./NeonRendererContext";
import { ROOT_FRAME, type LightSource } from "./types";

type Options = {
  /** The view the emitters are relative to (its untransformed top-left = 0,0). */
  viewRef: AnimatedRef<View>;
  /** Flat [x0,y0,…] emitter points in the view's own untransformed px. */
  localEmitters: number[] | null;
  rgb: [number, number, number];
  brightness: SharedValue<number>;
  enabled?: boolean;
};

/**
 * Registers a tube/text/sign as a light on the nearest <LightFrame> (or root).
 * Call the returned `register` from the view's onLayout so position changes
 * re-register. Handles colour updates, live power and cleanup.
 */
export function useLightRegistration({
  viewRef,
  localEmitters,
  rgb,
  brightness,
  enabled = true,
}: Options) {
  const id = useId();
  const renderer = useNeonRenderer();
  const frame = useLightFrame();
  const [r, g, b] = rgb;

  const alive = useRef(true);
  const latest = useRef({ renderer, frame, localEmitters, r, g, b, enabled });
  latest.current = { renderer, frame, localEmitters, r, g, b, enabled };

  const register = useCallback(() => {
    const { renderer: rdr, frame: fr, localEmitters: local, enabled: on } =
      latest.current;
    if (!rdr) return;
    if (!on || !local || local.length === 0) {
      rdr.unregisterLight(id);
      return;
    }
    const containerRef = rdr.containerRef;
    const scroll = rdr.scrollShared;
    const frameRef = fr?.ref ?? null;
    const frameWorld = fr?.world ?? null;
    const frameId = fr?.id ?? ROOT_FRAME;
    const commit = (emitters: number[]) => {
      const l = latest.current;
      if (!l.enabled || !alive.current) return;
      const source: LightSource = {
        id,
        frameId,
        emitters,
        r: l.r,
        g: l.g,
        b: l.b,
        intensity: brightness.value,
      };
      rdr.registerLight(source);
    };

    // View position in frame-local space, measured in ONE UI tick together with
    // the frame, so registering mid-animation is exact.
    scheduleOnUI(() => {
      "worklet";
      const m = measure(viewRef);
      const c = measure(containerRef);
      if (!m || !c) return;
      let fx = 0;
      let fy = -scroll.value;
      let fs = 1;
      if (frameRef && frameWorld) {
        const fm = measure(frameRef);
        if (!fm) return;
        fx = fm.pageX - c.pageX;
        fy = fm.pageY - c.pageY;
        fs = frameWorld.value.s;
      }
      const vx = (m.pageX - c.pageX - fx) / fs;
      const vy = (m.pageY - c.pageY - fy) / fs;
      const out: number[] = new Array(local.length);
      for (let i = 0; i < local.length; i += 2) {
        out[i] = vx + local[i];
        out[i + 1] = vy + local[i + 1];
      }
      scheduleOnRN(commit, out);
    });
  }, [id, viewRef, brightness]);

  useEffect(() => {
    register();
  }, [register, localEmitters, enabled, frame?.id]);

  useEffect(() => {
    if (enabled) renderer?.updateLight(id, { r, g, b });
  }, [renderer, enabled, id, r, g, b]);

  const intensityShared = renderer?.intensityShared ?? null;
  useAnimatedReaction(
    () => brightness.value,
    (v) => {
      if (!intensityShared) return;
      intensityShared.modify((intensities) => {
        "worklet";
        intensities[id] = v < 0 ? 0 : v;
        return intensities;
      });
    },
    [id, intensityShared],
  );

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      latest.current.renderer?.unregisterLight(id);
    };
  }, [id]);

  return { register };
}
