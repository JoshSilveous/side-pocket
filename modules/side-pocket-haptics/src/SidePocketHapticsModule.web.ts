import { registerWebModule, NativeModule } from "expo";

import type { HapticTier } from "./SidePocketHaptics.types";

// Haptics are unavailable on web — always report the "none" tier.
class SidePocketHapticsModule extends NativeModule<{}> {
  getCapability(): HapticTier {
    return "none";
  }
}

export default registerWebModule(
  SidePocketHapticsModule,
  "SidePocketHapticsModule",
);
