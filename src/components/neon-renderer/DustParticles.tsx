import { BlurMask, Canvas, Circle, Group, Paint } from "@shopify/react-native-skia";
import { useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";

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
 * Compute the maximum light contribution at (x, y) across all sources.
 * Returns { influence 0–1, r, g, b } of the dominant light.
 */
function sampleLight(
  x: number,
  y: number,
  lights: LightSource[]
): { influence: number; r: number; g: number; b: number } {
  let best = 0;
  let br = 1, bg = 1, bb = 1;

  for (const l of lights) {
    const dx = x - l.x;
    const dy = y - l.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const inf = Math.max(0, 1 - dist / l.radius);
    const contrib = inf * inf * l.intensity;
    if (contrib > best) {
      best = contrib;
      br = l.r;
      bg = l.g;
      bb = l.b;
    }
  }

  return { influence: best, r: br, g: bg, b: bb };
}

function clampSpeed(v: number): number {
  return Math.max(-MAX_SPEED, Math.min(MAX_SPEED, v));
}

// ── Component ──────────────────────────────────────────────────────────────

type Props = {
  lights: LightSource[];
  width: number;
  height: number;
};

export function DustParticles({ lights, width, height }: Props) {
  const [particles, setParticles] = useState<Particle[]>(() =>
    initParticles(width, height)
  );

  // Keep lights ref so the interval callback always reads the latest list
  // without needing to be recreated.
  const lightsRef = useRef(lights);
  lightsRef.current = lights;

  useEffect(() => {
    const id = setInterval(() => {
      setParticles((prev) =>
        prev.map((p) => {
          // Brownian drift
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
        })
      );
    }, UPDATE_INTERVAL_MS);

    return () => clearInterval(id);
  }, [width, height]);

  // All particles are always rendered.
  // In darkness: extremely faint neutral grey — barely perceptible dust.
  // Near a neon: lerp toward the neon's colour and brighten, like real dust
  // scattering light when it passes through a beam.
  const BASE_OPACITY = 0.03;
  const LIT_OPACITY_MAX = 0.52;

  const rendered = particles.map((p) => {
    const { influence, r, g, b } = sampleLight(p.x, p.y, lightsRef.current);

    // t=0 → neutral grey, t=1 → full neon colour (reaches 1 at influence≥0.5)
    const t = Math.min(influence * 2, 1);
    const GREY = 0.55;
    const fr = GREY + (r - GREY) * t;
    const fg = GREY + (g - GREY) * t;
    const fb = GREY + (b - GREY) * t;

    const opacity = BASE_OPACITY + Math.min(influence * 0.65, LIT_OPACITY_MAX);

    return { p, color: rgbToHex(fr, fg, fb), opacity };
  });

  return (
    <Canvas style={{ position: "absolute", top: 0, left: 0, width, height }} pointerEvents="none">
      <Group>
        {rendered.map(({ p, color, opacity }, idx) => (
            <Circle key={idx} cx={p.x} cy={p.y} r={p.size}>
              <Paint color={color} opacity={opacity}>
                {/* outer-style blur: glow extends outside the circle with no
                    opaque interior — produces a pure soft haze, like a real
                    illuminated dust mote with no hard dark core */}
                <BlurMask blur={p.size * 1.8} style="outer" />
              </Paint>
            </Circle>
          ))}
      </Group>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: {
    ...StyleSheet.absoluteFillObject,
    // Render above everything — particles float in front of neon tubes
    zIndex: 10,
  },
});
