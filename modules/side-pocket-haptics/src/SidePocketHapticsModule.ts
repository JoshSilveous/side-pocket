import { NativeModule, requireNativeModule } from "expo";

import type { HapticTier } from "./SidePocketHaptics.types";

declare class SidePocketHapticsModule extends NativeModule<{}> {
  /** Best haptic tier this device supports. Query once and cache. */
  getCapability(): HapticTier;
}

export default requireNativeModule<SidePocketHapticsModule>("SidePocketHaptics");
