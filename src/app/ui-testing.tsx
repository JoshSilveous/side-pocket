import { useState } from "react";
import { Platform, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSharedValue } from "react-native-reanimated";

import NeonButton from "@/components/neon-button";
import { NeonSlider } from "@/components/neon-slider";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";

// HSL → hex — used to convert the hue slider value into a color string.
// Saturation fixed at 100%, lightness at 50% gives the most vivid neon colors.
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

// Warm color is the same hue but lighter + less saturated —
// the "heating up to white" zone of the tube.
function warmColorFromHue(h: number): string {
    return hslToHex(h, 80, 75);
}

// Rainbow gradient stops for the hue track
const HUE_GRADIENT = [
    "#ff0000", "#ff8000", "#ffff00",
    "#00ff00", "#00ffff", "#0000ff",
    "#8000ff", "#ff0000",
];

// Brightness track: dark at left, full white at right
const BRIGHTNESS_GRADIENT = ["#111111", "#ffffff"];

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

    // brightness is a SharedValue — the slider drives it on the UI thread,
    // NeonButton reads it on the UI thread. No JS re-renders during drag.
    const brightness = useSharedValue(1);

    // hue drives a color string — needs JS state since color is a string prop.
    // runOnJS fires during drag so NeonButton re-renders with the new color.
    const hueShared = useSharedValue(0); // 0–360
    const [hue, setHue] = useState(0);

    const neonColor = hslToHex(hue, 100, 50);
    const warmColor = warmColorFromHue(hue);

    return (
        <ScrollView
            style={styles.scrollView}
            contentInset={insets}
            contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}
        >
            <ThemedView style={styles.container}>

                <ThemedText type="subtitle" style={styles.title}>
                    UI Testing
                </ThemedText>

                {/* Button preview */}
                <View style={styles.buttonArea}>
                    <NeonButton
                        onPress={() => {}}
                        color={neonColor}
                        warmColor={warmColor}
                        brightness={brightness}
                    >
                        Press Me
                    </NeonButton>
                </View>

                {/* Controls */}
                <View style={styles.controls}>
                    <NeonSlider
                        label="Brightness"
                        value={brightness}
                        min={0}
                        max={1}
                        trackColors={BRIGHTNESS_GRADIENT}
                    />
                    <NeonSlider
                        label="Hue"
                        value={hueShared}
                        min={0}
                        max={360}
                        trackColors={HUE_GRADIENT}
                        onJsChange={(v) => setHue(Math.round(v))}
                    />
                </View>

            </ThemedView>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scrollView: {
        flex: 1,
        backgroundColor: "black",
    },
    contentContainer: {
        flexDirection: "row",
        justifyContent: "center",
        backgroundColor: "black",
        minHeight: "100%",
    },
    container: {
        maxWidth: MaxContentWidth,
        flexGrow: 1,
        backgroundColor: "black",
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
        paddingVertical: Spacing.five,
    },
    controls: {
        gap: Spacing.five,
    },
});
