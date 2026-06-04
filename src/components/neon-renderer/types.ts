import type { RefObject } from "react";
import type { View } from "react-native";

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
  /** Overall intensity 0–1 */
  intensity: number;
  /** Falloff radius in pixels */
  radius: number;
};

export type NeonRendererContextValue = {
  /** Ref to the NeonRenderer's root View — used by children for measureLayout */
  containerRef: RefObject<View>;
  registerLight: (source: LightSource) => void;
  /** Update only colour/intensity on an existing light — skips native measure(), much faster */
  updateLight: (id: string, updates: Pick<LightSource, "r" | "g" | "b" | "intensity">) => void;
  unregisterLight: (id: string) => void;
  lights: LightSource[];
};
