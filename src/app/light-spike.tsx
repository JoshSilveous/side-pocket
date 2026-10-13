import { useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import {
    cancelAnimation,
    Easing,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
    type SharedValue,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import NeonButton from "@/components/neon-button";
import { LightFrame } from "@/components/neon-renderer";
import { NeonText } from "@/components/neon-text";

/** Dev bench for LightFrame: wall glow + dust must stay locked to the tubes. */

const EASE = Easing.inOut(Easing.quad);

export default function LightSpike() {
    const { width } = useWindowDimensions();
    const tx = useSharedValue(0);
    const ty = useSharedValue(0);
    const s = useSharedValue(1);
    const innerS = useSharedValue(1);
    const innerA = useSharedValue(1);
    const innerPower = useSharedValue(1);
    const [mountKey, setMountKey] = useState(0);

    const all = [tx, ty, s, innerS, innerA, innerPower];
    const stop = () => all.forEach((v) => cancelAnimation(v));
    const to = (v: SharedValue<number>, target: number, ms = 450) => {
        v.value = withTiming(target, { duration: ms, easing: EASE });
    };

    const actions: { label: string; run: () => void }[] = [
        {
            label: "Rest",
            run: () => {
                stop();
                to(tx, 0);
                to(ty, 0);
                to(s, 1);
                to(innerS, 1);
                to(innerA, 1);
                to(innerPower, 1);
            },
        },
        { label: "Slide →", run: () => (stop(), to(tx, 120)) },
        { label: "Slide ↙", run: () => (stop(), to(tx, -120), to(ty, 60)) },
        { label: "Scale .5", run: () => (stop(), to(s, 0.5)) },
        {
            label: "Page out/in",
            run: () => {
                stop();
                tx.value = withSequence(
                    withTiming(-width, { duration: 380, easing: EASE }),
                    withTiming(width, { duration: 0 }),
                    withTiming(0, { duration: 380, easing: EASE }),
                );
            },
        },
        {
            label: "Loop slide",
            run: () => {
                stop();
                tx.value = withRepeat(
                    withSequence(
                        withTiming(-130, { duration: 900, easing: EASE }),
                        withTiming(130, { duration: 900, easing: EASE }),
                    ),
                    -1,
                    true,
                );
            },
        },
        {
            label: "Loop scale",
            run: () => {
                stop();
                s.value = withRepeat(
                    withSequence(
                        withTiming(0.45, { duration: 800, easing: EASE }),
                        withTiming(1.15, { duration: 800, easing: EASE }),
                    ),
                    -1,
                    true,
                );
            },
        },
        {
            label: "Power nested",
            run: () => {
                cancelAnimation(innerS);
                cancelAnimation(innerPower);
                innerS.value = withRepeat(
                    withTiming(0.55, { duration: 700, easing: EASE }),
                    -1,
                    true,
                );
                innerPower.value = withRepeat(
                    withTiming(0, { duration: 700, easing: EASE }),
                    -1,
                    true,
                );
            },
        },
        {
            label: "Fade nested",
            run: () => {
                cancelAnimation(innerA);
                innerA.value = withRepeat(
                    withTiming(0.15, { duration: 700, easing: EASE }),
                    -1,
                    true,
                );
            },
        },
        { label: "Remount", run: () => setMountKey((k) => k + 1) },
        { label: "Stop", run: stop },
    ];

    return (
        <SafeAreaView style={styles.root}>
                <Text style={styles.title}>LIGHT FRAME BENCH</Text>

                <View style={styles.stage}>
                    <LightFrame
                        translateX={tx}
                        translateY={ty}
                        scale={s}
                        style={styles.frame}
                    >
                        <View key={mountKey} style={styles.frameInner}>
                            <NeonButton onPress={() => {}} haptics={false}>
                                    Follow Me
                                </NeonButton>
                            <LightFrame scale={innerS} opacity={innerA}>
                                <NeonText
                                    fontSize={30}
                                    color="#00e5ff"
                                    warmColor="#9ff6ff"
                                    brightness={innerPower}
                                >
                                    nested
                                </NeonText>
                            </LightFrame>
                        </View>
                    </LightFrame>
                </View>

                <View style={styles.controls}>
                    {actions.map((a) => (
                        <Pressable
                            key={a.label}
                            onPress={a.run}
                            style={({ pressed }) => [
                                styles.btn,
                                pressed && styles.btnPressed,
                            ]}
                        >
                            <Text style={styles.btnText}>{a.label}</Text>
                        </Pressable>
                    ))}
                </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: "transparent" },
    title: {
        color: "#39ff14",
        textAlign: "center",
        fontWeight: "800",
        letterSpacing: 4,
        marginTop: 8,
    },
    stage: { flex: 1, alignItems: "center", justifyContent: "center" },
    frame: { width: 260, height: 220 },
    frameInner: {
        flex: 1,
        alignItems: "center",
        justifyContent: "space-evenly",
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: "#ffffff33",
    },
    controls: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: 8,
        paddingHorizontal: 16,
        paddingBottom: 24,
    },
    btn: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#39ff14",
        backgroundColor: "#00000099",
    },
    btnPressed: { backgroundColor: "#39ff1433" },
    btnText: { color: "#fff", fontWeight: "700" },
});
