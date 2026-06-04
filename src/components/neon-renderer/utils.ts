/**
 * Convert a hue (0–360) to an RGB triple (each 0–1).
 * Saturation is fixed at 100%, lightness at 50% — the most vivid neon hue.
 */
export function hueToRgb(hue: number): [number, number, number] {
  const h = ((hue % 360) + 360) % 360;
  const s = 1;
  const l = 0.5;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

/**
 * Convert a hue to a warm highlight color — same hue but lighter and
 * less saturated, mimicking the white-hot core of a real neon tube.
 */
export function hueToWarmRgb(hue: number): [number, number, number] {
  const h = ((hue % 360) + 360) % 360;
  const s = 0.8;
  const l = 0.75;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

/**
 * Convert RGB (each 0–1) to a CSS hex string.
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
