import {
    BlurMask,
    Canvas,
    Group,
    Paint,
    Path,
    Skia,
} from "@shopify/react-native-skia";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
    SharedValue,
    useAnimatedStyle,
    useDerivedValue,
    useSharedValue,
} from "react-native-reanimated";

/**
 * `brightness` behaves like power to a real neon tube:
 *   0   = off (no glow, just the cold glass)
 *   1   = rated / normal full glow
 *   >1  = overdriven — the bloom reaches further, like it's being pushed past spec
 * Bloom reach scales linearly with brightness up to this cap (keeps blur sane).
 */
const BLOOM_REACH_MAX = 3;

export type NeonTubeProps = {
    path: string;
    width: number;
    height: number;
    color?: string;
    warmColor?: string;
    /** Tube thickness in screen px. Everything else scales off this. */
    tubeWidth?: number;
    /**
     * Glow spread multiplier. Scales all the soft blur radii (bloom/halo/body/
     * warm/hot) without touching tube thickness. 1 = stock splash-logo look,
     * >1 = wider/softer glow, <1 = tighter.
     */
    glow?: number;
    brightness?: SharedValue<number> | number;
    innerGlow?: boolean;
    glowPadding?: number;
};

export function NeonTube({
    path: pathStr,
    width,
    height,
    color = "#ff2020",
    warmColor = "#ff9999",
    tubeWidth = 12,
    glow = 1,
    brightness,
    innerGlow = true,
    glowPadding = 40,
}: NeonTubeProps) {
    const staticBrightness = useSharedValue(
        typeof brightness === "number" ? brightness : 1,
    );
    const activeBrightness: SharedValue<number> =
        brightness !== undefined && typeof brightness !== "number"
            ? brightness
            : staticBrightness;

    const skPath = useMemo(() => {
        const parsed = Skia.Path.MakeFromSVGString(pathStr);
        return parsed ?? Skia.Path.Make();
    }, [pathStr]);

    // Opacity carries the 0→100% fade-in (off → fully lit). Past 100% it stays
    // pinned at 1 — the "overdriven" look comes from bloom reach below, not alpha.
    const canvasAnimatedStyle = useAnimatedStyle(() => {
        const b = Math.max(0, Math.min(1, activeBrightness.value));
        return { opacity: Math.pow(b, 0.7) };
    });

    // Blur radii proportional to tube thickness (same recipe as <NeonSVG>), then
    // scaled by `glow`. Keeps the glow tight on thin tubes and matches the splash.
    const bloomBlur = tubeWidth * 3.5 * glow;
    const haloBlur = tubeWidth * 1.4 * glow;
    const bodyBlur = tubeWidth * 0.3 * glow;
    const warmBlur = tubeWidth * 0.25 * glow;
    const hotBlur = tubeWidth * 0.15 * glow;

    // Canvas padding must contain the bloom at MAX overdrive, or the enlarged glow
    // gets clipped at the canvas edge. Sized to the worst-case outer bloom radius.
    const pad = Math.max(glowPadding, bloomBlur * BLOOM_REACH_MAX * 1.25);
    const canvasWidth = width + pad * 2;
    const canvasHeight = height + pad * 2;

    // Bloom + halo reach scale with brightness (the "power") past 100%: rated below
    // 1 (kept = base so the splash power-on is unchanged), pushed wider as it's
    // overdriven. UI thread so it tracks flicker/press without React renders. Tighter
    // core passes (body/warm/hot) stay fixed so the tube centre stays crisp.
    const reach = useDerivedValue(() => {
        const b = activeBrightness.value;
        return b < 1 ? 1 : b > BLOOM_REACH_MAX ? BLOOM_REACH_MAX : b;
    });
    const bloomBlurV = useDerivedValue(() => bloomBlur * reach.value);
    const haloBlurV = useDerivedValue(() => haloBlur * reach.value);

    const tubePosStyle = {
        position: "absolute" as const,
        top: -pad,
        left: -pad,
        width: canvasWidth,
        height: canvasHeight,
    };

    return (
        <>
            {/* ── Cold tube: always visible, no brightness control ── */}
            {/* Looks like an unpowered neon rod — dark grey glass tubing. */}
            <View pointerEvents="none" style={tubePosStyle}>
                <Canvas
                    style={[
                        StyleSheet.absoluteFill,
                        { backgroundColor: "transparent" },
                    ]}
                >
                    <Group
                        transform={[
                            { translateX: pad },
                            { translateY: pad },
                        ]}
                    >
                        <Path path={skPath} color="transparent">
                            <Paint
                                color="#55555f"
                                style="stroke"
                                strokeWidth={tubeWidth * 0.3}
                            >
                                <BlurMask
                                    blur={tubeWidth * 0.12}
                                    style="normal"
                                />
                            </Paint>
                        </Path>
                    </Group>
                </Canvas>
            </View>

            {/* ── Animated glow layers: opacity fades 0→100%, bloom reach scales with
                  brightness (incl. overdrive past 100%) ── */}
            <Animated.View
                pointerEvents="none"
                style={[
                    { ...tubePosStyle, backgroundColor: "transparent" },
                    canvasAnimatedStyle,
                ]}
            >
                <Canvas
                    style={[
                        StyleSheet.absoluteFill,
                        { backgroundColor: "transparent" },
                    ]}
                >
                    <Group
                        transform={[
                            { translateX: pad },
                            { translateY: pad },
                        ]}
                    >
                        {innerGlow && (
                            // color="transparent" suppresses the implicit black fill that RN Skia
                            // draws before applying Paint children. The Paint child handles the
                            // actual fill with inner blur.
                            <Path
                                path={skPath}
                                color="transparent"
                                opacity={0.35}
                            >
                                <Paint color={color}>
                                    <BlurMask
                                        blur={tubeWidth * 2.5 * glow}
                                        style="inner"
                                    />
                                </Paint>
                            </Path>
                        )}

                        {/* Outer bloom x2 — reach scales with brightness */}
                        <Path path={skPath} color="transparent">
                            <Paint
                                color={color}
                                style="stroke"
                                strokeWidth={tubeWidth * 0.3}
                            >
                                <BlurMask blur={bloomBlurV} style="outer" />
                            </Paint>
                        </Path>
                        <Path path={skPath} color="transparent">
                            <Paint
                                color={color}
                                style="stroke"
                                strokeWidth={tubeWidth * 0.3}
                            >
                                <BlurMask blur={bloomBlurV} style="outer" />
                            </Paint>
                        </Path>

                        {/* Mid halo — reach scales with brightness */}
                        <Path path={skPath} color="transparent">
                            <Paint
                                color={color}
                                style="stroke"
                                strokeWidth={tubeWidth * 0.7}
                            >
                                <BlurMask blur={haloBlurV} style="outer" />
                            </Paint>
                        </Path>

                        {/* Tube body */}
                        <Path path={skPath} color="transparent">
                            <Paint
                                color={color}
                                style="stroke"
                                strokeWidth={tubeWidth}
                            >
                                <BlurMask blur={bodyBlur} style="normal" />
                            </Paint>
                        </Path>

                        {/* Warm core */}
                        <Path path={skPath} color="transparent">
                            <Paint
                                color={warmColor}
                                style="stroke"
                                strokeWidth={tubeWidth * 0.4}
                            >
                                <BlurMask blur={warmBlur} style="normal" />
                            </Paint>
                        </Path>

                        {/* Hot core glow — soft white halo just around the core */}
                        <Path path={skPath} color="transparent">
                            <Paint
                                color="#ffffff"
                                style="stroke"
                                strokeWidth={tubeWidth * 0.3}
                            >
                                <BlurMask blur={hotBlur} style="normal" />
                            </Paint>
                        </Path>

                        {/* Hot core — crisp white center line (no blur) for a clean core */}
                        <Path
                            path={skPath}
                            color="#ffffff"
                            style="stroke"
                            strokeWidth={tubeWidth * 0.22}
                            strokeCap="round"
                            strokeJoin="round"
                        />
                    </Group>
                </Canvas>
            </Animated.View>
        </>
    );
}
