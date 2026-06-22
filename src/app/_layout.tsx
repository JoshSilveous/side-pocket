import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useColorScheme } from "react-native";

import { DevMenu } from "@/components/dev-menu";

export default function RootLayout() {
    const colorScheme = useColorScheme();
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <ThemeProvider
                value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
            >
                {/*
                    No native tab/nav bar anymore — the whole app lives behind a
                    headerless Stack. `index` is the persistent game surface;
                    `ui-testing` / `splash-animation` still exist as routes but
                    are only reachable via the 3-finger DevMenu.
                    Black contentStyle prevents a white flash between routes.
                */}
                <DevMenu>
                    <Stack
                        screenOptions={{
                            headerShown: false,
                            contentStyle: { backgroundColor: "#000" },
                        }}
                    />
                </DevMenu>
            </ThemeProvider>
        </GestureHandlerRootView>
    );
}
