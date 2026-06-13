import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useSharedValue, type SharedValue } from "react-native-reanimated";

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
  /**
   * Live vertical scroll offset (px) of the surrounding ScrollView. Pass a
   * Reanimated `SharedValue` (e.g. from `useScrollOffset`) so the neon lighting on
   * the wall + dust tracks the buttons as they scroll, on the UI thread. The brick
   * and dust textures themselves stay fixed.
   */
  scrollOffset?: SharedValue<number>;
};

/**
 * Root renderer wrapper.
 *
 * Place this as the direct child of a ScrollView (or at the root of a screen).
 * The brick background, dust particles, and registered neon lights all share the
 * same coordinate space — so scrolling, lighting, and depth all stay in sync
 * without any JS scroll-tracking state.
 *
 * @example
 * // Scrollable screen — NeonRenderer IS the scroll content:
 * <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
 *   <NeonRenderer wallTextures={...}>
 *     <NeonLightSource hue={160} brightness={b}>
 *       <NeonButton ...>Start Game</NeonButton>
 *     </NeonLightSource>
 *   </NeonRenderer>
 * </ScrollView>
 */
export function NeonRenderer({
  children,
  wallTextures,
  tileCount,
  background = true,
  particles = true,
  scrollOffset,
}: Props) {
  const containerRef = useRef<View>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [lights, setLights] = useState<LightSource[]>([]);

  // Reanimated mirrors of the light list so dust + brick can read lighting on the
  // UI thread without a React re-render. `lightsShared` carries structural data
  // (emitter geometry + colour); `intensityShared` carries live brightness per id.
  const lightsShared = useSharedValue<LightSource[]>([]);
  const intensityShared = useSharedValue<Record<string, number>>({});

  // Scroll offset: use the caller's SharedValue if provided, else a static 0.
  const internalScroll = useSharedValue(0);
  const scrollShared = scrollOffset ?? internalScroll;

  // Keep the structural mirror in sync. Runs only on register/unregister/colour
  // changes (rare) — never on flicker, which writes intensityShared directly.
  useEffect(() => {
    lightsShared.value = lights;
  }, [lights, lightsShared]);

  const registerLight = useCallback((source: LightSource) => {
    setLights((prev) => {
      const filtered = prev.filter((l) => l.id !== source.id);
      return [...filtered, source];
    });
  }, []);

  const updateLight = useCallback(
    (id: string, updates: Pick<LightSource, "r" | "g" | "b">) => {
      setLights((prev) =>
        prev.map((l) => (l.id === id ? { ...l, ...updates } : l))
      );
    },
    []
  );

  const unregisterLight = useCallback(
    (id: string) => {
      setLights((prev) => prev.filter((l) => l.id !== id));
      const next = { ...intensityShared.value };
      delete next[id];
      intensityShared.value = next;
    },
    [intensityShared]
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  }, []);

  const ready = size.width > 0 && size.height > 0;

  return (
    <NeonRendererContext.Provider
      value={{
        containerRef,
        registerLight,
        updateLight,
        unregisterLight,
        lights,
        lightsShared,
        intensityShared,
        scrollShared,
      }}
    >
      <View ref={containerRef} style={styles.container} onLayout={onLayout}>
        {/* ── Layer 0: brick background ── */}
        {ready && background && (
          <BrickBackground
            lightsShared={lightsShared}
            intensityShared={intensityShared}
            scrollShared={scrollShared}
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
            lightsShared={lightsShared}
            intensityShared={intensityShared}
            scrollShared={scrollShared}
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
