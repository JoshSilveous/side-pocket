package expo.modules.sidepockethaptics

import android.content.Context
import android.os.Build
import android.os.Vibrator
import android.os.VibratorManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SidePocketHapticsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SidePocketHaptics")

    // "basic" when the vibrator supports amplitude control (richer waveforms),
    // otherwise "none" (single-buzz fallback / no vibrator). Android is never "fine".
    Function("getCapability") {
      val context = appContext.reactContext ?: return@Function "none"
      val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val manager =
          context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        manager?.defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      }
      when {
        vibrator == null || !vibrator.hasVibrator() -> "none"
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
          vibrator.hasAmplitudeControl() -> "basic"
        else -> "none"
      }
    }
  }
}
