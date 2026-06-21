import ExpoModulesCore
import CoreHaptics
import UIKit

public class SidePocketHapticsModule: Module {
  private var engine: CHHapticEngine?
  private var continuousPlayer: CHHapticPatternPlayer?

  private var supportsHaptics: Bool {
    CHHapticEngine.capabilitiesForHardware().supportsHaptics
  }

  public func definition() -> ModuleDefinition {
    Name("SidePocketHaptics")

    // ── Capability ────────────────────────────────────────────────────────────
    // "fine" when the Taptic Engine supports Core Haptics; otherwise "basic"
    // (UIKit feedback generators still work on older hardware). Never "none" on iOS.
    Function("getCapability") { () -> String in
      self.supportsHaptics ? "fine" : "basic"
    }

    // Warm the engine ahead of time so the first play has no cold-start latency.
    AsyncFunction("prepare") { (promise: Promise) in
      self.ensureEngine()
      promise.resolve(nil)
    }

    Function("stop") {
      self.stopContinuousPlayer()
      try? self.engine?.stop()
    }

    // Start a sustained buzz held until stopContinuous() — e.g. a button hold.
    Function("startContinuous") { (intensity: Double, sharpness: Double) in
      self.startContinuous(intensity: intensity, sharpness: sharpness)
    }

    Function("stopContinuous") {
      self.stopContinuousPlayer()
    }

    // ── Playback ──────────────────────────────────────────────────────────────
    // A single crisp tap. intensity/sharpness are 0..1.
    Function("playTransient") { (intensity: Double, sharpness: Double) in
      self.play(events: [
        self.transient(intensity: intensity, sharpness: sharpness, at: 0)
      ])
    }

    // A steady buzz held for `durationMs` at fixed intensity/sharpness.
    Function("playContinuous") {
      (durationMs: Int, intensity: Double, sharpness: Double) in
      let dur = max(0.01, Double(durationMs) / 1000.0)
      self.play(events: [
        self.continuous(
          intensity: intensity, sharpness: sharpness, at: 0, duration: dur)
      ])
    }

    // The "sizzle": one continuous event whose intensity follows `intensities`
    // (evenly spaced 0..durationMs) via a parameter curve. This is the primitive
    // the ripple feature will drive.
    Function("playCurve") {
      (durationMs: Int, intensities: [Double], sharpness: Double) in
      self.playCurve(
        durationMs: durationMs, intensities: intensities, sharpness: sharpness)
    }
  }

  // MARK: - Engine lifecycle

  private func ensureEngine() {
    guard supportsHaptics, engine == nil else { return }
    do {
      let e = try CHHapticEngine()
      e.isAutoShutdownEnabled = true
      e.stoppedHandler = { [weak self] _ in self?.engine = nil }
      e.resetHandler = { [weak self] in
        do { try self?.engine?.start() } catch { self?.engine = nil }
      }
      try e.start()
      engine = e
    } catch {
      engine = nil
    }
  }

  // MARK: - Event builders

  private func transient(intensity: Double, sharpness: Double, at t: TimeInterval)
    -> CHHapticEvent
  {
    CHHapticEvent(
      eventType: .hapticTransient,
      parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: clamp(intensity)),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: clamp(sharpness)),
      ],
      relativeTime: t)
  }

  private func continuous(
    intensity: Double, sharpness: Double, at t: TimeInterval, duration: TimeInterval
  ) -> CHHapticEvent {
    CHHapticEvent(
      eventType: .hapticContinuous,
      parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: clamp(intensity)),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: clamp(sharpness)),
      ],
      relativeTime: t,
      duration: duration)
  }

  // MARK: - Players

  private func play(events: [CHHapticEvent], curves: [CHHapticParameterCurve] = []) {
    guard supportsHaptics else {
      DispatchQueue.main.async {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
      }
      return
    }
    ensureEngine()
    guard let engine = engine else { return }
    do {
      let pattern = try CHHapticPattern(events: events, parameterCurves: curves)
      let player = try engine.makePlayer(with: pattern)
      try player.start(atTime: CHHapticTimeImmediate)
    } catch {
      // Swallow — a dropped buzz shouldn't crash the app.
    }
  }

  private func playCurve(durationMs: Int, intensities: [Double], sharpness: Double) {
    guard supportsHaptics else {
      DispatchQueue.main.async {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
      }
      return
    }
    let dur = max(0.01, Double(durationMs) / 1000.0)
    let event = CHHapticEvent(
      eventType: .hapticContinuous,
      parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: 1.0),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: clamp(sharpness)),
      ],
      relativeTime: 0,
      duration: dur)

    var points: [CHHapticParameterCurve.ControlPoint] = []
    let count = intensities.count
    if count == 0 {
      points = [.init(relativeTime: 0, value: 1.0)]
    } else {
      for (i, v) in intensities.enumerated() {
        let rt = count == 1 ? 0 : dur * Double(i) / Double(count - 1)
        points.append(.init(relativeTime: rt, value: clamp(v)))
      }
    }
    let curve = CHHapticParameterCurve(
      parameterID: .hapticIntensityControl, controlPoints: points, relativeTime: 0)
    play(events: [event], curves: [curve])
  }

  // MARK: - Sustained buzz (button hold)

  private func startContinuous(intensity: Double, sharpness: Double) {
    guard supportsHaptics else { return }
    ensureEngine()
    guard let engine = engine else { return }
    stopContinuousPlayer()
    // Long fixed duration — far longer than any real hold; stopped on release.
    let event = CHHapticEvent(
      eventType: .hapticContinuous,
      parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: clamp(intensity)),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: clamp(sharpness)),
      ],
      relativeTime: 0,
      duration: 60.0)
    do {
      let pattern = try CHHapticPattern(events: [event], parameterCurves: [])
      let player = try engine.makePlayer(with: pattern)
      try player.start(atTime: CHHapticTimeImmediate)
      continuousPlayer = player
    } catch {
      continuousPlayer = nil
    }
  }

  private func stopContinuousPlayer() {
    try? continuousPlayer?.stop(atTime: CHHapticTimeImmediate)
    continuousPlayer = nil
  }

  private func clamp(_ v: Double) -> Float {
    Float(min(1.0, max(0.0, v)))
  }
}
