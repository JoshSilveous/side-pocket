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
import {
    SharedValue,
    useDerivedValue,
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

    // Drive brightness entirely inside the Skia Group — no Animated.View wrapper.
    // An Animated.View with animated opacity creates an offscreen compositing layer
    // that iOS/Fabric renders with a black background, making the canvas interior
    // appear as a solid black rectangle. Driving opacity via Skia's own Group
    // avoids any native compositing layer entirely.
    const groupOpacity = useDerivedValue(() => {
        const b = Math.max(0, Math.min(1, activeBrightness.value));
        return Math.pow(b, 0.7);
    });

    const canvasWidth = width + glowPadding * 2;
    const canvasHeight = height + glowPadding * 2;

    return (
        <View
            pointerEvents="none"
            style={{
                position: "absolute",
                top: -glowPadding,
                left: -glowPadding,
                width: canvasWidth,
                height: canvasHeight,
            }}
        >
            <Canvas style={StyleSheet.absoluteFill}>
                <Group
                    opacity={groupOpacity}
                    transform={[{ translateX: glowPadding }, { translateY: glowPadding }]}
                >

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
        </View>
    );
}
