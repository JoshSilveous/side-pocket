import { Platform, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import NeonButton from "@/components/neon-button";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export default function TabTwoScreen() {
    const safeAreaInsets = useSafeAreaInsets();
    const insets = {
        ...safeAreaInsets,
        bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
    };
    const theme = useTheme();

    const contentPlatformStyle = Platform.select({
        android: {
            paddingTop: insets.top,
            paddingLeft: insets.left,
            paddingRight: insets.right,
            paddingBottom: insets.bottom,
        },
        web: {
            paddingTop: Spacing.six,
            paddingBottom: Spacing.four,
        },
    });

    return (
        <ScrollView
            style={[styles.scrollView, { backgroundColor: theme.background }]}
            contentInset={insets}
            contentContainerStyle={[
                styles.contentContainer,
                contentPlatformStyle,
            ]}
        >
            <ThemedView style={styles.container}>
                <ThemedView style={styles.titleContainer}>
                    <ThemedText style={styles.title} type="subtitle">
                        UI Testing
                    </ThemedText>
                    <NeonButton onPress={() => alert("Button Pressed!")}>
                        Press Me
                    </NeonButton>
                </ThemedView>
            </ThemedView>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scrollView: {
        flex: 1,
    },
    contentContainer: {
        flexDirection: "row",
        justifyContent: "center",
        backgroundColor: "black",
        height: "100%",
    },
    container: {
        maxWidth: MaxContentWidth,
        flexGrow: 1,
        backgroundColor: "black",
    },
    titleContainer: {
        gap: Spacing.three,
        alignItems: "center",
        paddingHorizontal: Spacing.four,
        paddingVertical: Spacing.six,
        backgroundColor: "black",
    },
    title: {
        color: "white",
    },
    pressed: {
        opacity: 0.7,
    },
});
