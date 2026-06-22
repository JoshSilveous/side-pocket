import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NeonRenderer } from "@/components/neon-renderer";

// Brick wall maps for the neon environment (same set the splash screen uses).
const WALL_TEXTURES = {
    albedo: require("@/assets/textures/brick_albedo.png"),
    normalMap: require("@/assets/textures/brick_normal.png"),
    roughnessMap: require("@/assets/textures/brick_roughness.png"),
};

/**
 * The single persistent surface for the whole game.
 *
 * NeonRenderer is mounted ONCE here and stays mounted for the app's lifetime —
 * that's deliberate. Route/screen changes would remount the Skia canvas and
 * restart the dust + light registration (visible flicker). So when you wire up
 * your Zustand phase store, switch the CONTENT inside this renderer
 * (home / selectMode / setup / playing) instead of navigating between routes.
 * Keep the phase switch BELOW the renderer, never around it.
 *
 * NOTE: children of NeonRenderer must have transparent backgrounds, or they'll
 * paint over the brick wall + glow.
 */
export default function Index() {
    return (
        <NeonRenderer tileCount={0.8} wallTextures={WALL_TEXTURES}>
            <SafeAreaView style={styles.root}>
                {/* TODO: replace with phase-driven content once the store exists */}
                <View style={styles.center}>
                    <Text style={styles.title}>SIDE POCKET</Text>
                    <Text style={styles.subtitle}>home phase goes here</Text>
                </View>
            </SafeAreaView>
        </NeonRenderer>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: "transparent" },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    title: {
        color: "#ffffff",
        fontSize: 34,
        fontWeight: "800",
        letterSpacing: 6,
    },
    subtitle: {
        color: "#8a8a8a",
        marginTop: 10,
        letterSpacing: 1,
    },
});
