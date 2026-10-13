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
import { memo, useEffect, useMemo } from "react";
import { AppState } from "react-native";
import {
    useDerivedValue,
    useFrameCallback,
    useSharedValue,
    type SharedValue,
} from "react-native-reanimated";

import { resolveFrame } from "./frame-math";
import type { FrameWorld, LightSource } from "./types";

// ── Constants ──────────────────────────────────────────────────────────────

const PARTICLE_COUNT = 640;
/**
 * Simulation cadence. Dust drifts at ~10px/s, so stepping at 25fps is visually
 * identical to the old 30fps while doing ~17% less work. The render itself is a
 * single Atlas draw on the UI thread regardless of cadence.
 */
const STEP_MS = 40;
const MAX_SPEED = 0.35;
const DRIFT_JITTER = 0.04;
const GREY = 0.55;

/**
 * Distance (px) from a tube at which dust closeness hits 0 (≈ "an inch"). Closeness
 * is 1 right on the tube, 0 at DUST_REACH away. The falloff curve below keeps dust
 * imperceptible until well within this — visible only within ~half of it.
 */
const DUST_REACH = 130;
/**
 * Opacity plateau for the 0.9–0.99 closeness band ("pretty bright but somewhat
 * dark"); the remaining headroom (1 − this) spikes in only as closeness → 1
 * (white-hot, right over the tube).
 */
const CURVE_MID = 0.35;
/**
 * Faint grey floor so dust far from any tube is "almost invisible" rather than
 * fully absent (keeps a little atmosphere). Set to 0 for none.
 */
const AMBIENT_OPACITY = 0.02;

/** Pixel size of the baked soft-dot sprite texture. */
const SPRITE = 48;
const SPRITE_SIZE = { width: SPRITE, height: SPRITE };
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

function initParticles(w: number, h: number, count: number): Particle[] {
    return Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * MAX_SPEED,
        vy: (Math.random() - 0.5) * MAX_SPEED,
        size: 0.8 + Math.random() * 1.2,
    }));
}

// ── Component ──────────────────────────────────────────────────────────────

type Props = {
    lightsShared: SharedValue<LightSource[]>;
    intensityShared: SharedValue<Record<string, number>>;
    scrollShared: SharedValue<number>;
    framesShared: SharedValue<Record<string, FrameWorld>>;
    width: number;
    height: number;
    particleCount?: number;
};

export const DustParticles = memo(function DustParticles({
    lightsShared,
    intensityShared,
    scrollShared,
    framesShared,
    width,
    height,
    particleCount = PARTICLE_COUNT,
}: Props) {
    "use no memo";
    // React Compiler hoists helpers out of Skia buffer worklets and reads their
    // shared-value dependencies during render. Keep this component's explicit
    // memoization until those transforms are compatible (see worklet check).

    // All particle state lives in a SharedValue and is advanced on the UI thread.
    // No React state → no per-frame reconciliation.
    const initialParticles = useMemo(
        () => initParticles(width, height, particleCount),
        [width, height, particleCount],
    );
    const particles = useSharedValue<Particle[]>(initialParticles);
    const acc = useSharedValue(0);

    // Re-seed when the canvas size changes.
    useEffect(() => {
        particles.value = initialParticles;
    }, [initialParticles, particles]);

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
        SPRITE_SIZE,
    );

    // Every instance samples the full sprite texture — static.
    const sprites = useMemo(
        () =>
            Array.from({ length: particleCount }, () =>
                Skia.XYWHRect(0, 0, SPRITE, SPRITE),
            ),
        [particleCount],
    );

    // ── Simulation (UI thread) ────────────────────────────────────────────────
    const frame = useFrameCallback((info) => {
        "worklet";
        acc.value += info.timeSincePreviousFrame ?? 16;
        if (acc.value < STEP_MS) return;
        acc.value = 0;

        // Notify the Atlas buffers after the in-place update, without allocating
        // a new particle array on every simulation step.
        particles.modify((arr) => {
            "worklet";
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
            return arr;
        });
    }, false);

    // Pause the simulation while the app is backgrounded.
    useEffect(() => {
        const sync = () =>
            frame.setActive(AppState.currentState === "active");
        sync();
        const sub = AppState.addEventListener("change", sync);
        return () => sub.remove();
    }, [frame]);

    // ── Per-instance transforms (position + scale) ────────────────────────────
    const transforms = useRSXformBuffer(particleCount, (val, i) => {
        "worklet";
        const p = particles.value[i];
        const diameter = p.size * RENDER_DIAMETER_FACTOR;
        const scale = diameter / SPRITE;
        const half = diameter / 2;
        // scos=scale, ssin=0 (no rotation); translate so sprite center sits at (x,y).
        val.set(scale, 0, p.x - half, p.y - half);
    });

    // Bounds only change with the structural light list, never on flicker or
    // particle motion. Keep the source and bounds together for consistent reads.
    const lightGeometry = useDerivedValue(() => {
        return lightsShared.value.map((light) => {
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            for (let e = 0; e < light.emitters.length; e += 2) {
                minX = Math.min(minX, light.emitters[e]);
                maxX = Math.max(maxX, light.emitters[e]);
                minY = Math.min(minY, light.emitters[e + 1]);
                maxY = Math.max(maxY, light.emitters[e + 1]);
            }
            return { light, minX, minY, maxX, maxY };
        });
    });

    // ── Per-instance colour (neon tint + opacity from tube lighting) ──────────
    // Closeness is measured to the nearest EMITTER of each tube (never a center),
    // then run through a tight falloff curve: ~invisible until close, ramps, then
    // white-hot right over the tube. With colorBlendMode="modulate" the white sprite
    // is multiplied by this colour; alpha carries the per-particle opacity.
    const colors = useColorBuffer(particleCount, (val, i) => {
        "worklet";
        const p = particles.value[i];
        const geometry = lightGeometry.value;
        const intens = intensityShared.value;
        const scroll = scrollShared.value;
        const frames = framesShared.value;

        const ss = (e0: number, e1: number, x: number) => {
            let t = (x - e0) / (e1 - e0);
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            return t * t * (3 - 2 * t);
        };

        let totalW = 0;
        let wr = 0;
        let wg = 0;
        let wb = 0;
        let bestAmt = 0; // dominant tube's curve-opacity (brightness-weighted)
        let bestC = 0; // dominant tube's distance closeness (drives white-hot blend)

        for (let k = 0; k < geometry.length; k++) {
            const bounds = geometry[k];
            const l = bounds.light;
            const f = resolveFrame(frames, l.frameId, scroll);
            if (!f) continue;
            const intensity = (intens[l.id] ?? l.intensity) * f.a;
            if (intensity <= 0) continue;
            // Use the live overdrive reach and the same frame mapping as
            // the exact emitter search. Outside this box no emitter contributes.
            const reach =
                (intensity <= 1
                    ? DUST_REACH
                    : DUST_REACH * (1 + (intensity - 1) * 0.4)) * f.s;
            if (
                p.x < f.ox + f.s * bounds.minX - reach ||
                p.x > f.ox + f.s * bounds.maxX + reach ||
                p.y < f.oy + f.s * bounds.minY - reach ||
                p.y > f.oy + f.s * bounds.maxY + reach
            ) {
                continue;
            }
            const em = l.emitters;
            // Nearest emitter of this tube, mapped through its frame to screen space.
            let minD2 = Infinity;
            for (let e = 0; e < em.length; e += 2) {
                const dx = p.x - (f.ox + f.s * em[e]);
                const dy = p.y - (f.oy + f.s * em[e + 1]);
                const d2 = dx * dx + dy * dy;
                if (d2 < minD2) minD2 = d2;
            }
            const c = 1 - Math.sqrt(minD2) / reach; // closeness 0..1
            if (c <= 0) continue;
            // Spatial falloff: flat <0.5, ramp to CURVE_MID by 0.9, spike to 1 at the tube.
            const shape = CURVE_MID * ss(0.5, 0.9, c) + (1 - CURVE_MID) * ss(0.95, 1.0, c);
            const amt = shape * intensity;
            if (amt <= 0) continue;

            if (amt > bestAmt) {
                bestAmt = amt;
                bestC = c;
            }
            // ^4 colour weighting so the nearest bright tube dominates the tint.
            const w = amt * amt * amt * amt;
            totalW += w;
            wr += w * l.r;
            wg += w * l.g;
            wb += w * l.b;
        }

        if (bestAmt <= 0) {
            // No tube in range — faint ambient grey dust only.
            val[0] = GREY;
            val[1] = GREY;
            val[2] = GREY;
            val[3] = AMBIENT_OPACITY;
            return;
        }

        // Tube hue (weighted blend), fading in from grey across the 0.5–0.9 band.
        const hr = wr / totalW;
        const hg = wg / totalW;
        const hb = wb / totalW;
        const tColor = ss(0.5, 0.9, bestC);
        let fr = GREY + (hr - GREY) * tColor;
        let fg = GREY + (hg - GREY) * tColor;
        let fb = GREY + (hb - GREY) * tColor;

        // White-hot core: blend toward white as closeness → 1 (matches the tube centre).
        const whiteMix = ss(0.9, 1.0, bestC);
        fr += (1 - fr) * whiteMix;
        fg += (1 - fg) * whiteMix;
        fb += (1 - fb) * whiteMix;

        val[0] = fr;
        val[1] = fg;
        val[2] = fb;
        // bestAmt can exceed 1 when a tube is overdriven (>100% power), but the
        // colour-buffer alpha must stay 0..1 (out-of-range values abort Skia). The
        // extra power still reads — more particles cross the visibility threshold.
        const a = bestAmt > AMBIENT_OPACITY ? bestAmt : AMBIENT_OPACITY;
        val[3] = a > 1 ? 1 : a;
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
});
