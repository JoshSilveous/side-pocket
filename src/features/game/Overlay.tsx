import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PowerOnGroup } from "@/components/power-on";

/** Full-screen in-screen overlay; its neon staggers on when it opens. */
export function Overlay({ children }: { children: ReactNode }) {
    return (
        <View style={styles.scrim}>
            <SafeAreaView style={styles.safe}>
                <PowerOnGroup>{children}</PowerOnGroup>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    scrim: { ...StyleSheet.absoluteFill, backgroundColor: "#000000d9" },
    safe: { flex: 1, backgroundColor: "transparent" },
});
