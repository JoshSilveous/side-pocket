import { useEffect, useState } from "react";
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

// ── Press visual — overdrive past 100% + burn-out flicker while held ──
const PRESS_OVERDRIVE = 2.7; // brightness multiplier peak while held

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
    const effectiveBrightness = useDerivedValue(
        () => brightness.value * pressBoost.value,
    );

    // Warm the haptic engine so the first press has no cold-start latency, and make
    // sure a held buzz is stopped if the button unmounts mid-press.
    useEffect(() => {
        if (!haptics) return;
        SidePocketHaptics.prepare().catch(() => {});
        return () => SidePocketHaptics.stopContinuous();
    }, [haptics]);

    const path =
        size.width > 0
            ? buildRoundedRectPath(size.width, size.height, BORDER_RADIUS)
            : "";

    return (
        <Pressable
            onPress={onPress}
            onPressIn={() => {
                // Visual: surge past full, then flicker like it's about to burn out.
                cancelAnimation(pressBoost);
                pressBoost.value = withRepeat(
                    withSequence(
                        withTiming(PRESS_OVERDRIVE, { duration: 55 }),
                        withTiming(1.25, { duration: 45 }),
                        withTiming(PRESS_OVERDRIVE - 0.1, { duration: 40 }),
                        withTiming(0.8, { duration: 35 }), // quick flicker blink
                        withTiming(1.5, { duration: 60 }),
                    ),
                    -1,
                    false,
                );
                if (!haptics) return;
                // Crisp tap down, then the low buzz that lasts while held.
                SidePocketHaptics.playTransient(
                    PRESS_INTENSITY,
                    PRESS_SHARPNESS,
                );
                SidePocketHaptics.startContinuous(
                    HOLD_INTENSITY,
                    HOLD_SHARPNESS,
                );
            }}
            onPressOut={() => {
                // Settle the glow back to its resting brightness.
                cancelAnimation(pressBoost);
                pressBoost.value = withTiming(1, { duration: 180 });
                if (!haptics) return;
                // Stop the hold buzz, then a dull thud on release.
                SidePocketHaptics.stopContinuous();
                SidePocketHaptics.playTransient(
                    RELEASE_INTENSITY,
                    RELEASE_SHARPNESS,
                );
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
                brightness={brightness}
            >
                {children}
            </NeonText>
        </Pressable>
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
