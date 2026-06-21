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
    useSharedValue,
} from "react-native-reanimated";

/** Brightness at which the white "burn-out" overdrive layer is fully blown in.
 *  Brightness 1 = normal full glow; values from 1 → OVERDRIVE_MAX fade in an
 *  overexposed white bloom on top (driven by press / flicker animations). */
const OVERDRIVE_MAX = 2;

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
        typeof brightness === "number" ? brightness : 1
    );
    const activeBrightness: SharedValue<number> =
        brightness !== undefined && typeof brightness !== "number"
            ? brightness
            : staticBrightness;

    const skPath = useMemo(() => {
        const parsed = Skia.Path.MakeFromSVGString(pathStr);
        return parsed ?? Skia.Path.Make();
    }, [pathStr]);

    const canvasAnimatedStyle = useAnimatedStyle(() => {
        const b = Math.max(0, Math.min(1, activeBrightness.value));
        return { opacity: Math.pow(b, 0.7) };
    });

    // Overdrive (>1 brightness): a white blow-out bloom that fades in as the tube
    // is pushed past full, reading as "about to burn out".
    const overdriveStyle = useAnimatedStyle(() => {
        const o = (activeBrightness.value - 1) / (OVERDRIVE_MAX - 1);
        return { opacity: Math.max(0, Math.min(1, o)) };
    });

    const canvasWidth = width + glowPadding * 2;
    const canvasHeight = height + glowPadding * 2;

    // Blur radii proportional to tube thickness (same recipe as <NeonSVG>), then
    // scaled by `glow`. Keeps the glow tight on thin tubes and matches the splash.
    const bloomBlur = tubeWidth * 3.5 * glow;
    const haloBlur = tubeWidth * 1.4 * glow;
    const bodyBlur = tubeWidth * 0.3 * glow;
    const warmBlur = tubeWidth * 0.25 * glow;
    const hotBlur = tubeWidth * 0.15 * glow;

    const tubePosStyle = {
        position: "absolute" as const,
        top: -glowPadding,
        left: -glowPadding,
        width: canvasWidth,
        height: canvasHeight,
    };

    return (
        <>
        {/* ── Cold tube: always visible, no brightness control ── */}
        {/* Looks like an unpowered neon rod — dark grey glass tubing. */}
        <View pointerEvents="none" style={tubePosStyle}>
            <Canvas style={[StyleSheet.absoluteFill, { backgroundColor: "transparent" }]}>
                <Group transform={[{ translateX: glowPadding }, { translateY: glowPadding }]}>
                    <Path path={skPath} color="transparent">
                        <Paint color="#55555f" style="stroke" strokeWidth={tubeWidth * 0.3}>
                            <BlurMask blur={tubeWidth * 0.12} style="normal" />
                        </Paint>
                    </Path>
                </Group>
            </Canvas>
        </View>

        {/* ── Animated glow layers: fade with brightness ── */}
        <Animated.View
            pointerEvents="none"
            style={[
                { ...tubePosStyle, backgroundColor: "transparent" },
                canvasAnimatedStyle,
            ]}
        >
            <Canvas style={[StyleSheet.absoluteFill, { backgroundColor: "transparent" }]}>
                <Group transform={[{ translateX: glowPadding }, { translateY: glowPadding }]}>

                    {innerGlow && (
                        // color="transparent" suppresses the implicit black fill that RN Skia
                        // draws before applying Paint children. The Paint child handles the
                        // actual fill with inner blur.
                        <Path path={skPath} color="transparent" opacity={0.35}>
                            <Paint color={color}>
                                <BlurMask blur={tubeWidth * 2.5 * glow} style="inner" />
                            </Paint>
                        </Path>
                    )}

                    {/* Outer bloom x2 */}
                    <Path path={skPath} color="transparent">
                        <Paint color={color} style="stroke" strokeWidth={tubeWidth * 0.3}>
                            <BlurMask blur={bloomBlur} style="outer" />
                        </Paint>
                    </Path>
                    <Path path={skPath} color="transparent">
                        <Paint color={color} style="stroke" strokeWidth={tubeWidth * 0.3}>
                            <BlurMask blur={bloomBlur} style="outer" />
                        </Paint>
                    </Path>

                    {/* Mid halo */}
                    <Path path={skPath} color="transparent">
                        <Paint color={color} style="stroke" strokeWidth={tubeWidth * 0.7}>
                            <BlurMask blur={haloBlur} style="outer" />
                        </Paint>
                    </Path>

                    {/* Tube body */}
                    <Path path={skPath} color="transparent">
                        <Paint color={color} style="stroke" strokeWidth={tubeWidth}>
                            <BlurMask blur={bodyBlur} style="normal" />
                        </Paint>
                    </Path>

                    {/* Warm core */}
                    <Path path={skPath} color="transparent">
                        <Paint color={warmColor} style="stroke" strokeWidth={tubeWidth * 0.4}>
                            <BlurMask blur={warmBlur} style="normal" />
                        </Paint>
                    </Path>

                    {/* Hot core glow — soft white halo just around the core */}
                    <Path path={skPath} color="transparent">
                        <Paint color="#ffffff" style="stroke" strokeWidth={tubeWidth * 0.3}>
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

        {/* ── Overdrive layer: white blow-out that fades in past 100% brightness ── */}
        <Animated.View
            pointerEvents="none"
            style={[
                { ...tubePosStyle, backgroundColor: "transparent" },
                overdriveStyle,
            ]}
        >
            <Canvas style={[StyleSheet.absoluteFill, { backgroundColor: "transparent" }]}>
                <Group transform={[{ translateX: glowPadding }, { translateY: glowPadding }]}>
                    {/* Wide overexposed white bloom */}
                    <Path path={skPath} color="transparent">
                        <Paint color="#ffffff" style="stroke" strokeWidth={tubeWidth * 0.8}>
                            <BlurMask blur={bloomBlur * 1.6} style="outer" />
                        </Paint>
                    </Path>
                    {/* Fattened white body so the tube itself looks blown out */}
                    <Path path={skPath} color="transparent">
                        <Paint color="#ffffff" style="stroke" strokeWidth={tubeWidth * 0.7}>
                            <BlurMask blur={haloBlur} style="normal" />
                        </Paint>
                    </Path>
                </Group>
            </Canvas>
        </Animated.View>
        </>
    );
}
