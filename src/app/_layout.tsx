import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { TiltNeon_400Regular, useFonts } from "@expo-google-fonts/tilt-neon";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef, useState } from "react";
import { useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AppReadyContext } from "@/components/app-ready";
import { DevMenu } from "@/components/dev-menu";
import { NeonRenderer } from "@/components/neon-renderer";
import { NeonStack } from "@/components/neon-stack";
import { WALL_TEXTURES } from "@/constants/textures";
import { useGameStore } from "@/features/game/game-store";
import { useHistoryStore } from "@/features/game/history-store";

// The native splash IS the loader: hold it until the wall has drawn.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: 350 });

/** Never strand the user on the splash if a texture fails to load. */
const READY_TIMEOUT_MS = 5000;

/** True once both persisted stores have loaded from disk. */
function useStoresHydrated() {
    const [done, setDone] = useState(
        () => useGameStore.persist.hasHydrated() && useHistoryStore.persist.hasHydrated(),
    );
    useEffect(() => {
        const check = () =>
            setDone(useGameStore.persist.hasHydrated() && useHistoryStore.persist.hasHydrated());
        const a = useGameStore.persist.onFinishHydration(check);
        const b = useHistoryStore.persist.onFinishHydration(check);
        check();
        return () => {
            a();
            b();
        };
    }, []);
    return done;
}

/**
 * The renderer lives here, above the navigator, so the wall + dust never remount
 * between routes. NeonStack slides each screen inside a LightFrame, so lights
 * travel with their tubes while the bricks stay put. Screens must be transparent.
 */
export default function RootLayout() {
    const colorScheme = useColorScheme();
    const [ready, setReady] = useState(false);
    const [wallReady, setWallReady] = useState(false);
    const [fontsLoaded, fontError] = useFonts({ TiltNeon_400Regular });
    const hydrated = useStoresHydrated();
    const hidden = useRef(false);

    const markReady = useCallback(() => {
        if (hidden.current) return;
        hidden.current = true;
        SplashScreen.hideAsync().catch(() => {});
        setReady(true);
    }, []);

    const onWallReady = useCallback(() => setWallReady(true), []);

    useEffect(() => {
        if (wallReady && hydrated && (fontsLoaded || fontError)) markReady();
    }, [wallReady, hydrated, fontsLoaded, fontError, markReady]);

    useEffect(() => {
        const t = setTimeout(markReady, READY_TIMEOUT_MS);
        return () => clearTimeout(t);
    }, [markReady]);

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <ThemeProvider
                value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
            >
                <AppReadyContext.Provider value={ready}>
                    <DevMenu>
                        <NeonRenderer
                            tileCount={0.8}
                            wallTextures={WALL_TEXTURES}
                            onReady={onWallReady}
                        >
                            <NeonStack />
                        </NeonRenderer>
                    </DevMenu>
                </AppReadyContext.Provider>
            </ThemeProvider>
        </GestureHandlerRootView>
    );
}
