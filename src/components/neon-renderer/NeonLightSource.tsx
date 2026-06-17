import { Skia, type SkPath } from "@shopify/react-native-skia";
import { useCallback, useEffect, useId, useRef } from "react";
import { View, type ViewProps } from "react-native";
import {
    useAnimatedReaction,
    useSharedValue,
    type SharedValue,
} from "react-native-reanimated";

import { useNeonRenderer } from "./NeonRendererContext";
import { hueToRgb } from "./utils";

/** Spacing (px) between emitter points sampled along the tube path. */
const EMITTER_SPACING = 12;
/** Default corner radius for the bounding-box tube outline (matches NeonButton). */
const DEFAULT_CORNER_RADIUS = 12;

/**
 * Build the tube path in the light's *local* coordinate space (origin = top-left
 * of the measured box). Uses an explicit `tubePath` if given (arbitrary neon-sign
 * shapes), otherwise the bounding-box rounded-rect — which is exactly a button's tube.
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
    // Immutable PathBuilder API (avoids deprecated SkPath.addRRect()).
    return Skia.PathBuilder.Make()
        .addRRect(Skia.RRectXY(Skia.XYWHRect(0, 0, w, h), radius, radius))
        .build();
}

/**
 * Walk every contour of `path` by arc length, emitting an evenly-spaced point
 * roughly every EMITTER_SPACING px. Returns a flat `[x0,y0,x1,y1,…]` array in
 * content coordinates: local point + box offset (relX/relY) + current scroll.
 */
function samplePathEmitters(
    path: SkPath,
    relX: number,
    relY: number,
    scrollY: number,
): number[] {
    const iter = Skia.ContourMeasureIter(path, false, 1);
    const out: number[] = [];
    let contour = iter.next();
    while (contour) {
        const len = contour.length();
        const steps = Math.max(2, Math.round(len / EMITTER_SPACING));
        for (let s = 0; s < steps; s++) {
            const [pos] = contour.getPosTan((s / steps) * len);
            out.push(relX + pos.x, relY + pos.y + scrollY);
        }
        contour = iter.next();
    }
    return out;
}

type Props = ViewProps & {
    /** Hue 0–360 — should match the NeonTube/NeonButton inside */
    hue: number;
    /**
     * Brightness 0–1. Pass a Reanimated `SharedValue<number>` (recommended) so
     * brightness/flicker updates the wall + dust lighting on the UI thread without
     * a React re-render. A plain number also works for static lights. Default: 1
     */
    brightness?: number | SharedValue<number>;
    /**
     * Explicit tube path (SVG string, in the child's local coordinates) that light
     * emanates from — use for custom/animated neon-sign shapes. When omitted, the
     * tube is the measured bounding-box rounded-rect (correct for a NeonButton).
     */
    tubePath?: string;
    /** Corner radius of the default bounding-box tube outline. Default: 12 */
    cornerRadius?: number;
};

export function NeonLightSource({
    hue,
    brightness = 1,
    tubePath,
    cornerRadius = DEFAULT_CORNER_RADIUS,
    children,
    style,
    ...rest
}: Props) {
    const renderer = useNeonRenderer();
    const viewRef = useRef<View>(null);
    const id = useId();

    const [r, g, b] = hueToRgb(hue);

    const rendererRef = useRef(renderer);
    rendererRef.current = renderer;

    // Normalise brightness to a single SharedValue — the UI-thread source of truth.
    const internalBrightness = useSharedValue(
        typeof brightness === "number" ? brightness : 1,
    );
    const bv: SharedValue<number> =
        brightness !== undefined && typeof brightness !== "number"
            ? brightness
            : internalBrightness;
    useEffect(() => {
        if (typeof brightness === "number")
            internalBrightness.value = brightness;
    }, [brightness, internalBrightness]);

    const lightParamsRef = useRef({ r, g, b, tubePath, cornerRadius });
    lightParamsRef.current = { r, g, b, tubePath, cornerRadius };

    const measureAndRegister = useCallback(() => {
        const rdr = rendererRef.current;
        if (!rdr || !viewRef.current) return;

        const {
            r: lr,
            g: lg,
            b: lb,
            tubePath: lpath,
            cornerRadius: lcr,
        } = lightParamsRef.current;

        // Use measure() + container measure() to get relative position.
        // More reliable than measureLayout() on new arch (RN 0.73+).
        viewRef.current.measure((_, __, w, h, pageX, pageY) => {
            if (w === 0 && h === 0) return; // not yet laid out

            const containerView = rdr.containerRef.current;
            if (!containerView) return;

            containerView.measure(
                (_, __, _cw, _ch, containerPageX, containerPageY) => {
                    const relX = pageX - containerPageX;
                    const relY = pageY - containerPageY;

                    // Sample the tube path into emitter points in content coords. relX/relY are
                    // current screen offsets; adding the live scroll converts to content space so
                    // consumers can subtract live scroll to track the button.
                    const path = buildTubePath(lpath, w, h, lcr);
                    const emitters = samplePathEmitters(
                        path,
                        relX,
                        relY,
                        rdr.scrollShared.value,
                    );
                    if (emitters.length === 0) return;

                    rdr.registerLight({
                        id,
                        emitters,
                        r: lr,
                        g: lg,
                        b: lb,
                        intensity: bv.value,
                    });
                },
            );
        });
    }, [id, bv]);

    // Full measure + register on mount (needs layout to know position)
    useEffect(() => {
        measureAndRegister();
    }, [measureAndRegister]);

    // Re-sample when the shape changes (path / corner radius).
    useEffect(() => {
        measureAndRegister();
    }, [tubePath, cornerRadius, measureAndRegister]);

    // Colour changed — update colour without re-measuring (skips async native measure()).
    useEffect(() => {
        rendererRef.current?.updateLight(id, { r, g, b });
    }, [r, g, b, id]);

    // Brightness/flicker → push live intensity into the shared buffer on the UI
    // thread. No React state, so slider drags + flicker never trigger a re-render.
    const intensityShared = renderer?.intensityShared ?? null;
    useAnimatedReaction(
        () => bv.value,
        (v) => {
            "worklet";
            if (!intensityShared) return;
            intensityShared.value = { ...intensityShared.value, [id]: v };
        },
        [id, intensityShared],
    );

    useEffect(() => {
        return () => {
            rendererRef.current?.unregisterLight(id);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <View
            ref={viewRef}
            style={style}
            onLayout={measureAndRegister}
            {...rest}
        >
            {children}
        </View>
    );
}
