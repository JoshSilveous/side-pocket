import {
    BlurMask,
    Canvas,
    Group,
    Paint,
    Path,
    Skia,
} from "@shopify/react-native-skia";
import { useEffect, useMemo } from "react";
import { StyleSheet, type View } from "react-native";
import Animated, {
    SharedValue,
    useAnimatedRef,
    useAnimatedStyle,
    useDerivedValue,
    useSharedValue,
} from "react-native-reanimated";

import { useLightRegistration } from "./neon-renderer/useLightRegistration";

/** Bloom reach multiplier cap — brightness drives bloom blur up to this (overdrive
 *  past 100% = wider reach). Keep in sync with neon-tube's BLOOM_REACH_MAX. */
const BLOOM_REACH_MAX = 3;

export type NeonSVGProps = {
    /**
     * SVG path "d" strings in viewBox coordinates. Use the generated `splashArt.paths`
     * from `src/generated/splash-paths.ts` (produced by `npm run gen:svg`).
     */
    paths: readonly string[];
    /** Source viewBox the paths are drawn in — used to compute the scale factor. */
    viewBox: { width: number; height: number };
    /** Target on-screen width (px). Height is derived from the viewBox aspect ratio. */
    width: number;
    color?: string;
    warmColor?: string;
    /** Tube thickness in *screen* pixels (NOT scaled with the art — see note below). */
    tubeWidth?: number;
    brightness?: SharedValue<number> | number;
    innerGlow?: boolean;
    /** Extra canvas margin so outer bloom isn't clipped. */
    glowPadding?: number;
    /**
     * Register this sign as a light so the brick wall + dust react to it (same
     * pipeline as <NeonLightSource>). Requires being rendered inside <NeonRenderer>.
     * Default: true.
     */
    emitLight?: boolean;
};

/**
 * Max emitter points sampled along the whole sign for the lighting pass. Kept
 * modest because the dust worklet loops every emitter per particle (640x). The
 * brick only ever uses 4 of these, so this mainly bounds dust cost.
 */
const MAX_LIGHT_EMITTERS = 80;
/** Minimum spacing (px) between sampled emitters. */
const MIN_EMITTER_SPACING = 14;

/** Parse "#rrggbb" to [r,g,b] each 0..1. Falls back to red on bad input. */
function hexToRgb01(hex: string): [number, number, number] {
    const h = hex.trim().replace("#", "");
    if (h.length !== 6) return [1, 0.13, 0.13];
    const n = parseInt(h, 16);
    if (Number.isNaN(n)) return [1, 0.13, 0.13];
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Walk every contour of `path` by arc length, emitting evenly-spaced points into a
 * flat [x0,y0,x1,y1,...] array, offset by the glow padding into view-local px.
 * Spacing widens automatically to stay under `maxPoints`.
 */
function sampleEmitters(
    path: ReturnType<typeof Skia.Path.Make>,
    offsetX: number,
    offsetY: number,
    maxPoints: number,
): number[] {
    // First pass: total length, so we can pick a spacing that bounds the count.
    let total = 0;
    const lenIter = Skia.ContourMeasureIter(path, false, 1);
    let lenC = lenIter.next();
    while (lenC) {
        total += lenC.length();
        lenC = lenIter.next();
    }
    if (total <= 0) return [];
    const spacing = Math.max(MIN_EMITTER_SPACING, total / maxPoints);

    const out: number[] = [];
    const iter = Skia.ContourMeasureIter(path, false, 1);
    let contour = iter.next();
    while (contour) {
        const len = contour.length();
        const steps = Math.max(1, Math.round(len / spacing));
        for (let s = 0; s < steps; s++) {
            const [pos] = contour.getPosTan((s / steps) * len);
            out.push(offsetX + pos.x, offsetY + pos.y);
        }
        contour = iter.next();
    }
    return out;
}

/**
 * Renders a whole multi-path SVG as a single neon sign in ONE Skia canvas, and
 * (optionally) registers it as a light so the brick wall + dust react to it.
 *
 * Design notes
 * ------------
 * - All paths are scaled (geometry only) and merged into one SkPath, then the
 *   neon multi-pass effect runs once over the merged path. Far cheaper than one
 *   <NeonTube> (= one Canvas + ~6 blur passes) per path.
 * - Stroke widths stay in *screen space*: we scale the path POINTS via
 *   `path.transform(scale)` rather than scaling a <Group>, so a 6px tube stays 6px
 *   no matter how far down the art is scaled.
 * - Blur radii are proportional to `tubeWidth`, so thinner tubes glow tighter
 *   (fixed-radius blooms merge dense artwork into a blob).
 * - Brightness is global here. Per-tube control means splitting back into
 *   individual <NeonTube>/<NeonLightSource> pairs — pass SVG directly then.
 */
export function NeonSVG({
    paths,
    viewBox,
    width,
    color = "#ff2020",
    warmColor = "#ff9999",
    tubeWidth = 6,
    brightness,
    innerGlow = false,
    glowPadding = 40,
    emitLight = true,
}: NeonSVGProps) {
    const viewRef = useAnimatedRef<View>();

    const staticBrightness = useSharedValue(
        typeof brightness === "number" ? brightness : 1,
    );
    const bv: SharedValue<number> =
        brightness !== undefined && typeof brightness !== "number"
            ? brightness
            : staticBrightness;
    useEffect(() => {
        if (typeof brightness === "number") staticBrightness.value = brightness;
    }, [brightness, staticBrightness]);

    const scale = width / viewBox.width;
    const height = viewBox.height * scale;

    // Parse + scale + merge once. Geometry is scaled into screen space so strokes
    // (applied later) stay in screen px. Re-runs only if the source art changes.
    const skPath = useMemo(() => {
        // PathBuilder.addPath(src, matrix) scales while appending — immutable API,
        // avoids the deprecated SkPath.transform()/addPath().
        const matrix = Skia.Matrix();
        matrix.scale(scale, scale);
        const builder = Skia.PathBuilder.Make();
        for (const d of paths) {
            const p = Skia.Path.MakeFromSVGString(d);
            if (!p) continue;
            builder.addPath(p, matrix);
        }
        return builder.build();
    }, [paths, scale]);

    // ── Light registration (brick + dust react to the sign) ───────────────────
    // Art is drawn offset by glowPadding inside the view, so emitters are too.
    const localEmitters = useMemo(
        () => sampleEmitters(skPath, glowPadding, glowPadding, MAX_LIGHT_EMITTERS),
        [skPath, glowPadding],
    );
    const { register } = useLightRegistration({
        viewRef,
        localEmitters,
        rgb: hexToRgb01(color),
        brightness: bv,
        enabled: emitLight,
    });

    // ── Visual glow ───────────────────────────────────────────────────────────
    // Opacity carries the 0→100% fade; bloom reach (below) carries intensity past
    // 100%, so brightness reads like power to the tube.
    const canvasAnimatedStyle = useAnimatedStyle(() => {
        const b = Math.max(0, Math.min(1, bv.value));
        return { opacity: Math.pow(b, 0.7) };
    });

    // Bloom + halo reach scale with brightness (the "power"): off → tight → wide →
    // overdriven past 100%. UI thread, tracks flicker/power live.
    const reach = useDerivedValue(() => {
        const b = bv.value;
        return b < 1 ? 1 : b > BLOOM_REACH_MAX ? BLOOM_REACH_MAX : b;
    });
    const bloomBlurV = useDerivedValue(() => tubeWidth * 3.5 * reach.value);
    const haloBlurV = useDerivedValue(() => tubeWidth * 1.4 * reach.value);

    const canvasWidth = width + glowPadding * 2;
    const canvasHeight = height + glowPadding * 2;
    const posStyle = { width: canvasWidth, height: canvasHeight };

    // bloomBlur/haloBlur are reactive (bloomBlurV/haloBlurV above); these stay fixed.
    const bodyBlur = tubeWidth * 0.3;
    const warmBlur = tubeWidth * 0.25;
    const hotBlur = tubeWidth * 0.15;

    return (
        <Animated.View
            ref={viewRef}
            pointerEvents="none"
            style={posStyle}
            onLayout={register}
        >
            {/* ── Cold tube: always visible, no brightness control ── */}
            <Canvas
                style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: "transparent" },
                ]}
            >
                <Group
                    transform={[
                        { translateX: glowPadding },
                        { translateY: glowPadding },
                    ]}
                >
                    <Path path={skPath} color="transparent">
                        <Paint
                            color="#55555f"
                            style="stroke"
                            strokeWidth={tubeWidth * 0.3}
                        >
                            <BlurMask blur={tubeWidth * 0.12} style="normal" />
                        </Paint>
                    </Path>
                </Group>
            </Canvas>

            {/* ── Animated glow layers: fade with brightness ── */}
            <Animated.View
                pointerEvents="none"
                style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: "transparent" },
                    canvasAnimatedStyle,
                ]}
            >
                <Canvas
                    style={[
                        StyleSheet.absoluteFill,
                        { backgroundColor: "transparent" },
                    ]}
                >
                    <Group
                        transform={[
                            { translateX: glowPadding },
                            { translateY: glowPadding },
                        ]}
                    >
                        {innerGlow && (
                            <Path
                                path={skPath}
                                color="transparent"
                                opacity={0.35}
                            >
                                <Paint color={color}>
                                    <BlurMask
                                        blur={tubeWidth * 2.5}
                                        style="inner"
                                    />
                                </Paint>
                            </Path>
                        )}

                        {/* Outer bloom x2 */}
                        <Path path={skPath} color="transparent">
                            <Paint
                                color={color}
                                style="stroke"
                                strokeWidth={tubeWidth * 0.3}
                            >
                                <BlurMask blur={bloomBlurV} style="outer" />
                            </Paint>
                        </Path>
                        <Path path={skPath} color="transparent">
                            <Paint
                                color={color}
                                style="stroke"
                                strokeWidth={tubeWidth * 0.3}
                            >
                                <BlurMask blur={bloomBlurV} style="outer" />
                            </Paint>
                        </Path>

                        {/* Mid halo */}
                        <Path path={skPath} color="transparent">
                            <Paint
                                color={color}
                                style="stroke"
                                strokeWidth={tubeWidth * 0.7}
                            >
                                <BlurMask blur={haloBlurV} style="outer" />
                            </Paint>
                        </Path>

                        {/* Tube body */}
                        <Path path={skPath} color="transparent">
                            <Paint
                                color={color}
                                style="stroke"
                                strokeWidth={tubeWidth}
                            >
                                <BlurMask blur={bodyBlur} style="normal" />
                            </Paint>
                        </Path>

                        {/* Warm core */}
                        <Path path={skPath} color="transparent">
                            <Paint
                                color={warmColor}
                                style="stroke"
                                strokeWidth={tubeWidth * 0.4}
                            >
                                <BlurMask blur={warmBlur} style="normal" />
                            </Paint>
                        </Path>

                        {/* Hot center */}
                        <Path path={skPath} color="transparent">
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
        </Animated.View>
    );
}
