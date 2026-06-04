import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { SharedValue, useSharedValue } from "react-native-reanimated";

import { NeonTube } from "./neon-tube";

const FONT_SIZE = 32;
const BORDER_RADIUS = 12;
const TUBE_WIDTH = 12;
const GLOW_PADDING = 40;

function buildRoundedRectPath(w: number, h: number, r: number): string {
    return (
        `M ${r} 0 H ${w - r} ` +
        `Q ${w} 0 ${w} ${r} ` +
        `V ${h - r} ` +
        `Q ${w} ${h} ${w - r} ${h} ` +
        `H ${r} ` +
        `Q 0 ${h} 0 ${h - r} ` +
        `V ${r} ` +
        `Q 0 0 ${r} 0 Z`
    );
}

export default function NeonButton(props: {
    children: string;
    onPress: () => void;
    color?: string;
    warmColor?: string;
    brightness?: SharedValue<number>;
}) {
    const { children, onPress, color = "#ff2020", warmColor = "#ff9999" } = props;

    const [size, setSize] = useState({ width: 0, height: 0 });

    const internalBrightness = useSharedValue(1);
    const brightness = props.brightness ?? internalBrightness;

    const path = size.width > 0
        ? buildRoundedRectPath(size.width, size.height, BORDER_RADIUS)
        : "";

    return (
        <Pressable
            onPress={onPress}
            onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                setSize({ width, height });
            }}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
            {size.width > 0 && (
                <NeonTube
                    path={path}
                    width={size.width}
                    height={size.height}
                    color={color}
                    warmColor={warmColor}
                    tubeWidth={TUBE_WIDTH}
                    brightness={brightness}
                    innerGlow={false}
                    glowPadding={GLOW_PADDING}
                />
            )}
            <Text style={styles.label}>{children}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    button: {
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 40,
        paddingVertical: 20,
    },
    pressed: {
        opacity: 0.7,
    },
    label: {
        color: "#ffffff",
        fontSize: FONT_SIZE,
        fontWeight: "bold",
    },
});
