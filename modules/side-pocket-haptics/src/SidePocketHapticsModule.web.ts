import { registerWebModule, NativeModule } from "expo";

import type { HapticTier } from "./SidePocketHaptics.types";

// Haptics are unavailable on web — report "none" and make every call a safe no-op.
class SidePocketHapticsModule extends NativeModule<{}> {
  getCapability(): HapticTier {
    return "none";
  }
  async prepare(): Promise<void> {}
  stop(): void {}
  playTransient(_intensity: number, _sharpness: number): void {}
  playContinuous(
    _durationMs: number,
    _intensity: number,
    _sharpness: number,
  ): void {}
  startContinuous(_intensity: number, _sharpness: number): void {}
  stopContinuous(): void {}
  playCurve(
    _durationMs: number,
    _intensities: number[],
    _sharpness: number,
  ): void {}
}

export default registerWebModule(
  SidePocketHapticsModule,
  "SidePocketHapticsModule",
);
