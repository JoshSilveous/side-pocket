import { useEffect, useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, Switch, View } from "react-native";
import {
    useAnimatedRef,
    useDerivedValue,
    useScrollOffset,
    useSharedValue,
    withSequence,
    withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import NeonButton from "@/components/neon-button";
import { NeonLightSource, NeonRenderer } from "@/components/neon-renderer";
import { NeonSlider } from "@/components/neon-slider";
import { ThemedText } from "@/components/themed-text";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";

// ── Colour helpers ──────────────────────────────────────────────────────────

function hslToHex(h: number, s: number, l: number): string {
    s /= 100;
    l /= 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) =>
        l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const r = Math.round(255 * f(0));
    const g = Math.round(255 * f(8));
    const b = Math.round(255 * f(4));
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function warmColorFromHue(h: number): string {
    return hslToHex(h, 80, 75);
}

const HUE_GRADIENT = [
    "#ff0000",
    "#ff8000",
    "#ffff00",
    "#00ff00",
    "#00ffff",
    "#0000ff",
    "#8000ff",
    "#ff0000",
];
const BRIGHTNESS_GRADIENT = ["#111111", "#ffffff"];

// ── Screen ──────────────────────────────────────────────────────────────────

export default function UITestingScreen() {
    const safeAreaInsets = useSafeAreaInsets();
    const insets = {
        ...safeAreaInsets,
        bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
    };
    const contentPlatformStyle = Platform.select({
        android: {
            paddingTop: insets.top,
            paddingLeft: insets.left,
            paddingRight: insets.right,
            paddingBottom: insets.bottom,
        },
    });

    // ── Button 1 ────────────────────────────────────────────────────────────
    const brightness1 = useSharedValue(1);
    const hueShared1 = useSharedValue(0);
    const [hue1, setHue1] = useState(0);
    const flickerMult1 = useSharedValue(1);
    // Drives both the tube glow and the NeonLightSource (wall + dust lighting),
    // entirely on the UI thread — slider drags and flicker never re-render JS.
    const effectiveBrightness1 = useDerivedValue(
        () => brightness1.value * flickerMult1.value,
    );

    // ── Button 2 ────────────────────────────────────────────────────────────
    const brightness2 = useSharedValue(1);
    const hueShared2 = useSharedValue(200);
    const [hue2, setHue2] = useState(200);
    const flickerMult2 = useSharedValue(1);
    const effectiveBrightness2 = useDerivedValue(
        () => brightness2.value * flickerMult2.value,
    );

    // ── Flicker ─────────────────────────────────────────────────────────────
    // Each button has its own independent timeout chain so they flicker at
    // different random intervals and never feel synchronised.
    const [flickerOn, setFlickerOn] = useState(false);
    const timeout1 = useRef<ReturnType<typeof setTimeout> | null>(null);
    const timeout2 = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!flickerOn) return;

        // One flicker event: two quick dips with randomised depth.
        // Dip durations are ~2× longer than before so the "off" state reads clearly.
        const triggerFlicker = (mult: { value: number }) => {
            const dip1 = 0.04 + Math.random() * 0.08;
            const dip2 = 0.06 + Math.random() * 0.08;
            mult.value = withSequence(
                withTiming(dip1, { duration: 80 }), // first dip
                withTiming(1, { duration: 70 }), // brief recovery
                withTiming(dip2, { duration: 60 }), // second dip
                withTiming(1, { duration: 120 }), // restore
            );
        };

        // Independent random schedules — button 1 fires every 0.8–4 s,
        // button 2 every 1.2–5 s, so they're rarely in sync.
        const schedule1 = () => {
            timeout1.current = setTimeout(
                () => {
                    triggerFlicker(flickerMult1);
                    schedule1();
                },
                800 + Math.random() * 3200,
            );
        };

        const schedule2 = () => {
            timeout2.current = setTimeout(
                () => {
                    triggerFlicker(flickerMult2);
                    schedule2();
                },
                1200 + Math.random() * 3800,
            );
        };

        schedule1();
        schedule2();

        return () => {
            if (timeout1.current) clearTimeout(timeout1.current);
            if (timeout2.current) clearTimeout(timeout2.current);
            flickerMult1.value = 1;
            flickerMult2.value = 1;
        };
    }, [flickerOn]);

    // ── Derived colours ─────────────────────────────────────────────────────
    const neonColor1 = hslToHex(hue1, 100, 50);
    const warmColor1 = warmColorFromHue(hue1);
    const neonColor2 = hslToHex(hue2, 100, 50);
    const warmColor2 = warmColorFromHue(hue2);

    // ── Scroll offset → NeonRenderer so the neon lighting tracks the buttons as
    // they scroll (the brick + dust textures themselves stay fixed). UI thread.
    const scrollRef = useAnimatedRef<ScrollView>();
    const scrollY = useScrollOffset(scrollRef);

    return (
        <NeonRenderer
            tileCount={0.8}
            scrollOffset={scrollY}
            wallTextures={{
                albedo: require("@/assets/textures/brick_albedo.png"),
                normalMap: require("@/assets/textures/brick_normal.png"),
                roughnessMap: require("@/assets/textures/brick_roughness.png"),
            }}
        >
            <ScrollView
                ref={scrollRef}
                style={styles.scrollView}
                contentInset={insets}
                contentContainerStyle={[
                    styles.contentContainer,
                    contentPlatformStyle,
                ]}
            >
                <View style={styles.container}>
                    <ThemedText type="subtitle" style={styles.title}>
                        UI Testing
                    </ThemedText>

                    {/* ── Buttons ── */}
                    <View style={styles.buttonArea}>
                        <NeonLightSource
                            hue={hue1}
                            brightness={effectiveBrightness1}
                        >
                            <NeonButton
                                onPress={() => {}}
                                color={neonColor1}
                                warmColor={warmColor1}
                                brightness={effectiveBrightness1}
                            >
                                Button One
                            </NeonButton>
                        </NeonLightSource>

                        <NeonLightSource
                            hue={hue2}
                            brightness={effectiveBrightness2}
                        >
                            <NeonButton
                                onPress={() => {}}
                                color={neonColor2}
                                warmColor={warmColor2}
                                brightness={effectiveBrightness2}
                            >
                                Button Two
                            </NeonButton>
                        </NeonLightSource>
                    </View>

                    {/* ── Controls ── */}
                    <View style={styles.controls}>
                        <ThemedText style={styles.sectionLabel}>
                            Button One
                        </ThemedText>
                        <NeonSlider
                            label="Brightness"
                            value={brightness1}
                            min={0}
                            max={1}
                            trackColors={BRIGHTNESS_GRADIENT}
                        />
                        <NeonSlider
                            label="Hue"
                            value={hueShared1}
                            min={0}
                            max={360}
                            trackColors={HUE_GRADIENT}
                            onJsChange={(v) => setHue1(Math.round(v))}
                        />

                        <ThemedText style={styles.sectionLabel}>
                            Button Two
                        </ThemedText>
                        <NeonSlider
                            label="Brightness"
                            value={brightness2}
                            min={0}
                            max={1}
                            trackColors={BRIGHTNESS_GRADIENT}
                        />
                        <NeonSlider
                            label="Hue"
                            value={hueShared2}
                            min={0}
                            max={360}
                            trackColors={HUE_GRADIENT}
                            onJsChange={(v) => setHue2(Math.round(v))}
                        />

                        <View style={styles.flickerRow}>
                            <ThemedText style={styles.sectionLabel}>
                                Flicker
                            </ThemedText>
                            <Switch
                                value={flickerOn}
                                onValueChange={setFlickerOn}
                                trackColor={{ false: "#333", true: "#aaa" }}
                                thumbColor={flickerOn ? "#fff" : "#888"}
                            />
                        </View>
                    </View>
                </View>
            </ScrollView>
        </NeonRenderer>
    );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    scrollView: {
        flex: 1,
        backgroundColor: "transparent",
    },
    contentContainer: {
        flexDirection: "row",
        justifyContent: "center",
        backgroundColor: "transparent",
        minHeight: "100%",
    },
    container: {
        maxWidth: MaxContentWidth,
        flexGrow: 1,
        backgroundColor: "transparent",
        paddingHorizontal: Spacing.four,
        paddingVertical: Spacing.six,
        gap: Spacing.six,
    },
    title: {
        color: "white",
        textAlign: "center",
    },
    buttonArea: {
        alignItems: "center",
        justifyContent: "center",
        gap: Spacing.five,
        paddingVertical: Spacing.five,
    },
    controls: {
        gap: Spacing.five,
    },
    sectionLabel: {
        color: "#aaaaaa",
        fontSize: 13,
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: 1,
    },
    flickerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: Spacing.two,
    },
});
