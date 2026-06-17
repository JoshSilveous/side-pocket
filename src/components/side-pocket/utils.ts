import { Skia, type SkMatrix, type SkPath } from "@shopify/react-native-skia";

/**
 * Parse an SVG path "d" string and scale it, returning an immutable SkPath.
 * Uses the PathBuilder API (addPath applies the matrix while appending) so we
 * avoid the deprecated mutating `SkPath.transform()` / `addPath()`.
 */
export function scaledSkPath(d: string, matrix: SkMatrix): SkPath {
    const parsed = Skia.Path.MakeFromSVGString(d);
    if (!parsed) return Skia.Path.Make();
    return Skia.PathBuilder.Make().addPath(parsed, matrix).build();
}

/** Build a uniform scale matrix. */
export function scaleMatrix(scale: number): SkMatrix {
    const m = Skia.Matrix();
    m.scale(scale, scale);
    return m;
}

/** Parse "#rrggbb" → [r,g,b] each 0..1. Falls back to red on bad input. */
export function hexToRgb01(hex: string): [number, number, number] {
    const h = hex.trim().replace("#", "");
    if (h.length !== 6) return [1, 0.13, 0.13];
    const n = parseInt(h, 16);
    if (Number.isNaN(n)) return [1, 0.13, 0.13];
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Lighten a hex colour toward white by `amt` (0..1) — used for the warm tube core. */
export function lightenHex(hex: string, amt: number): string {
    const [r, g, b] = hexToRgb01(hex);
    const mix = (v: number) => Math.round((v + (1 - v) * amt) * 255);
    const to = (v: number) => mix(v).toString(16).padStart(2, "0");
    return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * Walk every contour of `path` by arc length, emitting evenly-spaced points into a
 * flat [x0,y0,x1,y1,...] array, offset into content coordinates (local point + box
 * offset + scroll). Spacing widens automatically to stay under `maxPoints` — kept
 * small per path because the dust worklet loops every emitter per particle (640x).
 */
export function sampleEmitters(
    path: SkPath,
    offsetX: number,
    offsetY: number,
    scrollY: number,
    maxPoints: number,
    minSpacing: number,
): number[] {
    let total = 0;
    const lenIter = Skia.ContourMeasureIter(path, false, 1);
    let lenC = lenIter.next();
    while (lenC) {
        total += lenC.length();
        lenC = lenIter.next();
    }
    if (total <= 0) return [];
    const spacing = Math.max(minSpacing, total / maxPoints);

    const out: number[] = [];
    const iter = Skia.ContourMeasureIter(path, false, 1);
    let contour = iter.next();
    while (contour) {
        const len = contour.length();
        const steps = Math.max(1, Math.round(len / spacing));
        for (let s = 0; s < steps; s++) {
            const [pos] = contour.getPosTan((s / steps) * len);
            out.push(offsetX + pos.x, offsetY + pos.y + scrollY);
        }
        contour = iter.next();
    }
    return out;
}
