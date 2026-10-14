import type { View } from "react-native";
import type { AnimatedRef, SharedValue } from "react-native-reanimated";

/** Frame id for lights that aren't inside any <LightFrame> (scroll-only space). */
export const ROOT_FRAME = "root";

export type LightSource = {
  id: string;
  /** The <LightFrame> these emitters live in (ROOT_FRAME when none). */
  frameId: string;
  /**
   * Emitter points sampled along the tube path, flattened as `[x0, y0, x1, y1, …]`
   * in the owning frame's **local, untransformed** coordinates. Light emanates from
   * these points — never a centroid — so hollow shapes stay dark in the middle.
   * Consumers map them to screen space with the frame's live world transform.
   */
  emitters: number[];
  /** Red channel 0–1 */
  r: number;
  /** Green channel 0–1 */
  g: number;
  /** Blue channel 0–1 */
  b: number;
  /** Registered power. Live power (flicker/slider) lives in `intensityShared`. */
  intensity: number;
  /**
   * Marks one tube of a dense multi-tube sign: its total wall wash is
   * `power × wallGain` (many overlap, so each is damped) and it only gets the
   * wall emitter budget left after regular lights. Omit for buttons/text.
   */
  wallGain?: number;
};

/**
 * Live local → screen mapping of a <LightFrame>: `screen = (ox, oy) + s * local`.
 * `a` is the frame's accumulated opacity (multiplies light power). `ready` is
 * false until the frame has been measured once.
 */
export type FrameWorld = {
  ox: number;
  oy: number;
  s: number;
  a: number;
  ready: boolean;
};

export type NeonRendererContextValue = {
  /** Animated ref to the renderer's root View — the origin of screen space. */
  containerRef: AnimatedRef<View>;
  registerLight: (source: LightSource) => void;
  /** Update only colour on an existing light — skips re-measuring. */
  updateLight: (id: string, updates: Pick<LightSource, "r" | "g" | "b">) => void;
  unregisterLight: (id: string) => void;
  /** UI-thread mirror of the structural light list (geometry + colour). */
  lightsShared: SharedValue<LightSource[]>;
  /** Live power per light id, written on the UI thread (flicker/slider/press). */
  intensityShared: SharedValue<Record<string, number>>;
  /** Live vertical scroll of root-space content (px). */
  scrollShared: SharedValue<number>;
  /** Live world transform per <LightFrame> id. Mutated in place. */
  framesShared: SharedValue<Record<string, FrameWorld>>;
  /** Bumped whenever any frame moves — lets throttled consumers skip their cap. */
  framesVersion: SharedValue<number>;
};
