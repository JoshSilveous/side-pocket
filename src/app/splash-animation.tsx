import { useCallback, useEffect, useRef } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NeonRenderer } from "@/components/neon-renderer";
import {
    SidePocketNeon,
    type SidePocketNeonHandle,
} from "@/components/side-pocket";
import SidePocketHaptics from "../../modules/side-pocket-haptics";

// ── Power-on sizzle (haptic) — tune on a Metro reload, no native rebuild ──
const POWERON_HAPTIC_MS = 1900; // ~length of the staged power-on
const POWERON_SHARPNESS = 0.3; // soft, matches the ripple sizzle feel
const POWERON_PEAK = 0.55; // intensity ceiling
const POWERON_CONTINUOUS_DELAY_MS = 100; // hold the continuous buzz until tubes mass
const POWERON_SWELL_LEVEL = 0.3; // continuous flood-on swell strength (lower = subtler)
const POWERON_SHIMMER_LEVEL = 0.06; // continuous baseline buzz (lower = subtler)

/**
 * Haptic envelope shaped to the start animation: discrete stutters lined up with
 * the false-starts (these fire on the first tube flicks), then a continuous buzz
 * (gentle shimmer + flood-on swell) that's held back by POWERON_CONTINUOUS_DELAY_MS
 * so it lands once the tubes start coming together rather than before. Timings are
 * fractions of POWERON_HAPTIC_MS — approximate, since the power-on uses random
 * per-tube delays.
 */
function powerOnSizzleEnvelope(steps = 48): number[] {
    const bump = (t: number, c: number, w: number) =>
        Math.exp(-((t - c) ** 2) / (2 * w * w));
    const dT = POWERON_CONTINUOUS_DELAY_MS / POWERON_HAPTIC_MS;
    const out: number[] = [];
    for (let k = 0; k < steps; k++) {
        const t = steps === 1 ? 0 : k / (steps - 1);
        // Discrete surges — left at their original times.
        const stutters =
            0.3 * bump(t, 0.03, 0.03) + // first surge
            0.38 * bump(t, 0.2, 0.03) + // false-start 1
            0.45 * bump(t, 0.36, 0.04); // false-start 2
        // Continuous buzz, shifted later by dT.
        const tc = t - dT;
        const gate = Math.max(0, Math.min(1, tc / 0.05)); // brief fade-in
        const shimmer =
            gate *
            (POWERON_SHIMMER_LEVEL + 0.03 * Math.sin(tc * Math.PI * 12));
        const flush = POWERON_SWELL_LEVEL * bump(tc, 0.66, 0.16); // flood-on swell
        out.push(
            Math.min(POWERON_PEAK, Math.max(0, stutters + shimmer + flush)),
        );
    }
    return out;
}

export default function SplashAnimation() {
    const { width: screenWidth } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const signWidth = Math.min(screenWidth * 0.85, 420);

    const signRef = useRef<SidePocketNeonHandle>(null);

    // The haptic sizzle that rides along with the power-on flush.
    const playSizzle = useCallback(() => {
        SidePocketHaptics.playCurve(
            POWERON_HAPTIC_MS,
            powerOnSizzleEnvelope(),
            POWERON_SHARPNESS,
        );
    }, []);

    // Play button: replay the start animation + its sizzle.
    const play = useCallback(() => {
        signRef.current?.powerOn();
        playSizzle();
    }, [playSizzle]);

    // Warm the engine and sizzle alongside the sign's auto power-on on mount.
    useEffect(() => {
        SidePocketHaptics.prepare().catch(() => {});
        playSizzle();
    }, [playSizzle]);

    return (
        <NeonRenderer
            tileCount={0.8}
            wallTextures={{
                albedo: require("@/assets/textures/brick_albedo.png"),
                normalMap: require("@/assets/textures/brick_normal.png"),
                roughnessMap: require("@/assets/textures/brick_roughness.png"),
            }}
        >
            <View
                style={{
                    flex: 1,
                    backgroundColor: "transparent",
                    justifyContent: "center",
                    alignItems: "center",
                }}
            >
                {/* Tap the sign to replay the ripple; Play replays the start anim. */}
                <SidePocketNeon ref={signRef} width={signWidth} />
            </View>

            <Pressable
                onPress={play}
                style={({ pressed }) => ({
                    position: "absolute",
                    bottom: insets.bottom + 40,
                    alignSelf: "center",
                    paddingHorizontal: 32,
                    paddingVertical: 14,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: "#39ff14",
                    backgroundColor: pressed ? "#39ff1433" : "#00000088",
                })}
            >
                <Text
                    style={{
                        color: "#ffffff",
                        fontSize: 16,
                        fontWeight: "700",
                        letterSpacing: 2,
                    }}
                >
                    ▶ PLAY
                </Text>
            </Pressable>
        </NeonRenderer>
    );
}
