import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { useRouter, type Href } from "expo-router";

/**
 * Hidden developer menu.
 *
 * Press and hold with THREE fingers for ~600ms anywhere in the app to reveal a
 * small overlay that routes to the dev-only screens. There's no nav bar, so this
 * is the only way in — and a 3-finger hold won't ever trigger by accident during
 * normal one-finger play. Delete (or gate behind __DEV__) before shipping.
 *
 * How the gesture coexists with normal touches: react-native-gesture-handler
 * runs this LongPress alongside whatever the children do. A 3-pointer gesture
 * simply never recognizes on a 1-finger tap, and it does not swallow those
 * touches — so buttons underneath keep working.
 */

const DEV_ROUTES: { label: string; path: Href }[] = [
    { label: "UI Testing", path: "/ui-testing" },
    { label: "Splash Animation", path: "/splash-animation" },
];

export function DevMenu({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const router = useRouter();

    // numberOfPointers(3) = exactly three fingers; minDuration = press-and-hold.
    // .onStart fires on the UI thread, so hop back to JS with runOnJS to setState.
    const longPress = Gesture.LongPress()
        .numberOfPointers(3)
        .minDuration(600)
        .maxDistance(40)
        .onStart(() => runOnJS(setOpen)(true));

    const go = (path: Href) => {
        setOpen(false);
        router.push(path);
    };

    return (
        <GestureDetector gesture={longPress}>
            <View style={styles.fill}>
                {children}

                {open && (
                    <View style={styles.overlay}>
                        <Text style={styles.title}>DEV MENU</Text>

                        {DEV_ROUTES.map((r) => (
                            <Pressable
                                key={String(r.path)}
                                style={({ pressed }) => [
                                    styles.btn,
                                    pressed && styles.btnPressed,
                                ]}
                                onPress={() => go(r.path)}
                            >
                                <Text style={styles.btnText}>{r.label}</Text>
                            </Pressable>
                        ))}

                        <Pressable
                            style={({ pressed }) => [
                                styles.btn,
                                styles.close,
                                pressed && styles.btnPressed,
                            ]}
                            onPress={() => setOpen(false)}
                        >
                            <Text style={styles.btnText}>Close</Text>
                        </Pressable>
                    </View>
                )}
            </View>
        </GestureDetector>
    );
}

const NEON = "#39ff14";

const styles = StyleSheet.create({
    fill: { flex: 1 },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "#000000e6",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        zIndex: 1000,
    },
    title: {
        color: NEON,
        fontSize: 14,
        fontWeight: "800",
        letterSpacing: 4,
        marginBottom: 12,
    },
    btn: {
        minWidth: 220,
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: NEON,
        backgroundColor: "#00000088",
        alignItems: "center",
    },
    btnPressed: { backgroundColor: "#39ff1433" },
    close: { borderColor: "#666", marginTop: 20 },
    btnText: {
        color: "#ffffff",
        fontSize: 16,
        fontWeight: "700",
        letterSpacing: 1,
    },
});
