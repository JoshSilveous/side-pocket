import {
    BlurMask,
    Canvas,
    Group,
    Paint,
    Path,
    Skia,
    type SkPath,
} from "@shopify/react-native-skia";
import { useEffect, useMemo } from "react";
import { StyleSheet } from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    type SharedValue,
} from "react-native-reanimated";

type Props = {
    /** Scaled path in sign-content coordinates (origin = sign top-left). */
    skPath: SkPath;
    /** Padding (px) applied around the sign content inside SidePocketNeon's View. */
    contentPad: number;
    color: string;
    warmColor: string;
    tubeWidth: number;
    /** 0..1 brightness. A SharedValue animates the tube on the UI thread. */
    brightness: SharedValue<number> | number;
};

/**
 * The animated GLOW for one neon tube, in its own small canvas positioned over its
 * bounding box. The unlit "glass" tube is drawn separately by <ColdTubes> and stays
 * visible at brightness 0, so this canvas only carries the glow that fades in/out.
 *
 * Brightness drives the canvas's <Animated.View> opacity via useAnimatedStyle — the
 * same approach as <NeonTube>. We do NOT use Skia's <Group opacity={sharedValue}>:
 * in this Skia version that doesn't actually animate (the value updates, but the
 * group opacity doesn't follow), whereas the Animated.View approach is reliable.
 */
export function PathTube({
    skPath,
    contentPad,
    color,
    warmColor,
    tubeWidth,
    brightness,
}: Props) {
    // Normalise brightness to a single SharedValue.
    const staticB = useSharedValue(
        typeof brightness === "number" ? brightness : 1,
    );
    const bv: SharedValue<number> =
        brightness !== undefined && typeof brightness !== "number"
            ? brightness
            : staticB;
    useEffect(() => {
        if (typeof brightness === "number") staticB.value = brightness;
    }, [brightness, staticB]);

    // Glow padding around this tube's bbox so bloom isn't clipped by its canvas.
    const glowPad = tubeWidth * 4 + 12;

    // Position + local path (translated so the bbox sits at (glowPad, glowPad)).
    const layout = useMemo(() => {
        const b = skPath.getBounds();
        const local = Skia.PathBuilder.MakeFromPath(skPath)
            .offset(glowPad - b.x, glowPad - b.y)
            .build();
        return {
            local,
            left: contentPad + b.x - glowPad,
            top: contentPad + b.y - glowPad,
            width: b.width + glowPad * 2,
            height: b.height + glowPad * 2,
        };
    }, [skPath, glowPad, contentPad]);

    const animatedStyle = useAnimatedStyle(() => {
        const v = Math.max(0, Math.min(1, bv.value));
        return { opacity: Math.pow(v, 0.7) };
    });

    const bloomBlur = tubeWidth * 3.5;
    const haloBlur = tubeWidth * 1.4;
    const bodyBlur = tubeWidth * 0.3;
    const warmBlur = tubeWidth * 0.25;
    const hotBlur = tubeWidth * 0.15;

    return (
        <Animated.View
            pointerEvents="none"
            style={[
                {
                    position: "absolute",
                    left: layout.left,
                    top: layout.top,
                    width: layout.width,
                    height: layout.height,
                },
                animatedStyle,
            ]}
        >
            <Canvas style={StyleSheet.absoluteFill}>
                <Group>
                    {/* Outer bloom x2 */}
                    <Path path={layout.local} color="transparent">
                        <Paint
                            color={color}
                            style="stroke"
                            strokeWidth={tubeWidth * 0.3}
                        >
                            <BlurMask blur={bloomBlur} style="outer" />
                        </Paint>
                    </Path>
                    <Path path={layout.local} color="transparent">
                        <Paint
                            color={color}
                            style="stroke"
                            strokeWidth={tubeWidth * 0.3}
                        >
                            <BlurMask blur={bloomBlur} style="outer" />
                        </Paint>
                    </Path>

                    {/* Mid halo */}
                    <Path path={layout.local} color="transparent">
                        <Paint
                            color={color}
                            style="stroke"
                            strokeWidth={tubeWidth * 0.7}
                        >
                            <BlurMask blur={haloBlur} style="outer" />
                        </Paint>
                    </Path>

                    {/* Tube body */}
                    <Path path={layout.local} color="transparent">
                        <Paint
                            color={color}
                            style="stroke"
                            strokeWidth={tubeWidth}
                        >
                            <BlurMask blur={bodyBlur} style="normal" />
                        </Paint>
                    </Path>

                    {/* Warm core */}
                    <Path path={layout.local} color="transparent">
                        <Paint
                            color={warmColor}
                            style="stroke"
                            strokeWidth={tubeWidth * 0.4}
                        >
                            <BlurMask blur={warmBlur} style="normal" />
                        </Paint>
                    </Path>

                    {/* Hot center */}
                    <Path path={layout.local} color="transparent">
                        <Paint
                            color="#ffffff"
                            style="stroke"
                            strokeWidth={tubeWidth * 0.25}
                        >
                            <BlurMask blur={hotBlur} style="normal" />
                        </Paint>
                    </Path>
                </Group>
            </Canvas>
        </Animated.View>
    );
}
