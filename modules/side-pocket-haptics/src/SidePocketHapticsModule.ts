import { NativeModule, requireNativeModule } from "expo";

import type { HapticTier } from "./SidePocketHaptics.types";

declare class SidePocketHapticsModule extends NativeModule<{}> {
  /** Best haptic tier this device supports. Query once and cache. */
  getCapability(): HapticTier;

  /** Warm the haptic engine (iOS) so the first play has no cold-start latency. */
  prepare(): Promise<void>;

  /** Cancel any in-progress haptic playback. */
  stop(): void;

  /** A single crisp tap. `intensity` and `sharpness` are 0..1 (sharpness iOS-only). */
  playTransient(intensity: number, sharpness: number): void;

  /** A steady buzz held for `durationMs` at fixed `intensity`/`sharpness` (0..1). */
  playContinuous(durationMs: number, intensity: number, sharpness: number): void;

  /** Start a sustained buzz that plays until `stopContinuous()` (e.g. button hold). */
  startContinuous(intensity: number, sharpness: number): void;

  /** Stop the buzz started by `startContinuous()`. */
  stopContinuous(): void;

  /**
   * The "sizzle": one continuous buzz over `durationMs` whose intensity follows
   * `intensities` (0..1 samples, spread evenly across the duration). This is the
   * primitive the ripple feature drives.
   */
  playCurve(durationMs: number, intensities: number[], sharpness: number): void;
}

export default requireNativeModule<SidePocketHapticsModule>("SidePocketHaptics");
