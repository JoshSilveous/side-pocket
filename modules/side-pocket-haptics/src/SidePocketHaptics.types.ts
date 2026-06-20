/**
 * Best haptic tier a device supports:
 * - `fine`  — iOS Core Haptics: continuous events with intensity/sharpness curves.
 * - `basic` — amplitude-controlled vibration (Android with amplitude control).
 * - `none`  — single-buzz fallback only, or no vibrator at all.
 */
export type HapticTier = "fine" | "basic" | "none";
