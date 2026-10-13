import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import NeonButton from "@/components/neon-button";
import { hueToRgb, hueToWarmRgb, rgbToHex } from "@/components/neon-renderer";
import { NeonText } from "@/components/neon-text";

const hex = ([r, g, b]: [number, number, number]) => rgbToHex(r, g, b);

/** Temporary stand-in for unbuilt screens so stack transitions can be tested. */
export function PlaceholderScreen({
    title,
    hue,
    actions,
}: {
    title: string;
    hue: number;
    actions: { label: string; hue: number; onPress: () => void }[];
}) {
    return (
        <SafeAreaView style={styles.root}>
            <View style={styles.center}>
                <NeonText
                    fontSize={44}
                    color={hex(hueToRgb(hue))}
                    warmColor={hex(hueToWarmRgb(hue))}
                >
                    {title}
                </NeonText>
                {actions.map((a) => (
                    <NeonButton
                        key={a.label}
                        onPress={a.onPress}
                        color={hex(hueToRgb(a.hue))}
                        warmColor={hex(hueToWarmRgb(a.hue))}
                    >
                        {a.label}
                    </NeonButton>
                ))}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: "transparent" },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 48 },
});
