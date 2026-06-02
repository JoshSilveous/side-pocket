import {
    BlurMask,
    Canvas,
    Paint,
    RoundedRect,
} from "@shopify/react-native-skia";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import {
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withTiming,
} from "react-native-reanimated";

const NEON_COLOR = "#ff3c3c";
const BORDER_RADIUS = 5;
// Extra space around the button so the glow can bleed outside the border
const GLOW_PADDING = 20;

export default function NeonButton(props: {
    children: string;
    onPress: () => void;
}) {
    const { children, onPress } = props;

    // We need the button's pixel dimensions to draw the Skia canvas correctly.
    // onLayout gives us those after the first render.
    const [size, setSize] = useState({ width: 0, height: 0 });

    // Reanimated shared value for the flicker — same as before, still lives on the UI thread.
    // Skia can consume Reanimated shared values directly as prop values.
    const glowOpacity = useSharedValue(1);

    useEffect(() => {
        glowOpacity.value = withRepeat(
            withSequence(
                withDelay(2000, withTiming(0.4, { duration: 60 })),
                withTiming(1, { duration: 40 }),
                withTiming(0.6, { duration: 80 }),
                withTiming(1, { duration: 60 }),
            ),
            -1
        );
    }, []);

    // The Canvas is larger than the button by GLOW_PADDING on all sides,
    // then negatively offset to re-center it. This lets the glow bleed
    // outside the button's border without being clipped.
    const canvasWidth = size.width + GLOW_PADDING * 2;
    const canvasHeight = size.height + GLOW_PADDING * 2;

    // Inside the Canvas, the rect is drawn offset by GLOW_PADDING so it
    // lines up with the actual button border.
    const rectX = GLOW_PADDING;
    const rectY = GLOW_PADDING;

    return (
        <Pressable
            onPress={onPress}
            onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                setSize({ width, height });
            }}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
            {/* The Canvas sits behind the text, expanded + offset by GLOW_PADDING */}
            <Canvas
                style={[
                    StyleSheet.absoluteFill,
                    {
                        top: -GLOW_PADDING,
                        left: -GLOW_PADDING,
                        width: canvasWidth,
                        height: canvasHeight,
                    },
                ]}
            >
                {/*
                  * We draw the same rounded rect shape three times with
                  * different blur amounts — wide diffuse bloom, tight inner
                  * glow, and a sharp unblurred core. Stacked, these produce
                  * the layered neon tube look.
                  *
                  * BlurMask style="outer" means the blur spreads outward only,
                  * not inward — so the inside of the button stays clean.
                  */}
                <RoundedRect
                    x={rectX} y={rectY}
                    width={size.width} height={size.height}
                    r={BORDER_RADIUS}
                    opacity={glowOpacity}
                >
                    <Paint color={NEON_COLOR} style="stroke" strokeWidth={2}>
                        <BlurMask blur={16} style="outer" />
                    </Paint>
                </RoundedRect>

                <RoundedRect
                    x={rectX} y={rectY}
                    width={size.width} height={size.height}
                    r={BORDER_RADIUS}
                    opacity={glowOpacity}
                >
                    <Paint color={NEON_COLOR} style="stroke" strokeWidth={2}>
                        <BlurMask blur={5} style="outer" />
                    </Paint>
                </RoundedRect>

                <RoundedRect
                    x={rectX} y={rectY}
                    width={size.width} height={size.height}
                    r={BORDER_RADIUS}
                    opacity={glowOpacity}
                >
                    <Paint color={NEON_COLOR} style="stroke" strokeWidth={1.5} />
                </RoundedRect>
            </Canvas>

            <Text style={styles.label}>{children}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    button: {
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    pressed: {
        opacity: 0.7,
    },
    label: {
        color: NEON_COLOR,
        fontSize: 16,
        fontWeight: "700",
    },
});
