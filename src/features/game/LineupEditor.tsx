import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import NeonButton from "@/components/neon-button";
import { NeonText } from "@/components/neon-text";
import { TeamEditor } from "@/features/roster/TeamEditor";
import { recentNames, useHistoryStore } from "./history-store";
import { Overlay } from "./Overlay";
import { NEON_FONT } from "./team-style";
import { draftAt } from "./turns";
import type { LiveGame, RosterDraft } from "./types";

/** Mid-game lineup edit. Saved changes apply from the current turn onward. */
export function LineupEditor({
    game,
    onSave,
    onCancel,
}: {
    game: LiveGame;
    onSave: (draft: RosterDraft) => void;
    onCancel: () => void;
}) {
    const [draft, setDraft] = useState(() => draftAt(game, game.turn));
    const games = useHistoryStore((s) => s.games);
    const suggestions = useMemo(() => recentNames(games), [games]);
    const valid = draft.teams[1].length > 0 && draft.teams[2].length > 0;

    return (
        <Overlay>
            <View style={styles.header}>
                <NeonText fontSize={34} color="#ffd23f" warmColor="#ffe89c">
                    EDIT LINEUP
                </NeonText>
                <Text style={styles.sub}>Changes apply from this turn on</Text>
            </View>
            <TeamEditor draft={draft} onChange={setDraft} suggestions={suggestions} />
            <View style={styles.footer}>
                <Pressable onPress={onCancel} hitSlop={10}>
                    <Text style={styles.cancel}>Cancel</Text>
                </Pressable>
                <NeonButton color="#39ff14" warmColor="#a6ff8c" disabled={!valid} onPress={() => onSave(draft)}>
                    Save
                </NeonButton>
            </View>
        </Overlay>
    );
}

const styles = StyleSheet.create({
    header: { alignItems: "center", paddingTop: 16, paddingBottom: 18, gap: 6 },
    sub: { fontFamily: NEON_FONT, fontSize: 15, color: "#ffffff80" },
    footer: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 32,
        paddingVertical: 24,
    },
    cancel: { fontFamily: NEON_FONT, fontSize: 20, color: "#ffffffb0" },
});
