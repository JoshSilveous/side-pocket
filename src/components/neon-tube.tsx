import {
    BlurMask,
    Canvas,
    Group,
    Paint,
    Path,
    Skia,
} from "@shopify/react-native-skia";
import { useMemo } from "react";
import { StyleSheet } from "react-native";
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

    // Apply brightness via Animated.View opacity instead of Skia Group opacity.
    // This uses Reanimated's own animation system which is guaranteed to work,
    // avoiding any potential Skia/Reanimated version compatibility issues.
    // A gentle power curve (^0.7) gives a more natural response than linear.
    const canvasAnimatedStyle = useAnimatedStyle(() => {
        const b = Math.max(0, Math.min(1, activeBrightness.value));
        return { opacity: Math.pow(b, 0.7) };
    });

    const canvasWidth = width + glowPadding * 2;
    const canvasHeight = height + glowPadding * 2;

    return (
        <Animated.View
            style={[
                StyleSheet.absoluteFill,
                {
                    top: -glowPadding,
                    left: -glowPadding,
                    width: canvasWidth,
                    height: canvasHeight,
                },
                canvasAnimatedStyle,
            ]}
        >
            <Canvas style={StyleSheet.absoluteFill}>
                <Group transform={[{ translateX: glowPadding }, { translateY: glowPadding }]}>

                    {innerGlow && (
                        <Path path={skPath} opacity={0.35}>
                            <Paint color={color}>
                                <BlurMask blur={30} style="inner" />
                            </Paint>
                        </Path>
                    )}

                    {/* Outer bloom x2 */}
                    <Path path={skPath}>
                        <Paint color={color} style="stroke" strokeWidth={3}>
                            <BlurMask blur={28} style="outer" />
                        </Paint>
                    </Path>
                    <Path path={skPath}>
                        <Paint color={color} style="stroke" strokeWidth={3}>
                            <BlurMask blur={28} style="outer" />
                        </Paint>
                    </Path>

                    {/* Mid halo */}
                    <Path path={skPath}>
                        <Paint color={color} style="stroke" strokeWidth={tubeWidth * 0.7}>
                            <BlurMask blur={10} style="outer" />
                        </Paint>
                    </Path>

                    {/* Tube body */}
                    <Path path={skPath}>
                        <Paint color={color} style="stroke" strokeWidth={tubeWidth}>
                            <BlurMask blur={tubeWidth * 0.45} style="normal" />
                        </Paint>
                    </Path>

                    {/* Warm core */}
                    <Path path={skPath}>
                        <Paint color={warmColor} style="stroke" strokeWidth={tubeWidth * 0.4}>
                            <BlurMask blur={3} style="normal" />
                        </Paint>
                    </Path>

                    {/* Hot center */}
                    <Path path={skPath}>
                        <Paint color="#ffffff" style="stroke" strokeWidth={tubeWidth * 0.25}>
                            <BlurMask blur={2} style="normal" />
                        </Paint>
                    </Path>

                </Group>
            </Canvas>
        </Animated.View>
    );
}
