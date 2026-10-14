import { useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";
import { useDerivedValue, useSharedValue, type SharedValue } from "react-native-reanimated";

import { NeonLightSource } from "./neon-renderer";
import { NeonText } from "./neon-text";
import { NeonTube } from "./neon-tube";
import { usePowerOnLevel } from "./power-on";

function usePower(brightness?: SharedValue<number>) {
    const own = useSharedValue(1);
    const base = brightness ?? own;
    const level = usePowerOnLevel();
    return useDerivedValue(() => base.value * level.value);
}

/** A straight horizontal neon tube that fills its box's width. Self-lit. */
export function NeonLine({
    color,
    warmColor,
    tubeWidth = 3,
    brightness,
    style,
}: {
    color: string;
    warmColor: string;
    tubeWidth?: number;
    brightness?: SharedValue<number>;
    style?: StyleProp<ViewStyle>;
}) {
    const [w, setW] = useState(0);
    const power = usePower(brightness);
    const h = tubeWidth * 2;
    const path = `M 0 ${h / 2} H ${w}`;
    return (
        <View style={[{ height: h }, style]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
            {w > 0 && (
                <NeonLightSource color={color} brightness={power} tubePath={path} style={{ width: w, height: h }}>
                    <NeonTube
                        path={path}
                        width={w}
                        height={h}
                        color={color}
                        warmColor={warmColor}
                        tubeWidth={tubeWidth}
                        brightness={power}
                        innerGlow={false}
                        glowPadding={20}
                    />
                </NeonLightSource>
            )}
        </View>
    );
}

export type BadgeShape = "ring" | "solids" | "stripes";

function badgePath(shape: BadgeShape, s: number): string {
    const r = s / 2 - 1;
    const c = s / 2;
    const circle = (rad: number) =>
        `M ${c - rad} ${c} A ${rad} ${rad} 0 1 0 ${c + rad} ${c} A ${rad} ${rad} 0 1 0 ${c - rad} ${c} Z`;
    if (shape === "solids") return `${circle(r)} ${circle(r * 0.38)}`;
    if (shape === "stripes") {
        const dy = r * 0.36;
        const dx = Math.sqrt(r * r - dy * dy) - 1;
        return `${circle(r)} M ${c - dx} ${c - dy} H ${c + dx} M ${c - dx} ${c + dy} H ${c + dx}`;
    }
    return circle(r);
}

/**
 * Small neon ring icon. "ring" can carry a 1–2 char label (team number, "i");
 * "solids" / "stripes" draw a ball with a dot / band. Self-lit.
 */
export function NeonBadge({
    shape,
    label,
    color,
    warmColor,
    size = 26,
    brightness,
}: {
    shape: BadgeShape;
    label?: string;
    color: string;
    warmColor: string;
    size?: number;
    brightness?: SharedValue<number>;
}) {
    const power = usePower(brightness);
    const path = badgePath(shape, size);
    return (
        <NeonLightSource color={color} brightness={power} tubePath={path} style={{ width: size, height: size }}>
            <NeonTube
                path={path}
                width={size}
                height={size}
                color={color}
                warmColor={warmColor}
                tubeWidth={2.5}
                brightness={power}
                innerGlow={false}
                glowPadding={18}
            />
            {shape === "ring" && label ? (
                <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
                    <NeonText fontSize={size * 0.58} color={color} warmColor={warmColor} brightness={brightness}>
                        {label}
                    </NeonText>
                </View>
            ) : null}
        </NeonLightSource>
    );
}
