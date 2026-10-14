import { useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppReady } from "@/components/app-ready";
import NeonButton from "@/components/neon-button";
import {
    afterSignPowerOn,
    playPowerOnSizzle,
    SidePocketNeon,
} from "@/components/side-pocket";
import { splashArt } from "@/generated/splash-paths";
import SidePocketHaptics from "../../modules/side-pocket-haptics";

/** Glow padding SidePocketNeon adds around the art on each side. */
const SIGN_PAD = 32;

export default function Home() {
    const router = useRouter();
    const ready = useAppReady();
    const { width: screenWidth } = useWindowDimensions();

    const signWidth = Math.min(screenWidth * 0.85, 420);
    const signHeight =
        (signWidth * splashArt.viewBox.height) / splashArt.viewBox.width +
        SIGN_PAD * 2;

    const buttonPower = useSharedValue(0);

    // The sign mounts (and auto-plays its power-on) only once the splash is gone,
    // so the intro is never spent behind it.
    useEffect(() => {
        if (!ready) return;
        SidePocketHaptics.prepare().catch(() => {});
        playPowerOnSizzle();
        buttonPower.value = afterSignPowerOn();
    }, [ready, buttonPower]);

    return (
        <SafeAreaView style={styles.root}>
            <View style={styles.center}>
                <View style={{ width: signWidth + SIGN_PAD * 2, height: signHeight }}>
                    {ready && <SidePocketNeon width={signWidth} />}
                </View>
                <NeonButton
                    color="#00ffa3"
                    warmColor="#a3ffd9"
                    brightness={buttonPower}
                    onPress={() => router.push("/setup")}
                >
                    Start Game
                </NeonButton>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: "transparent" },
    center: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 40,
    },
});
