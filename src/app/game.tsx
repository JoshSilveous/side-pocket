import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import NeonButton from "@/components/neon-button";
import { NeonText } from "@/components/neon-text";
import { GameTeamCard } from "@/features/game/GameTeamCard";
import { useGameStore } from "@/features/game/game-store";
import { LineupEditor } from "@/features/game/LineupEditor";
import { Overlay } from "@/features/game/Overlay";
import { NEON_FONT } from "@/features/game/team-style";
import { TurnWheel } from "@/features/game/TurnWheel";
import { describeLineupChange, lineupAt } from "@/features/game/turns";
import type { LiveGame } from "@/features/game/types";
import { WinnerPrompt } from "@/features/game/WinnerPrompt";

type Panel = "none" | "winner" | "lineup" | { info: number };

export default function Game() {
    const router = useRouter();
    const live = useGameStore((s) => s.game);
    const { next, undo, cycleSide, editLineup, endGame, abandonGame } = useGameStore.getState();
    const [panel, setPanel] = useState<Panel>("none");

    // Ending clears the store while this screen is still sliding away — keep
    // rendering the last game so it doesn't blank mid-transition.
    const last = useRef<LiveGame | null>(live);
    if (live) last.current = live;
    const game = last.current;
    if (!game) return <SafeAreaView style={styles.root} />;

    const leave = () => router.dismissTo("/");

    const infoLines =
        typeof panel === "object"
            ? describeLineupChange(
                  lineupAt(game, panel.info - 1),
                  lineupAt(game, panel.info),
                  game.players,
              )
            : [];

    return (
        <SafeAreaView style={styles.root}>
            <TurnWheel game={game} onInfo={(turn) => setPanel({ info: turn })} />

            <View style={styles.teams}>
                <GameTeamCard game={game} team={1} onCycleSide={() => cycleSide(1)} />
                <NeonText fontSize={22} color="#ffd23f" warmColor="#ffe89c">
                    vs
                </NeonText>
                <GameTeamCard game={game} team={2} onCycleSide={() => cycleSide(2)} />
            </View>

            <View style={styles.controls}>
                <NeonButton fontSize={40} color="#39ff14" warmColor="#a6ff8c" onPress={next}>
                    Next
                </NeonButton>
                <View style={styles.secondary}>
                    <Pressable onPress={undo} disabled={game.turn === 0} hitSlop={10}>
                        <Text style={[styles.link, game.turn === 0 && styles.dim]}>↶ Undo</Text>
                    </Pressable>
                    <Pressable onPress={() => setPanel("lineup")} hitSlop={10}>
                        <Text style={styles.link}>Edit lineup</Text>
                    </Pressable>
                    <Pressable onPress={() => setPanel("winner")} hitSlop={10}>
                        <Text style={styles.link}>End game</Text>
                    </Pressable>
                </View>
            </View>

            {panel === "lineup" && (
                <LineupEditor
                    game={game}
                    onCancel={() => setPanel("none")}
                    onSave={(draft) => {
                        editLineup(draft);
                        setPanel("none");
                    }}
                />
            )}

            {panel === "winner" && (
                <WinnerPrompt
                    onCancel={() => setPanel("none")}
                    onPick={(team) => {
                        endGame(team);
                        leave();
                    }}
                    onDiscard={() => {
                        abandonGame();
                        leave();
                    }}
                />
            )}

            {typeof panel === "object" && (
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setPanel("none")}>
                    <Overlay>
                        <View style={styles.info}>
                            <NeonText fontSize={28} color="#ffd23f" warmColor="#ffe89c">
                                LINEUP CHANGE
                            </NeonText>
                            {infoLines.map((line) => (
                                <Text key={line} style={styles.infoLine}>
                                    {line}
                                </Text>
                            ))}
                            <Text style={styles.infoHint}>Tap anywhere to close</Text>
                        </View>
                    </Overlay>
                </Pressable>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: "transparent" },
    teams: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 14,
        marginTop: 8,
    },
    controls: { flex: 1, alignItems: "center", justifyContent: "center", gap: 26 },
    secondary: { flexDirection: "row", gap: 28 },
    link: { fontFamily: NEON_FONT, fontSize: 17, color: "#ffffffb8" },
    dim: { opacity: 0.35 },
    info: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 24 },
    infoLine: { fontFamily: NEON_FONT, fontSize: 22, color: "#fff", textAlign: "center" },
    infoHint: { fontFamily: NEON_FONT, fontSize: 14, color: "#ffffff70", marginTop: 12 },
});
