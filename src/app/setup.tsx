import { useRouter } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import NeonButton from "@/components/neon-button";
import { NeonText } from "@/components/neon-text";
import { useGameStore } from "@/features/game/game-store";
import { recentNames, useHistoryStore } from "@/features/game/history-store";
import { randomizeTeams } from "@/features/game/turns";
import { TeamEditor } from "@/features/roster/TeamEditor";

export default function Setup() {
    const router = useRouter();
    const draft = useGameStore((s) => s.draft);
    const setDraft = useGameStore((s) => s.setDraft);
    const startGame = useGameStore((s) => s.startGame);
    const games = useHistoryStore((s) => s.games);
    const suggestions = useMemo(() => recentNames(games), [games]);

    const total = draft.teams[1].length + draft.teams[2].length;
    const canStart = draft.teams[1].length > 0 && draft.teams[2].length > 0;

    return (
        <SafeAreaView style={styles.root}>
            <View style={styles.header}>
                <NeonText fontSize={40} color="#ffd23f" warmColor="#ffe89c">
                    PICK TEAMS
                </NeonText>
            </View>

            <TeamEditor draft={draft} onChange={setDraft} suggestions={suggestions} />

            <View style={styles.footer}>
                <NeonButton
                    fontSize={22}
                    color="#b388ff"
                    warmColor="#ddc9ff"
                    disabled={total < 2}
                    onPress={() => setDraft({ ...draft, teams: randomizeTeams(draft.teams) })}
                >
                    Shuffle
                </NeonButton>
                <NeonButton
                    color="#39ff14"
                    warmColor="#a6ff8c"
                    disabled={!canStart}
                    onPress={() => {
                        startGame();
                        // Replace so backing out of the game lands on Home, not setup.
                        router.replace("/game");
                    }}
                >
                    Break!
                </NeonButton>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: "transparent" },
    header: { alignItems: "center", paddingTop: 12, paddingBottom: 20 },
    footer: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-evenly",
        paddingVertical: 26,
    },
});
