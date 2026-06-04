import { createContext, useContext } from "react";
import type { NeonRendererContextValue } from "./types";

export const NeonRendererContext = createContext<NeonRendererContextValue | null>(null);

/**
 * Access the NeonRenderer context. Throws if called outside of <NeonRenderer>.
 * Returns null-safe stub when outside (for components that can live either inside or outside).
 */
export function useNeonRenderer(): NeonRendererContextValue | null {
  return useContext(NeonRendererContext);
}
