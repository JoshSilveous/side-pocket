import type { SkPath } from "@shopify/react-native-skia";
import { useEffect, useMemo } from "react";
import type { View } from "react-native";
import {
    useSharedValue,
    type AnimatedRef,
    type SharedValue,
} from "react-native-reanimated";

import { useLightRegistration } from "../neon-renderer/useLightRegistration";
import { hexToRgb01, sampleEmitters } from "./utils";

/** Max emitter points sampled per path. Small: the dust worklet loops every
 *  emitter of every light per particle (640x). */
const MAX_PATH_EMITTERS = 8;
const MIN_EMITTER_SPACING = 16;
/** Wall wash per tube. ~30 tubes overlap, so each is heavily damped. */
const SIGN_WALL_GAIN = 0.2;

type Props = {
    /** Scaled path in sign-art coordinates (origin at the art's top-left). */
    skPath: SkPath;
    /** The sign's view; emitters are placed relative to its top-left. */
    anchorRef: AnimatedRef<View>;
    /** Offset of the art inside the anchor view (glow padding). */
    contentPad: number;
    /** Bump when the anchor lays out so the light re-measures. */
    layoutKey: number;
    color: string;
    brightness?: SharedValue<number> | number;
    enabled: boolean;
};

/**
 * Headless registrar: turns one tube path into a NeonRenderer light. Lives in the
 * normal React tree (not the Skia canvas) so hooks run. One instance per path.
 */
export function PathLight({
    skPath,
    anchorRef,
    contentPad,
    layoutKey,
    color,
    brightness,
    enabled,
}: Props) {
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

    const localEmitters = useMemo(
        () =>
            sampleEmitters(
                skPath,
                contentPad,
                contentPad,
                0,
                MAX_PATH_EMITTERS,
                MIN_EMITTER_SPACING,
            ),
        [skPath, contentPad],
    );

    const { register } = useLightRegistration({
        viewRef: anchorRef,
        localEmitters,
        rgb: hexToRgb01(color),
        brightness: bv,
        enabled,
        wallGain: SIGN_WALL_GAIN,
    });

    useEffect(() => {
        if (layoutKey > 0) register();
    }, [layoutKey, register]);

    return null;
}
