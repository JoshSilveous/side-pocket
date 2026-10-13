import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import {
    cancelAnimation,
    SharedValue,
    useDerivedValue,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from "react-native-reanimated";

import SidePocketHaptics from "../../modules/side-pocket-haptics";
import { LightFrame, NeonLightSource } from "./neon-renderer";
import { NeonText } from "./neon-text";
import { NeonTube } from "./neon-tube";

// ════════════════════════════════════════════════════════════════════════════
//  TUBE LOOK — tweak the button's neon here.
//  Uses the exact same multi-pass recipe as the splash sign (<PathTube>), so
//  these knobs behave the same way they do on the logo.
// ════════════════════════════════════════════════════════════════════════════

/** Tube thickness in screen px. Everything (glow radii, hot core) scales off this.
 *  The splash sign uses 4; buttons read well a touch chunkier. */
const TUBE_WIDTH = 10;

/** Glow spread. 1 = stock splash look, >1 = wider/softer bloom, <1 = tighter. */
const GLOW = 1;

/** Resting brightness (0..1) of a powered-on button. Drop it for a dimmer idle
 *  glow; a flicker/press animation can still drive the SharedValue past this. */
const BASE_BRIGHTNESS = 1;

/** Inner padding (px) between the label and the tube. Tweak to taste. */
const PADDING_H = 22;
const PADDING_V = 12;

const FONT_SIZE = 32;
const BORDER_RADIUS = 12;
const GLOW_PADDING = 40;

// ── Press haptics — crisp tap down, low buzz while held, dull thud on release ──
const PRESS_INTENSITY = 1;
const PRESS_SHARPNESS = 1; // hard + crisp
const HOLD_INTENSITY = 0.3;
const HOLD_SHARPNESS = 0.3; // low buzz while held
const RELEASE_INTENSITY = 1;
const RELEASE_SHARPNESS = 0.15; // hard + dull

// ── Press visual — shrink on press, burn-out flicker while held ──
const PRESS_SCALE = 0.94;
const PRESS_IN_MS = 90;
const PRESS_OUT_MS = 160;
const HOLD_OVERDRIVE = 1.2; // hold-flicker peak
const HOLD_THRESHOLD_MS = 180; // held longer than this = "hold"; shorter = a tap

function buildRoundedRectPath(w: number, h: number, r: number): string {
    return (
        `M ${r} 0 H ${w - r} ` +
        `Q ${w} 0 ${w} ${r} ` +
        `V ${h - r} ` +
        `Q ${w} ${h} ${w - r} ${h} ` +
        `H ${r} ` +
        `Q 0 ${h} 0 ${h - r} ` +
        `V ${r} ` +
        `Q 0 0 ${r} 0 Z`
    );
}

export default function NeonButton(props: {
    children: string;
    onPress: () => void;
    color?: string;
    warmColor?: string;
    brightness?: SharedValue<number>;
    /** Press/hold/release haptics. Default: true. */
    haptics?: boolean;
}) {
    const {
        children,
        onPress,
        color = "#ff2020",
        warmColor = "#ff9999",
        haptics = true,
    } = props;

    const [size, setSize] = useState({ width: 0, height: 0 });

    const internalBrightness = useSharedValue(BASE_BRIGHTNESS);
    const brightness = props.brightness ?? internalBrightness;

    // Press boost multiplies whatever brightness we're given (so it composes with an
    // externally-driven brightness), letting the press surge it past 100%.
    const pressBoost = useSharedValue(1);
    const pressScale = useSharedValue(1);
    const effectiveBrightness = useDerivedValue(
        () => brightness.value * pressBoost.value,
    );

    // Distinguish a quick tap from a hold: a timer started on press-down escalates to
    // the hold behavior only if still held past HOLD_THRESHOLD_MS.
    const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isHolding = useRef(false);

    // Warm the haptic engine; on unmount clear any pending timer + stop a held buzz.
    useEffect(() => {
        if (haptics) SidePocketHaptics.prepare().catch(() => {});
        return () => {
            if (holdTimer.current) clearTimeout(holdTimer.current);
            SidePocketHaptics.stopContinuous();
        };
    }, [haptics]);

    const path =
        size.width > 0
            ? buildRoundedRectPath(size.width, size.height, BORDER_RADIUS)
            : "";

    // The button owns its light, inside a LightFrame, so the wall glow shrinks
    // with the press and flickers with the hold.
    return (
        <LightFrame scale={pressScale}>
            <NeonLightSource
                color={color}
                brightness={effectiveBrightness}
                cornerRadius={BORDER_RADIUS}
            >
                <Pressable
                    onPress={onPress}
                    onPressIn={() => {
                        // Tap-down: shrink + one crisp tick. If still held past the
                        // threshold we escalate to the hold flicker below.
                        cancelAnimation(pressScale);
                        pressScale.value = withTiming(PRESS_SCALE, {
                            duration: PRESS_IN_MS,
                        });
                        if (haptics) {
                            SidePocketHaptics.playTransient(
                                PRESS_INTENSITY,
                                PRESS_SHARPNESS,
                            );
                        }

                        isHolding.current = false;
                        holdTimer.current = setTimeout(() => {
                            // Held: low buzz + burn-out flicker.
                            isHolding.current = true;
                            if (haptics) {
                                SidePocketHaptics.startContinuous(
                                    HOLD_INTENSITY,
                                    HOLD_SHARPNESS,
                                );
                            }
                            pressBoost.value = withRepeat(
                                withSequence(
                                    withTiming(HOLD_OVERDRIVE, { duration: 55 }),
                                    withTiming(1.15, { duration: 45 }),
                                    withTiming(HOLD_OVERDRIVE - 0.1, { duration: 40 }),
                                    withTiming(0.85, { duration: 35 }), // flicker blink
                                    withTiming(1.3, { duration: 60 }),
                                ),
                                -1,
                                false,
                            );
                        }, HOLD_THRESHOLD_MS);
                    }}
                    onPressOut={() => {
                        if (holdTimer.current) {
                            clearTimeout(holdTimer.current);
                            holdTimer.current = null;
                        }
                        // Spring back to size and end any hold flicker.
                        cancelAnimation(pressScale);
                        pressScale.value = withTiming(1, { duration: PRESS_OUT_MS });
                        cancelAnimation(pressBoost);
                        pressBoost.value = withTiming(1, { duration: 180 });
                        // Only a sustained hold gets the stop-buzz + dull release; a quick tap
                        // already fired its single tick on press-down.
                        if (isHolding.current) {
                            isHolding.current = false;
                            if (haptics) {
                                SidePocketHaptics.stopContinuous();
                                SidePocketHaptics.playTransient(
                                    RELEASE_INTENSITY,
                                    RELEASE_SHARPNESS,
                                );
                            }
                        }
                    }}
                    onLayout={(e) => {
                        const { width, height } = e.nativeEvent.layout;
                        setSize({ width, height });
                    }}
                    style={styles.button}
                >
                    {size.width > 0 && (
                        <NeonTube
                            path={path}
                            width={size.width}
                            height={size.height}
                            color={color}
                            warmColor={warmColor}
                            tubeWidth={TUBE_WIDTH}
                            glow={GLOW}
                            brightness={effectiveBrightness}
                            innerGlow={false}
                            glowPadding={GLOW_PADDING}
                        />
                    )}
                    {/* Label shares the button's brightness so it powers on / flickers
                        with the tube, and glows in the same colour. */}
                    <NeonText
                        fontSize={FONT_SIZE}
                        color={color}
                        warmColor={warmColor}
                        glow={GLOW}
                        brightness={effectiveBrightness}
                    >
                        {children}
                    </NeonText>
                </Pressable>
            </NeonLightSource>
        </LightFrame>
    );
}

const styles = StyleSheet.create({
    button: {
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: PADDING_H,
        paddingVertical: PADDING_V,
    },
});
