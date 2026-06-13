import { BlurMask, Canvas, Circle, Group } from "@shopify/react-native-skia";
import { useEffect, useRef, useState } from "react";

import type { LightSource } from "./types";
import { rgbToHex } from "./utils";

// ── Constants ──────────────────────────────────────────────────────────────

const PARTICLE_COUNT = 80;
const UPDATE_INTERVAL_MS = 33; // ~30 fps is plenty for slow drifting dust
const MAX_SPEED = 0.35;
const DRIFT_JITTER = 0.04;

// ── Types ──────────────────────────────────────────────────────────────────

type Particle = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** Radius in pixels */
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

/**
 * Weighted-average light colour across ALL contributing sources.
 *
 * Previously this took the dominant (max-contribution) light and snapped to its
 * colour, producing a hard jump as a particle passed between two neons.
 * Now every light's contribution is blended by weight so the colour fades
 * smoothly — just like real dust scattering from multiple sources.
 *
 * `influence` is still the max single-source contribution, used for opacity
 * (so one very close light makes the particle bright, not the sum of all lights).
 */
function sampleLight(
    x: number,
    y: number,
    lights: LightSource[],
): { influence: number; r: number; g: number; b: number } {
    let totalW = 0;
    let wr = 0, wg = 0, wb = 0;
    let maxContrib = 0;

    for (const l of lights) {
        const dx = x - l.x;
        const dy = y - l.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const inf = Math.max(0, 1 - dist / l.radius);
        const contrib = inf * inf * l.intensity;
        if (contrib <= 0) continue;

        if (contrib > maxContrib) maxContrib = contrib;

        // Raise contribution to power 4 before weighting the colour.
        // This makes the dominant (nearest) light win colour overwhelmingly —
        // a particle at 0.7 vs 0.3 contrib gives ~97 % / 3 % colour split.
        // Without this, complementary colours (e.g. red + cyan) average to grey.
        const w = contrib * contrib * contrib * contrib;
        totalW += w;
        wr += w * l.r;
        wg += w * l.g;
        wb += w * l.b;
    }

    if (totalW === 0) return { influence: 0, r: 1, g: 1, b: 1 };

    return {
        influence: maxContrib,  // opacity still driven by closest single light
        r: wr / totalW,
        g: wg / totalW,
        b: wb / totalW,
    };
}

function clampSpeed(v: number): number {
    return Math.max(-MAX_SPEED, Math.min(MAX_SPEED, v));
}

// ── Component ──────────────────────────────────────────────────────────────

type Props = {
    lights: LightSource[];
    width: number;
    height: number;
    /**
     * Parallax render offset (scrollOffset * 2). Dust is the nearest layer so
     * it moves fastest. Positions wrap with mod() so particles always fill the
     * screen regardless of scroll depth.
     */
    dustScrollY?: number;
};

export function DustParticles({ lights, width, height, dustScrollY = 0 }: Props) {
    const [particles, setParticles] = useState<Particle[]>(() =>
        initParticles(width, height),
    );

    // Keep lights ref so the interval callback always reads the latest list
    // without needing to be recreated.
    const lightsRef = useRef(lights);
    lightsRef.current = lights;

    useEffect(() => {
        const id = setInterval(() => {
            setParticles((prev) =>
                prev.map((p) => {
                    const nvx = clampSpeed(p.vx + (Math.random() - 0.5) * DRIFT_JITTER);
                    const nvy = clampSpeed(p.vy + (Math.random() - 0.5) * DRIFT_JITTER);
                    let nx = p.x + nvx;
                    let ny = p.y + nvy;

                    // Wrap at edges
                    if (nx < 0) nx = width;
                    if (nx > width) nx = 0;
                    if (ny < 0) ny = height;
                    if (ny > height) ny = 0;

                    return { ...p, x: nx, y: ny, vx: nvx, vy: nvy };
                }),
            );
        }, UPDATE_INTERVAL_MS);

        return () => clearInterval(id);
    }, [width, height]);

    const rendered = particles.map((p) => {
        // Parallax: dust is the closest layer so it moves at 2× scroll speed.
        // Wrap with modulo so particles always fill the canvas regardless of how
        // far the user has scrolled — avoids the "all particles disappeared" problem.
        const rawY = p.y - dustScrollY;
        const renderedY = ((rawY % height) + height) % height;

        // Sample lighting at the particle's SCREEN position (after parallax).
        // Lights passed in are already adjusted to screen coords by NeonRenderer.
        const { influence, r, g, b } = sampleLight(p.x, renderedY, lightsRef.current);

        // t=0 → neutral grey,  t=1 → full neon colour
        const t = Math.min(influence * 2, 1);
        const GREY = 0.55;
        const fr = GREY + (r - GREY) * t;
        const fg = GREY + (g - GREY) * t;
        const fb = GREY + (b - GREY) * t;

        // Opacity: squared falloff — nearly invisible far from neon, ramps hard close.
        const opacity = Math.min(0.04 + influence * influence * 5, 1);

        return { p, renderedY, color: rgbToHex(fr, fg, fb), opacity };
    });

    return (
        <Canvas
            style={{ position: "absolute", top: 0, left: 0, width, height, backgroundColor: "transparent" }}
            pointerEvents="none"
        >
            {/* blendMode="plus" = additive — particles add light rather than occlude */}
            <Group blendMode="plus">
                {rendered.map(({ p, renderedY, color, opacity }, idx) => (
                    <Circle
                        key={idx}
                        cx={p.x}
                        cy={renderedY}
                        r={p.size}
                        color={color}
                        opacity={opacity}
                    >
                        <BlurMask blur={p.size * 0.7} style="normal" />
                    </Circle>
                ))}
            </Group>
        </Canvas>
    );
}
