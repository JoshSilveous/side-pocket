import type { SkPath } from "@shopify/react-native-skia";
import { useEffect, useId, useRef } from "react";
import {
    useAnimatedReaction,
    useSharedValue,
    type SharedValue,
} from "react-native-reanimated";

import { useNeonRenderer } from "../neon-renderer/NeonRendererContext";
import { hexToRgb01, sampleEmitters } from "./utils";

/** Max emitter points sampled per path. Small: the dust worklet loops every
 *  emitter of every light per particle (640x). */
const MAX_PATH_EMITTERS = 8;
const MIN_EMITTER_SPACING = 16;

type Props = {
    /** Scaled path in sign-local coordinates (origin at the sign's top-left). */
    skPath: SkPath;
    /** Sign content origin (canvas top-left + pad) in NeonRenderer container coords. */
    origin: { x: number; y: number } | null;
    color: string;
    brightness?: SharedValue<number> | number;
    enabled: boolean;
};

/**
 * Headless registrar: turns one tube path into a NeonRenderer light so the brick
 * wall + dust react to it. Lives in the normal React tree (NOT inside the Skia
 * canvas) so its effects + the intensity reaction actually run. One instance per
 * path → each gets its own hooks, mirroring how <NeonLightSource> works.
 */
export function PathLight({
    skPath,
    origin,
    color,
    brightness,
    enabled,
}: Props) {
    const renderer = useNeonRenderer();
    const rendererRef = useRef(renderer);
    rendererRef.current = renderer;
    const id = useId();

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

    const [lr, lg, lb] = hexToRgb01(color);

    // Register once the sign has been measured. Emitters are in content coords
    // (origin + pad already folded into `origin`), with live scroll added so the
    // light tracks the sign if the screen scrolls.
    useEffect(() => {
        const rdr = rendererRef.current;
        if (!enabled || !rdr || !origin) return;
        const emitters = sampleEmitters(
            skPath,
            origin.x,
            origin.y,
            rdr.scrollShared.value,
            MAX_PATH_EMITTERS,
            MIN_EMITTER_SPACING,
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
        return () => rdr.unregisterLight(id);
    }, [enabled, origin, skPath, id, lr, lg, lb, bv]);

    // Live brightness/flicker → intensityShared on the UI thread (no re-render).
    const intensityShared = renderer?.intensityShared ?? null;
    useAnimatedReaction(
        () => bv.value,
        (v) => {
            "worklet";
            if (!intensityShared) return;
            const next = Object.assign({}, intensityShared.value);
            next[id] = v;
            intensityShared.value = next;
        },
        [id, intensityShared],
    );

    return null;
}
