import {
    Atlas,
    BlurMask,
    Canvas,
    Circle,
    Group,
    Skia,
    useColorBuffer,
    useRSXformBuffer,
    useTexture,
} from "@shopify/react-native-skia";
import { useIsFocused } from "expo-router";
import { useEffect, useMemo } from "react";
import { AppState } from "react-native";
import {
    useFrameCallback,
    useSharedValue,
    type SharedValue,
} from "react-native-reanimated";

import type { LightSource } from "./types";

// ── Constants ──────────────────────────────────────────────────────────────

const PARTICLE_COUNT = 80;
/**
 * Simulation cadence. Dust drifts at ~10px/s, so stepping at 25fps is visually
 * identical to the old 30fps while doing ~17% less work. The render itself is a
 * single Atlas draw on the UI thread regardless of cadence.
 */
const STEP_MS = 40;
const MAX_SPEED = 0.35;
const DRIFT_JITTER = 0.04;
const GREY = 0.55;

/** Pixel size of the baked soft-dot sprite texture. */
const SPRITE = 48;
/**
 * On-screen dot diameter = particle.size × this. Tuned so the baked sprite's
 * soft halo matches the old `Circle r=size` + `BlurMask blur=size*0.7` look.
 */
const RENDER_DIAMETER_FACTOR = 3.4;

// ── Types ──────────────────────────────────────────────────────────────────

type Particle = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** Radius in pixels (drives sprite scale) */
    size: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function initParticles(w: number, h: number): Particle[] {
    return Array.from({ length: PARTICLE_COUNT }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * MAX_SPEED,
        vy: (Math.random() - 0.5) * MAX_SPEED,
        size: 1.2 + Math.random() * 2.0,
    }));
}

// ── Component ──────────────────────────────────────────────────────────────

type Props = {
    lightsShared: SharedValue<LightSource[]>;
    intensityShared: SharedValue<Record<string, number>>;
    width: number;
    height: number;
};

export function DustParticles({
    lightsShared,
    intensityShared,
    width,
    height,
}: Props) {
    // All particle state lives in a SharedValue and is advanced on the UI thread.
    // No React state → no per-frame reconciliation.
    const particles = useSharedValue<Particle[]>(initParticles(width, height));
    const acc = useSharedValue(0);

    // Re-seed when the canvas size changes.
    useEffect(() => {
        particles.value = initParticles(width, height);
    }, [width, height, particles]);

    // ── Baked sprite ──────────────────────────────────────────────────────────
    // One soft white dot, rendered offscreen to a texture *once*. The blur is
    // baked in here so the per-frame draw needs no live BlurMask at all.
    const sprite = useTexture(
        <Circle
            cx={SPRITE / 2}
            cy={SPRITE / 2}
            r={SPRITE * 0.3}
            color="white"
        >
            <BlurMask blur={SPRITE * 0.16} style="normal" />
        </Circle>,
        { width: SPRITE, height: SPRITE },
    );

    // Every instance samples the full sprite texture — static.
    const sprites = useMemo(
        () =>
            Array.from({ length: PARTICLE_COUNT }, () =>
                Skia.XYWHRect(0, 0, SPRITE, SPRITE),
            ),
        [],
    );

    // ── Simulation (UI thread) ────────────────────────────────────────────────
    const frame = useFrameCallback((info) => {
        "worklet";
        acc.value += info.timeSincePreviousFrame ?? 16;
        if (acc.value < STEP_MS) return;
        acc.value = 0;

        const arr = particles.value;
        for (let i = 0; i < arr.length; i++) {
            const p = arr[i];
            let nvx = p.vx + (Math.random() - 0.5) * DRIFT_JITTER;
            let nvy = p.vy + (Math.random() - 0.5) * DRIFT_JITTER;
            nvx = nvx < -MAX_SPEED ? -MAX_SPEED : nvx > MAX_SPEED ? MAX_SPEED : nvx;
            nvy = nvy < -MAX_SPEED ? -MAX_SPEED : nvy > MAX_SPEED ? MAX_SPEED : nvy;
            let nx = p.x + nvx;
            let ny = p.y + nvy;
            if (nx < 0) nx = width;
            else if (nx > width) nx = 0;
            if (ny < 0) ny = height;
            else if (ny > height) ny = 0;
            p.x = nx;
            p.y = ny;
            p.vx = nvx;
            p.vy = nvy;
        }
        // New array reference so the Atlas buffers below recompute.
        particles.value = arr.slice();
    }, false);

    // Pause the simulation when the screen isn't visible (other tab / backgrounded).
    const isFocused = useIsFocused();
    useEffect(() => {
        const sync = () =>
            frame.setActive(isFocused && AppState.currentState === "active");
        sync();
        const sub = AppState.addEventListener("change", sync);
        return () => sub.remove();
    }, [isFocused, frame]);

    // ── Per-instance transforms (position + scale) ────────────────────────────
    const transforms = useRSXformBuffer(PARTICLE_COUNT, (val, i) => {
        "worklet";
        const p = particles.value[i];
        const diameter = p.size * RENDER_DIAMETER_FACTOR;
        const scale = diameter / SPRITE;
        const half = diameter / 2;
        // scos=scale, ssin=0 (no rotation); translate so sprite center sits at (x,y).
        val.set(scale, 0, p.x - half, p.y - half);
    });

    // ── Per-instance colour (neon tint + opacity from lighting) ───────────────
    // Direct port of the old sampleLight() + colour/opacity ramp, now a worklet.
    // With colorBlendMode="modulate" the white sprite is multiplied by this colour;
    // alpha carries the per-particle opacity.
    const colors = useColorBuffer(PARTICLE_COUNT, (val, i) => {
        "worklet";
        const p = particles.value[i];
        const lights = lightsShared.value;
        const intens = intensityShared.value;

        let totalW = 0;
        let wr = 0;
        let wg = 0;
        let wb = 0;
        let maxContrib = 0;

        for (let k = 0; k < lights.length; k++) {
            const l = lights[k];
            const dx = p.x - l.x;
            const dy = p.y - l.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const inf = 1 - dist / l.radius;
            if (inf <= 0) continue;
            const intensity = intens[l.id] ?? l.intensity;
            const contrib = inf * inf * intensity;
            if (contrib <= 0) continue;
            if (contrib > maxContrib) maxContrib = contrib;
            // ^4 so the nearest light dominates the tint (avoids grey averaging).
            const w = contrib * contrib * contrib * contrib;
            totalW += w;
            wr += w * l.r;
            wg += w * l.g;
            wb += w * l.b;
        }

        let r = 1;
        let g = 1;
        let b = 1;
        let influence = 0;
        if (totalW > 0) {
            r = wr / totalW;
            g = wg / totalW;
            b = wb / totalW;
            influence = maxContrib;
        }

        const t = influence * 2 < 1 ? influence * 2 : 1;
        const fr = GREY + (r - GREY) * t;
        const fg = GREY + (g - GREY) * t;
        const fb = GREY + (b - GREY) * t;
        let opacity = 0.04 + influence * influence * 5;
        if (opacity > 1) opacity = 1;

        val[0] = fr;
        val[1] = fg;
        val[2] = fb;
        val[3] = opacity;
    });

    return (
        <Canvas
            style={{
                position: "absolute",
                top: 0,
                left: 0,
                width,
                height,
                backgroundColor: "transparent",
            }}
            pointerEvents="none"
        >
            {/* blendMode="plus" = additive — particles add light rather than occlude */}
            <Group blendMode="plus">
                <Atlas
                    image={sprite}
                    sprites={sprites}
                    transforms={transforms}
                    colors={colors}
                    colorBlendMode="modulate"
                />
            </Group>
        </Canvas>
    );
}
