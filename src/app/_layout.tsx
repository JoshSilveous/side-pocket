import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { DevMenu } from "@/components/dev-menu";
import { NeonRenderer } from "@/components/neon-renderer";
import { NeonStack } from "@/components/neon-stack";
import { WALL_TEXTURES } from "@/constants/textures";

/**
 * The renderer lives here, above the navigator, so the wall + dust never remount
 * between routes. NeonStack slides each screen inside a LightFrame, so lights
 * travel with their tubes while the bricks stay put. Screens must be transparent.
 */
export default function RootLayout() {
    const colorScheme = useColorScheme();
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <ThemeProvider
                value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
            >
                <DevMenu>
                    <NeonRenderer tileCount={0.8} wallTextures={WALL_TEXTURES}>
                        <NeonStack />
                    </NeonRenderer>
                </DevMenu>
            </ThemeProvider>
        </GestureHandlerRootView>
    );
}
