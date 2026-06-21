package expo.modules.sidepockethaptics

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SidePocketHapticsModule : Module() {

  private val vibrator: Vibrator?
    get() {
      val context = appContext.reactContext ?: return null
      return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val manager =
          context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        manager?.defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      }
    }

  private val hasAmplitude: Boolean
    get() =
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        (vibrator?.hasAmplitudeControl() ?: false)

  override fun definition() = ModuleDefinition {
    Name("SidePocketHaptics")

    // ── Capability ────────────────────────────────────────────────────────────
    // "basic" when the vibrator supports amplitude control (richer waveforms),
    // otherwise "none" (single-buzz fallback / no vibrator). Android is never "fine".
    Function("getCapability") {
      val v = vibrator
      when {
        v == null || !v.hasVibrator() -> "none"
        hasAmplitude -> "basic"
        else -> "none"
      }
    }

    // No persistent engine on Android — nothing to warm.
    AsyncFunction("prepare") {}

    Function("stop") { vibrator?.cancel() }

    // Start a sustained buzz held until stopContinuous() — e.g. a button hold.
    // A long one-shot we cancel on release (far longer than any real hold).
    Function("startContinuous") { intensity: Double, _: Double -> oneShot(60_000L, intensity) }

    Function("stopContinuous") { vibrator?.cancel() }

    // ── Playback ──────────────────────────────────────────────────────────────
    // Sharpness has no Android analogue, so it's accepted and ignored.
    Function("playTransient") { intensity: Double, _: Double ->
      oneShot(18L, intensity)
    }

    Function("playContinuous") { durationMs: Int, intensity: Double, _: Double ->
      oneShot(durationMs.toLong().coerceAtLeast(1L), intensity)
    }

    // The "sizzle": split duration into N equal segments, one per intensity sample.
    // With amplitude control we vary amplitude per segment; without it we fall back
    // to an on/off waveform (segment on when its sample clears a threshold).
    Function("playCurve") { durationMs: Int, intensities: List<Double>, _: Double ->
      val v = vibrator ?: return@Function
      val total = durationMs.toLong().coerceAtLeast(1L)
      val n = intensities.size.coerceAtLeast(1)
      val seg = (total / n).coerceAtLeast(1L)
      val timings = LongArray(n) { seg }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && hasAmplitude) {
        val amps = IntArray(n) { amplitude(intensities.getOrElse(it) { 0.0 }) }
        v.vibrate(VibrationEffect.createWaveform(timings, amps, -1))
      } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val onOff =
          LongArray(n) { if (intensities.getOrElse(it) { 0.0 } > 0.25) seg else 0L }
        v.vibrate(VibrationEffect.createWaveform(onOff, -1))
      } else {
        @Suppress("DEPRECATION") v.vibrate(total)
      }
    }
  }

  private fun oneShot(durationMs: Long, intensity: Double) {
    val v = vibrator ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      v.vibrate(VibrationEffect.createOneShot(durationMs, amplitude(intensity)))
    } else {
      @Suppress("DEPRECATION") v.vibrate(durationMs)
    }
  }

  // 0..1 → 1..255. Amplitude 0 means "device default", so floor positive values at 1.
  private fun amplitude(intensity: Double): Int =
    (intensity.coerceIn(0.0, 1.0) * 255).toInt().coerceIn(1, 255)
}
