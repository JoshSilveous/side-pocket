import ExpoModulesCore
import CoreHaptics

public class SidePocketHapticsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SidePocketHaptics")

    // "fine" when the Taptic Engine supports Core Haptics; otherwise "basic"
    // (UIKit feedback generators still work on older hardware). Never "none" on iOS.
    Function("getCapability") { () -> String in
      CHHapticEngine.capabilitiesForHardware().supportsHaptics ? "fine" : "basic"
    }
  }
}
