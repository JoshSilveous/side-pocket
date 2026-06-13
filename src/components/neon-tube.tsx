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

export type NeonTubeProps = {
    path: string;
    width: number;
    height: number;
    color?: string;
    warmColor?: string;
    tubeWidth?: number;
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

    const canvasWidth = width + glowPadding * 2;
    const canvasHeight = height + glowPadding * 2;

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
                            <BlurMask blur={1.5} style="normal" />
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
                                <BlurMask blur={30} style="inner" />
                            </Paint>
                        </Path>
                    )}

                    {/* Outer bloom x2 */}
                    <Path path={skPath} color="transparent">
                        <Paint color={color} style="stroke" strokeWidth={3}>
                            <BlurMask blur={28} style="outer" />
                        </Paint>
                    </Path>
                    <Path path={skPath} color="transparent">
                        <Paint color={color} style="stroke" strokeWidth={3}>
                            <BlurMask blur={28} style="outer" />
                        </Paint>
                    </Path>

                    {/* Mid halo */}
                    <Path path={skPath} color="transparent">
                        <Paint color={color} style="stroke" strokeWidth={tubeWidth * 0.7}>
                            <BlurMask blur={10} style="outer" />
                        </Paint>
                    </Path>

                    {/* Tube body */}
                    <Path path={skPath} color="transparent">
                        <Paint color={color} style="stroke" strokeWidth={tubeWidth}>
                            <BlurMask blur={tubeWidth * 0.45} style="normal" />
                        </Paint>
                    </Path>

                    {/* Warm core */}
                    <Path path={skPath} color="transparent">
                        <Paint color={warmColor} style="stroke" strokeWidth={tubeWidth * 0.4}>
                            <BlurMask blur={3} style="normal" />
                        </Paint>
                    </Path>

                    {/* Hot center */}
                    <Path path={skPath} color="transparent">
                        <Paint color="#ffffff" style="stroke" strokeWidth={tubeWidth * 0.25}>
                            <BlurMask blur={2} style="normal" />
                        </Paint>
                    </Path>

                </Group>
            </Canvas>
        </Animated.View>
        </>
    );
}
