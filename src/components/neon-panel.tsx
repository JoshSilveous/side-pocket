import { useState, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { useDerivedValue, useSharedValue, type SharedValue } from "react-native-reanimated";

import { NeonLightSource } from "./neon-renderer";
import { NeonTube } from "./neon-tube";
import { usePowerOnLevel } from "./power-on";

function roundedRectPath(w: number, h: number, r: number): string {
    return (
        `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} ` +
        `Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`
    );
}

/**
 * A card outlined by a neon tube. Self-lit (wall + dust) and joins the screen's
 * staggered power-on. Children render inside; give it padding via `style`.
 */
export function NeonPanel({
    color,
    warmColor,
    brightness,
    tubeWidth = 5,
    radius = 18,
    style,
    children,
}: {
    color: string;
    warmColor: string;
    brightness?: SharedValue<number>;
    tubeWidth?: number;
    radius?: number;
    style?: StyleProp<ViewStyle>;
    children?: ReactNode;
}) {
    const [size, setSize] = useState({ w: 0, h: 0 });
    const own = useSharedValue(1);
    const base = brightness ?? own;
    const level = usePowerOnLevel();
    const power = useDerivedValue(() => base.value * level.value);

    return (
        <NeonLightSource
            color={color}
            brightness={power}
            cornerRadius={radius}
            style={style}
            onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                setSize((p) => (p.w === width && p.h === height ? p : { w: width, h: height }));
            }}
        >
            {size.w > 0 && (
                <NeonTube
                    path={roundedRectPath(size.w, size.h, radius)}
                    width={size.w}
                    height={size.h}
                    color={color}
                    warmColor={warmColor}
                    tubeWidth={tubeWidth}
                    brightness={power}
                    innerGlow={false}
                    glowPadding={30}
                />
            )}
            {children}
        </NeonLightSource>
    );
}
