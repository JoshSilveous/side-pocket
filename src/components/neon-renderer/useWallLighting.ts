import { useEffect } from "react";
import { AppState } from "react-native";
import {
    useDerivedValue,
    useFrameCallback,
    useSharedValue,
    type SharedValue,
} from "react-native-reanimated";

import type { FrameWorld, LightSource } from "./types";

type WallLighting = {
    lights: LightSource[];
    intensities: Record<string, number>;
    scroll: number;
    frames: Record<string, FrameWorld>;
};

/** Sample before building wall uniforms so both CPU assembly and GPU draws slow
 * down. Tubes and dust continue consuming the original live lighting buffers. */
export function useWallLighting(
    lightsShared: SharedValue<LightSource[]>,
    intensityShared: SharedValue<Record<string, number>>,
    scrollShared: SharedValue<number>,
    framesShared: SharedValue<Record<string, FrameWorld>>,
    framesVersion: SharedValue<number>,
    fps: number,
): SharedValue<WallLighting> {
    "use no memo";
    // Keep shared-value reads inside worklets when React Compiler is enabled.
    const live = useDerivedValue(() => ({
        lights: lightsShared.value,
        intensities: intensityShared.value,
        scroll: scrollShared.value,
        frames: framesShared.value,
        version: framesVersion.value,
    }));
    const sampled = useSharedValue<WallLighting>({
        lights: [],
        intensities: {},
        scroll: 0,
        frames: {},
    });
    const lastVersion = useSharedValue(-1);
    const previous = useSharedValue<WallLighting | null>(null);
    const lastSampleTime = useSharedValue(-1);

    const frame = useFrameCallback((info) => {
        "worklet";
        if (fps <= 0) return;
        const latest = live.value;
        if (latest === previous.value) return;
        // Moving frames bypass the cap: a throttled wall would visibly trail
        // its tubes during a slide. The cap only saves power while things sit still.
        const moving = latest.version !== lastVersion.value;
        if (
            !moving &&
            lastSampleTime.value >= 0 &&
            info.timestamp - lastSampleTime.value + 0.001 < 1000 / fps
        ) return;

        // Intensities are mutated in place by the tubes. Copy only at publication
        // so a held snapshot cannot change underneath the wall's uniform worklet.
        sampled.value = {
            lights: latest.lights,
            intensities: { ...latest.intensities },
            scroll: latest.scroll,
            frames: { ...latest.frames },
        };
        lastVersion.value = latest.version;
        previous.value = latest;
        lastSampleTime.value = info.timestamp;
    }, false);

    useEffect(() => {
        const sync = () => {
            const active = fps > 0 && AppState.currentState === "active";
            if (active) lastSampleTime.value = -1;
            frame.setActive(active);
        };
        sync();
        const sub = AppState.addEventListener("change", sync);
        return () => {
            sub.remove();
            frame.setActive(false);
        };
    }, [fps, frame, lastSampleTime]);

    // The downstream uniform worklet captures only this selected buffer. Reading
    // raw inputs in it would subscribe it to every update even in performance mode.
    return (fps > 0 ? sampled : live) as SharedValue<WallLighting>;
}
