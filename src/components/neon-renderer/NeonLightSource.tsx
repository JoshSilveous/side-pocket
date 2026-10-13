import { Skia, type SkPath } from "@shopify/react-native-skia";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LayoutChangeEvent, View, ViewProps } from "react-native";
import Animated, {
    useAnimatedRef,
    useSharedValue,
    type SharedValue,
} from "react-native-reanimated";

import { useLightRegistration } from "./useLightRegistration";
import { hueToRgb } from "./utils";

/** Spacing (px) between emitter points sampled along the tube path. */
const EMITTER_SPACING = 12;
/** Default corner radius for the bounding-box tube outline (matches NeonButton). */
const DEFAULT_CORNER_RADIUS = 12;

/**
 * Tube path in the light's local space (origin = top-left of its box): an explicit
 * `tubePath` for custom shapes, else the bounding-box rounded-rect (a button's tube).
 */
function buildTubePath(
    tubePath: string | undefined,
    w: number,
    h: number,
    cr: number,
): SkPath {
    if (tubePath) {
        return Skia.Path.MakeFromSVGString(tubePath) ?? Skia.Path.Make();
    }
    const radius = Math.min(cr, w / 2, h / 2);
    return Skia.PathBuilder.Make()
        .addRRect(Skia.RRectXY(Skia.XYWHRect(0, 0, w, h), radius, radius))
        .build();
}

/** Evenly spaced points along every contour, flat `[x0,y0,…]` in local px. */
function samplePathEmitters(path: SkPath): number[] {
    const iter = Skia.ContourMeasureIter(path, false, 1);
    const out: number[] = [];
    let contour = iter.next();
    while (contour) {
        const len = contour.length();
        const steps = Math.max(2, Math.round(len / EMITTER_SPACING));
        for (let s = 0; s < steps; s++) {
            const [pos] = contour.getPosTan((s / steps) * len);
            out.push(pos.x, pos.y);
        }
        contour = iter.next();
    }
    return out;
}

type Props = ViewProps & {
    /** Hue 0–360 — should match the NeonTube/NeonButton inside */
    hue: number;
    /**
     * Power (can exceed 1 for overdrive). Pass a SharedValue so flicker/press
     * updates the wall + dust on the UI thread without re-rendering. Default: 1
     */
    brightness?: number | SharedValue<number>;
    /** Explicit tube path (SVG string, local coords). Default: box outline. */
    tubePath?: string;
    /** Corner radius of the default bounding-box tube outline. Default: 12 */
    cornerRadius?: number;
};

/** Registers its child's tube outline as a wall/dust light. Frame-aware. */
export function NeonLightSource({
    hue,
    brightness = 1,
    tubePath,
    cornerRadius = DEFAULT_CORNER_RADIUS,
    children,
    style,
    onLayout,
    ...rest
}: Props) {
    const viewRef = useAnimatedRef<View>();
    const [size, setSize] = useState({ w: 0, h: 0 });

    const internalBrightness = useSharedValue(
        typeof brightness === "number" ? brightness : 1,
    );
    const bv: SharedValue<number> =
        typeof brightness !== "number" ? brightness : internalBrightness;
    useEffect(() => {
        if (typeof brightness === "number")
            internalBrightness.value = brightness;
    }, [brightness, internalBrightness]);

    // Sampled from the untransformed layout size, so a scaled frame can't skew it.
    const localEmitters = useMemo(
        () =>
            size.w > 0 || size.h > 0
                ? samplePathEmitters(
                      buildTubePath(tubePath, size.w, size.h, cornerRadius),
                  )
                : null,
        [size.w, size.h, tubePath, cornerRadius],
    );

    const { register } = useLightRegistration({
        viewRef,
        localEmitters,
        rgb: hueToRgb(hue),
        brightness: bv,
    });

    const handleLayout = useCallback(
        (e: LayoutChangeEvent) => {
            const { width, height } = e.nativeEvent.layout;
            setSize((p) =>
                p.w === width && p.h === height ? p : { w: width, h: height },
            );
            register();
            onLayout?.(e);
        },
        [register, onLayout],
    );

    return (
        <Animated.View
            ref={viewRef}
            style={style}
            onLayout={handleLayout}
            {...rest}
        >
            {children}
        </Animated.View>
    );
}
