import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import {
    cancelAnimation,
    makeMutable,
    runOnJS,
    runOnUI,
    useFrameCallback,
    useSharedValue,
    withDelay,
    withSequence,
    withTiming,
    type SharedValue,
} from "react-native-reanimated";

import { splashArt } from "@/generated/splash-paths";
import { useNeonRenderer } from "../neon-renderer/NeonRendererContext";
import { ColdTubes } from "./ColdTubes";
import { PathLight } from "./PathLight";
import { PathTube } from "./PathTube";
import { lightenHex, scaledSkPath, scaleMatrix } from "./utils";

// ════════════════════════════════════════════════════════════════════════════
//  CONFIG — tweak the sign here.
// ════════════════════════════════════════════════════════════════════════════

/** The artwork. `paths` are SVG path strings in `viewBox` coords, in draw order. */
const SIGN = splashArt;

/** Default tube colour for any path not overridden below. */
const DEFAULT_COLOR = "#ba1616";

/**
 * Per-path colour overrides, keyed by index (= draw order in splash.svg: the
 * "SIDE POCKET" letters come first, then the pool cue + accent lines). Anything
 * not listed uses DEFAULT_COLOR.
 *
 *   const PATH_COLORS = { 0: "#39ff14", 5: "#1e90ff", 14: "#ffd400" };
 */
const STICK_BUTT_COLOR = "#ffc31e";
const STICK_MID_COLOR = "#ff8f1e";
const STICK_LONG_COLOR = "#ffc31e";
const STICK_TIP_COLOR = "#148dff";

const PATH_COLORS = {
    18: STICK_BUTT_COLOR,
    19: STICK_BUTT_COLOR,
    20: STICK_BUTT_COLOR,
    21: STICK_MID_COLOR,
    22: STICK_TIP_COLOR,
    29: STICK_LONG_COLOR,
    30: STICK_LONG_COLOR,
};

/** Power-on timing. Each tube waits a random delay in this range, then flickers on. */
const POWER_ON_MIN_DELAY_MS = 0;
const POWER_ON_MAX_DELAY_MS = 1000;

/**
 * Staged "false start": when power-on is triggered, the whole animation restarts
 * after each of these gaps (ms) before the final run is allowed to play out. This
 * recreates the effect of tapping POWER ON a few times in quick succession — the
 * sign begins to appear, cuts out, and restarts a couple times before settling on.
 * Set to [] for a single clean power-on.
 */
const POWER_ON_RESTART_GAPS_MS = [367, 292];

/**
 * Ripple tap: when you tap the sign, each tube's power-on delay grows with its
 * distance (in content px) from the tap point — so the flicker ripples outward
 * from where you touched. Jitter keeps it organic rather than a clean wavefront.
 */
const RIPPLE_MS_PER_PX = 2.2;
const RIPPLE_JITTER_MS = 90;

/**
 * Tap emits two ripples from the touch point: first an OFF wave (each tube snaps
 * dark as the wave reaches it), then an ON wave that glitches each tube back on.
 * Both waves share the same per-tube delay, so the ON wave trails the OFF wave by
 * a constant gap (snap-off duration + dark dwell) — reads as two ripples chasing
 * each other outward.
 */
const POWER_OFF_DURATION_MS = 90; // quick snap to dark
const RIPPLE_OFF_HOLD_MS = 200; // how long a tube stays dark before glitching on

/**
 * Tap hit-testing: a tap only fires a ripple if it lands within this many px of an
 * actual tube (added on each side of the visible tube width) — not anywhere in the
 * padded bounding box. Bumps the thin tubes up to a finger-friendly target.
 */
const TAP_HIT_SLOP = 12;

/**
 * The "power on" glitch as keyframes — `[durationMs, targetValue]`, starting from
 * 0. Single source of truth: the Reanimated `powerOnAnimation()` (default power-on)
 * and the worklet `rippleGlitchOn()` (overlapping taps) both read it, so they can't
 * drift apart.
 */
const GLITCH_KEYFRAMES: readonly (readonly [number, number])[] = [
    [70, 0.55], // first surge
    [60, 0.05], // flicker off
    [70, 0.9], // surge again
    [50, 0.18], // brief dip
    [160, 1], // settle fully on
];
const GLITCH_DURATION_MS = GLITCH_KEYFRAMES.reduce((s, [d]) => s + d, 0);

/**
 * The per-tube "power on" animation: brightness 0 → 1 with a couple of brief
 * flickers, like a tube warming up. Used by the default (non-tap) power-on.
 */
function powerOnAnimation() {
    return withSequence(
        ...GLITCH_KEYFRAMES.map(([duration, value]) =>
            withTiming(value, { duration }),
        ),
    );
}

// ── Worklet curves (UI thread) — used to blend overlapping tap ripples ──

/** Piecewise-linear evaluation of GLITCH_KEYFRAMES at glitch-time `gt` (ms). */
function rippleGlitchOn(gt: number): number {
    "worklet";
    if (gt <= 0) return 0;
    let t0 = 0;
    let prev = 0;
    for (let k = 0; k < GLITCH_KEYFRAMES.length; k++) {
        const dur = GLITCH_KEYFRAMES[k][0];
        const val = GLITCH_KEYFRAMES[k][1];
        if (gt < t0 + dur) return prev + ((gt - t0) / dur) * (val - prev);
        t0 += dur;
        prev = val;
    }
    return 1;
}

/**
 * One ripple's brightness for a tube whose wave-arrival delay is `delay` ms, at
 * `elapsed` ms since the ripple started: lit (1) until the wave arrives, then the
 * OFF snap, dark dwell, and ON glitch.
 */
function rippleBrightnessAt(elapsed: number, delay: number): number {
    "worklet";
    const t = elapsed - delay;
    if (t <= 0) return 1; // wave hasn't reached this tube yet → stays lit
    if (t < POWER_OFF_DURATION_MS) return 1 - t / POWER_OFF_DURATION_MS; // OFF snap
    const t2 = t - POWER_OFF_DURATION_MS;
    if (t2 < RIPPLE_OFF_HOLD_MS) return 0; // dark dwell
    return rippleGlitchOn(t2 - RIPPLE_OFF_HOLD_MS); // ON glitch
}

/** Deterministic 0..1 jitter per (tube, ripple) so delays look organic but are
 *  stable frame-to-frame (a fresh random each frame would make brightness jump). */
function rippleJitter(i: number, seed: number): number {
    "worklet";
    const x = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
    return x - Math.floor(x);
}

// ════════════════════════════════════════════════════════════════════════════

const PAD = 32; // glow padding around the sign (px)

export type SidePocketNeonHandle = {
    /** Replay the power-on animation (random per-tube delays + flicker). */
    powerOn: () => void;
    /**
     * Replay the power-on animation rippling outward from a point, in content
     * coords (origin = sign art top-left, before the glow PAD).
     */
    powerOnFrom: (x: number, y: number) => void;
    /** Snap every tube to a fixed brightness (0..1) with no animation. */
    setBrightness: (value: number) => void;
};

type Props = {
    /** Target on-screen width (px). Height follows the art's aspect ratio. */
    width: number;
    /** Tube thickness (screen px). */
    tubeWidth?: number;
    /** Play the power-on animation automatically on mount. Default: true. */
    autoPlay?: boolean;
    /** Tap the sign to replay the power-on animation. Default: true. */
    tapToReplay?: boolean;
    style?: StyleProp<ViewStyle>;
};

/**
 * The Side Pocket neon sign. Each tube is an individual path with its own colour
 * (PATH_COLORS) and its own brightness SharedValue, which also drives that tube's
 * wall + dust light. The sign animates "on" on mount and can be replayed via the
 * `powerOn()` handle (see the ref below).
 *
 * Architecture note: the shared <Canvas> contains only pure Skia <PathTube>s
 * (RN Skia's canvas reconciler can't run hooks/context). The matching <PathLight>s
 * live in the normal React tree and register each tube as a NeonRenderer light.
 */
export const SidePocketNeon = forwardRef<SidePocketNeonHandle, Props>(
    function SidePocketNeon(
        { width, tubeWidth = 4, autoPlay = true, tapToReplay = true, style },
        ref,
    ) {
        const renderer = useNeonRenderer();
        const rendererRef = useRef(renderer);
        rendererRef.current = renderer;
        const viewRef = useRef<View>(null);
        const restartTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
        const [origin, setOrigin] = useState<{ x: number; y: number } | null>(
            null,
        );

        const scale = width / SIGN.viewBox.width;
        const signW = SIGN.viewBox.width * scale;
        const signH = SIGN.viewBox.height * scale;

        // Parse + scale each path once.
        const scaled = useMemo(() => {
            const matrix = scaleMatrix(scale);
            return SIGN.paths.map((d) => scaledSkPath(d, matrix));
        }, [scale]);

        // Per-tube colours (+ a lightened warm core), resolved from PATH_COLORS.
        const colors = useMemo(
            () =>
                SIGN.paths.map(
                    (_, i) =>
                        PATH_COLORS[i as keyof typeof PATH_COLORS] ??
                        DEFAULT_COLOR,
                ),
            [],
        );
        const warmColors = useMemo(
            () => colors.map((c) => lightenHex(c, 0.6)),
            [colors],
        );

        // One brightness SharedValue per tube. makeMutable (not useSharedValue) so we
        // can have N of them without calling a hook in a loop. Drives both the tube
        // glow opacity and the wall/dust light intensity.
        const brightness = useMemo<SharedValue<number>[]>(
            () => SIGN.paths.map(() => makeMutable(autoPlay ? 0 : 1)),
            // Count is fixed; created once.
            // eslint-disable-next-line react-hooks/exhaustive-deps
            [],
        );

        // Each tube's geometric centre in content coords — used to turn a tap
        // point into a distance-based ripple delay. Computed once per layout.
        const centers = useMemo(
            () =>
                scaled.map((p) => {
                    const b = p.getBounds();
                    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
                }),
            [scaled],
        );

        // ── Overlapping tap ripples ──
        //
        // A single brightness SharedValue can only run ONE Reanimated animation, so
        // tapping again would cancel the previous ripple. Instead each tap appends a
        // ripple { origin, seed, start } to this list, and a frame callback recomputes
        // every tube's brightness as the MIN across all live ripples (1 = lit). Taps in
        // different places then overlap and collide naturally — the darkest wave wins,
        // and a tube relights only once every wave has passed it.
        type Ripple = { x: number; y: number; seed: number; start: number };
        const ripples = useSharedValue<Ripple[]>([]);

        // A ripple is finished once its wave has crossed the whole sign and every tube
        // has glitched back on. Generous bound from the sign's diagonal.
        const rippleLifetime = useMemo(() => {
            const diag = Math.hypot(signW, signH);
            return (
                diag * RIPPLE_MS_PER_PX +
                RIPPLE_JITTER_MS +
                POWER_OFF_DURATION_MS +
                RIPPLE_OFF_HOLD_MS +
                GLITCH_DURATION_MS +
                100
            );
        }, [signW, signH]);

        const rippleFrameRef = useRef<{
            setActive: (active: boolean) => void;
        } | null>(null);
        const deactivateRipples = useCallback(() => {
            rippleFrameRef.current?.setActive(false);
        }, []);

        // Runs only while ripples are live (transient, ~1.5s after the last tap), then
        // deactivates itself — no idle cost. Per frame: ~N tubes × M ripples cheap math.
        const rippleFrame = useFrameCallback((frame) => {
            "worklet";
            const list = ripples.value;
            if (list.length === 0) return;
            const now = frame.timestamp;

            // Stamp freshly-added ripples (start < 0) and drop finished ones.
            const alive: Ripple[] = [];
            for (let r = 0; r < list.length; r++) {
                const rip = list[r];
                const start = rip.start < 0 ? now : rip.start;
                if (now - start <= rippleLifetime) {
                    alive.push({
                        x: rip.x,
                        y: rip.y,
                        seed: rip.seed,
                        start,
                    });
                }
            }
            ripples.value = alive;

            // Each tube: darkest contribution across all live ripples wins.
            for (let i = 0; i < brightness.length; i++) {
                const c = centers[i];
                let b = 1;
                for (let r = 0; r < alive.length; r++) {
                    const rip = alive[r];
                    const dx = c.x - rip.x;
                    const dy = c.y - rip.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const delay =
                        dist * RIPPLE_MS_PER_PX +
                        rippleJitter(i, rip.seed) * RIPPLE_JITTER_MS;
                    const v = rippleBrightnessAt(now - rip.start, delay);
                    if (v < b) b = v;
                }
                brightness[i].value = b;
            }

            // All ripples done → settle fully lit and stop the loop.
            if (alive.length === 0) {
                for (let i = 0; i < brightness.length; i++) {
                    brightness[i].value = 1;
                }
                runOnJS(deactivateRipples)();
            }
        }, false);
        rippleFrameRef.current = rippleFrame;

        // ── Imperative controls ──

        // Cancel any pending staged restarts from a previous trigger.
        const clearRestarts = useCallback(() => {
            restartTimers.current.forEach(clearTimeout);
            restartTimers.current = [];
        }, []);

        // One full power-on pass: reset every tube to off, then flicker each on
        // after the delay returned by `delayFor(tubeIndex)`.
        const runPowerOnOnce = useCallback(
            (delayFor: (index: number) => number) => {
                brightness.forEach((sv, i) => {
                    cancelAnimation(sv);
                    sv.value = 0;
                    sv.value = withDelay(
                        Math.max(0, delayFor(i)),
                        powerOnAnimation(),
                    );
                });
            },
            [brightness],
        );

        // Staged "false start": run now, then restart after each gap, then let the
        // final pass play out (see POWER_ON_RESTART_GAPS_MS).
        const playStaged = useCallback(
            (delayFor: (index: number) => number) => {
                clearRestarts();
                runPowerOnOnce(delayFor);
                let elapsed = 0;
                for (const gap of POWER_ON_RESTART_GAPS_MS) {
                    elapsed += gap;
                    restartTimers.current.push(
                        setTimeout(() => runPowerOnOnce(delayFor), elapsed),
                    );
                }
            },
            [clearRestarts, runPowerOnOnce],
        );

        // Random per-tube delay (used on mount / the plain powerOn()). Takes back
        // control from the tap ripple loop so the two don't fight over brightness.
        const powerOn = useCallback(() => {
            rippleFrame.setActive(false);
            ripples.value = [];
            playStaged(
                () =>
                    POWER_ON_MIN_DELAY_MS +
                    Math.random() *
                        (POWER_ON_MAX_DELAY_MS - POWER_ON_MIN_DELAY_MS),
            );
        }, [playStaged, rippleFrame, ripples]);

        // Tap: append a ripple from the touch point and make sure the frame loop is
        // running. Overlapping taps stack — the frame callback blends them — so no
        // staged "false start" here (that's only for the default power-on).
        const powerOnFrom = useCallback(
            (x: number, y: number) => {
                clearRestarts();
                // Hand the tubes over to the frame loop: stop any Reanimated anims
                // (e.g. a default power-on still settling) so they don't fight it.
                brightness.forEach((sv) => cancelAnimation(sv));
                const seed = Math.random() * 1000;
                // Append on the UI thread so it can't race the frame callback's prune.
                runOnUI((rx: number, ry: number, rseed: number) => {
                    "worklet";
                    ripples.value = [
                        ...ripples.value,
                        { x: rx, y: ry, seed: rseed, start: -1 },
                    ];
                })(x, y, seed);
                rippleFrame.setActive(true);
            },
            [clearRestarts, brightness, ripples, rippleFrame],
        );

        const setBrightness = useCallback(
            (value: number) => {
                clearRestarts();
                rippleFrame.setActive(false);
                ripples.value = [];
                brightness.forEach((sv) => {
                    cancelAnimation(sv);
                    sv.value = value;
                });
            },
            [brightness, clearRestarts, rippleFrame, ripples],
        );

        // Filled hit-region per tube: the centerline stroked out to the visible tube
        // width + TAP_HIT_SLOP on each side, in content coords. Lets us test whether a
        // tap actually landed on a tube rather than in the (large) padded box.
        const hitPaths = useMemo(
            () =>
                scaled.map((p) => {
                    const c = p.copy();
                    const stroked = c.stroke({
                        width: tubeWidth + TAP_HIT_SLOP * 2,
                    });
                    return stroked ?? c;
                }),
            [scaled, tubeWidth],
        );

        // A tap (in Pressable-local coords) → content coords, then ripple only if it
        // hit a tube. Empty padding taps are ignored.
        const handleTap = useCallback(
            (localX: number, localY: number) => {
                const cx = localX - PAD;
                const cy = localY - PAD;
                for (const hp of hitPaths) {
                    if (hp.contains(cx, cy)) {
                        powerOnFrom(cx, cy);
                        return;
                    }
                }
            },
            [hitPaths, powerOnFrom],
        );

        useImperativeHandle(
            ref,
            () => ({ powerOn, powerOnFrom, setBrightness }),
            [powerOn, powerOnFrom, setBrightness],
        );

        // Play (or skip) the animation on mount; cancel timers + anims on unmount.
        useEffect(() => {
            if (autoPlay) powerOn();
            else setBrightness(1);
            return () => {
                clearRestarts();
                brightness.forEach((sv) => cancelAnimation(sv));
            };
        }, [autoPlay, powerOn, setBrightness, brightness, clearRestarts]);

        // Measure the sign's position so each tube's light emitters land on its
        // tubes. rendererRef avoids a re-register loop (the renderer context object
        // changes on every light registration).
        const measure = useCallback(() => {
            const rdr = rendererRef.current;
            const v = viewRef.current;
            if (!rdr || !v) return;
            const container = rdr.containerRef.current;
            if (!container) return;
            v.measure((_, __, w, h, pageX, pageY) => {
                if (w === 0 && h === 0) return;
                container.measure((___, ____, _cw, _ch, cPageX, cPageY) => {
                    const nx = pageX - cPageX;
                    const ny = pageY - cPageY;
                    setOrigin((prev) =>
                        prev && prev.x === nx && prev.y === ny
                            ? prev
                            : { x: nx, y: ny },
                    );
                });
            });
        }, []);

        // Drawn content origin = View top-left + glow pad. Memoised so PathLight's
        // effect doesn't re-fire (and re-register) on every render.
        const lightOrigin = useMemo(
            () => (origin ? { x: origin.x + PAD, y: origin.y + PAD } : null),
            [origin],
        );

        return (
            <Pressable
                ref={viewRef}
                onLayout={measure}
                onPress={
                    // locationX/Y are relative to this Pressable (includes the glow
                    // PAD). handleTap strips the pad, hit-tests against the tubes, and
                    // only ripples if the tap actually landed on one.
                    tapToReplay
                        ? (e) =>
                              handleTap(
                                  e.nativeEvent.locationX,
                                  e.nativeEvent.locationY,
                              )
                        : undefined
                }
                disabled={!tapToReplay}
                // When tappable, capture touches on the sign; otherwise let them
                // pass through (e.g. when used as a non-interactive overlay).
                pointerEvents={tapToReplay ? "auto" : "none"}
                style={[
                    {
                        width: signW + PAD * 2,
                        height: signH + PAD * 2,
                    },
                    style,
                ]}
            >
                {/* Unlit glass tubes — always visible (powered-off look) in one canvas. */}
                <ColdTubes
                    paths={scaled}
                    contentPad={PAD}
                    tubeWidth={tubeWidth}
                />

                {/* One small canvas per tube; brightness animates its Animated.View. */}
                {scaled.map((p, i) => (
                    <PathTube
                        key={`tube-${i}`}
                        skPath={p}
                        contentPad={PAD}
                        color={colors[i]}
                        warmColor={warmColors[i]}
                        tubeWidth={tubeWidth}
                        brightness={brightness[i]}
                    />
                ))}

                {/* Headless per-tube lights (normal React tree — effects run here). */}
                {scaled.map((p, i) => (
                    <PathLight
                        key={`light-${i}`}
                        skPath={p}
                        origin={lightOrigin}
                        color={colors[i]}
                        brightness={brightness[i]}
                        enabled
                    />
                ))}
            </Pressable>
        );
    },
);
