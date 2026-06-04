import {
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";

import { BrickBackground, type WallTextures } from "./BrickBackground";
import { DustParticles } from "./DustParticles";
import { NeonRendererContext } from "./NeonRendererContext";
import type { LightSource } from "./types";

type Props = {
  children: ReactNode;
  /**
   * Brick wall textures. Provide all three for the full effect.
   * Until these are supplied the background is black (correct for a dark bar).
   *
   * @example
   * wallTextures={{
   *   albedo:       require('@/assets/textures/brick_albedo.png'),
   *   normalMap:    require('@/assets/textures/brick_normal.png'),
   *   roughnessMap: require('@/assets/textures/brick_roughness.png'),
   * }}
   */
  wallTextures?: WallTextures;
  /**
   * How many brick tiles appear across the screen width.
   * Tune to match your texture artwork scale. Default: 4
   */
  tileCount?: number;
  /** Disable the brick background entirely. */
  background?: boolean;
  /** Disable dust particles. */
  particles?: boolean;
};

/**
 * Root renderer wrapper. Place this around a full-screen view.
 *
 * - Renders a brick-wall background lit by registered neon sources.
 * - Renders floating dust particles visible only near neon light.
 * - Provides context so <NeonLightSource> children register themselves.
 *
 * @example
 * <NeonRenderer
 *   wallTextures={{
 *     albedo:       require('@/assets/textures/brick_albedo.png'),
 *     normalMap:    require('@/assets/textures/brick_normal.png'),
 *     roughnessMap: require('@/assets/textures/brick_roughness.png'),
 *   }}
 * >
 *   <NeonLightSource hue={160} brightness={brightnessJs}>
 *     <NeonButton hue={160} brightness={brightness}>Start Game</NeonButton>
 *   </NeonLightSource>
 * </NeonRenderer>
 */
export function NeonRenderer({
  children,
  wallTextures,
  tileCount,
  background = true,
  particles = true,
}: Props) {
  const containerRef = useRef<View>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [lights, setLights] = useState<LightSource[]>([]);

  const registerLight = useCallback((source: LightSource) => {
    setLights((prev) => {
      const filtered = prev.filter((l) => l.id !== source.id);
      return [...filtered, source];
    });
  }, []);

  const updateLight = useCallback(
    (id: string, updates: Pick<LightSource, "r" | "g" | "b" | "intensity">) => {
      setLights((prev) =>
        prev.map((l) => (l.id === id ? { ...l, ...updates } : l))
      );
    },
    []
  );

  const unregisterLight = useCallback((id: string) => {
    setLights((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  }, []);

  const ready = size.width > 0 && size.height > 0;

  return (
    <NeonRendererContext.Provider
      value={{ containerRef, registerLight, updateLight, unregisterLight, lights }}
    >
      <View ref={containerRef} style={styles.container} onLayout={onLayout}>
        {/* ── Layer 0: brick background ── */}
        {ready && background && (
          <BrickBackground
            lights={lights}
            width={size.width}
            height={size.height}
            textures={wallTextures}
            tileCount={tileCount}
          />
        )}

        {/* ── Layer 1: app content ── */}
        {children}

        {/* ── Layer 2: dust particles (above neon tubes) ── */}
        {ready && particles && (
          <DustParticles
            lights={lights}
            width={size.width}
            height={size.height}
          />
        )}
      </View>
    </NeonRendererContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Black baseline — visible if BrickBackground shader fails to compile,
    // and correct aesthetically (dark bar environment).
    backgroundColor: "#000000",
  },
});
