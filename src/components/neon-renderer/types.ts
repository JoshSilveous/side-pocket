import type { RefObject } from "react";
import type { View } from "react-native";
import type { SharedValue } from "react-native-reanimated";

export type LightSource = {
  id: string;
  /** Center X in NeonRenderer's coordinate space */
  x: number;
  /** Center Y in NeonRenderer's coordinate space */
  y: number;
  /** Red channel 0–1 */
  r: number;
  /** Green channel 0–1 */
  g: number;
  /** Blue channel 0–1 */
  b: number;
  /** Overall intensity 0–1 — the *registered* value. Live intensity (flicker/slider) lives in `intensityShared`. */
  intensity: number;
  /** Falloff radius in pixels */
  radius: number;
};

export type NeonRendererContextValue = {
  /** Ref to the NeonRenderer's root View — used by children for measureLayout */
  containerRef: RefObject<View | null>;
  registerLight: (source: LightSource) => void;
  /** Update only colour on an existing light — skips native measure(), much faster */
  updateLight: (id: string, updates: Pick<LightSource, "r" | "g" | "b">) => void;
  unregisterLight: (id: string) => void;
  lights: LightSource[];
  /**
   * Reanimated mirror of the structural light list (position/colour/radius).
   * Consumed by UI-thread worklets (dust + brick) so lighting updates without a
   * React re-render. Written from JS whenever the React `lights` state changes.
   */
  lightsShared: SharedValue<LightSource[]>;
  /**
   * Per-light *live* intensity keyed by light id. Written on the UI thread from a
   * brightness SharedValue (flicker/slider) so brightness never round-trips through
   * React. Consumers fall back to `LightSource.intensity` when an id is absent.
   */
  intensityShared: SharedValue<Record<string, number>>;
};
