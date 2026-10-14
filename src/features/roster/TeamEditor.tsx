import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { NeonPanel } from "@/components/neon-panel";
import { NeonText } from "@/components/neon-text";
import { NEON_FONT, TEAM_STYLE } from "@/features/game/team-style";
import { newId, TEAM_IDS } from "@/features/game/turns";
import type { RosterDraft, TeamId } from "@/features/game/types";
import { NameSheet } from "./NameSheet";
import { PlayerChip } from "./PlayerChip";

type Sheet = { kind: "add"; team: TeamId } | { kind: "edit"; team: TeamId; id: string } | null;

/**
 * Two team cards split down the middle. Tap a card to add players, tap a name
 * to rename/remove, long-press + drag a name across the middle to switch teams.
 * Controlled: used by the setup screen and the mid-game lineup editor.
 */
export function TeamEditor({
    draft,
    onChange,
    suggestions,
}: {
    draft: RosterDraft;
    onChange: (draft: RosterDraft) => void;
    suggestions: string[];
}) {
    const { width: screenW } = useWindowDimensions();
    const [sheet, setSheet] = useState<Sheet>(null);
    const [dragTeam, setDragTeam] = useState<TeamId | null>(null);

    const usedNames = useMemo(
        () => new Set(Object.values(draft.players).map((p) => p.name.toLowerCase())),
        [draft.players],
    );
    const freeSuggestions = suggestions.filter((s) => !usedNames.has(s.toLowerCase()));

    const addPlayer = (team: TeamId, name: string) => {
        const id = newId();
        onChange({
            players: { ...draft.players, [id]: { id, name } },
            teams: { ...draft.teams, [team]: [...draft.teams[team], id] },
        });
    };

    const renamePlayer = (id: string, name: string) =>
        onChange({ ...draft, players: { ...draft.players, [id]: { id, name } } });

    const removePlayer = (id: string) => {
        const players = { ...draft.players };
        delete players[id];
        onChange({
            players,
            teams: { 1: draft.teams[1].filter((x) => x !== id), 2: draft.teams[2].filter((x) => x !== id) },
        });
    };

    // Dropped past the middle of the screen → other team, appended to its rotation.
    const dropPlayer = (id: string, from: TeamId, absoluteX: number) => {
        setDragTeam(null);
        const to: TeamId = absoluteX < screenW / 2 ? 1 : 2;
        if (to === from) return;
        onChange({
            ...draft,
            teams: {
                ...draft.teams,
                [from]: draft.teams[from].filter((x) => x !== id),
                [to]: [...draft.teams[to], id],
            } as RosterDraft["teams"],
        });
    };

    return (
        <View style={styles.root}>
            <View style={styles.row}>
                {TEAM_IDS.map((team) => {
                    const ts = TEAM_STYLE[team];
                    return (
                        <Pressable
                            key={team}
                            style={[styles.column, dragTeam === team && styles.raised]}
                            onPress={() => setSheet({ kind: "add", team })}
                        >
                            <NeonPanel color={ts.color} warmColor={ts.warm} style={styles.card}>
                                <NeonText fontSize={24} color={ts.color} warmColor={ts.warm}>
                                    {ts.label}
                                </NeonText>
                                <View style={styles.list}>
                                    {draft.teams[team].map((id) => (
                                        <PlayerChip
                                            key={id}
                                            name={draft.players[id]?.name ?? "?"}
                                            color={ts.color}
                                            warmColor={ts.warm}
                                            onTap={() => setSheet({ kind: "edit", team, id })}
                                            onDragStart={() => setDragTeam(team)}
                                            onDrop={(x) => dropPlayer(id, team, x)}
                                        />
                                    ))}
                                </View>
                                <Text style={[styles.addHint, { color: ts.warm }]}>+ add player</Text>
                            </NeonPanel>
                        </Pressable>
                    );
                })}
            </View>

            {sheet && (
                <NameSheet
                    key={sheet.kind === "edit" ? sheet.id : `add-${sheet.team}`}
                    team={sheet.team}
                    mode={sheet.kind}
                    initialName={sheet.kind === "edit" ? draft.players[sheet.id]?.name : ""}
                    suggestions={freeSuggestions}
                    onSubmit={(name) =>
                        sheet.kind === "add" ? addPlayer(sheet.team, name) : renamePlayer(sheet.id, name)
                    }
                    onRemove={sheet.kind === "edit" ? () => removePlayer(sheet.id) : undefined}
                    onClose={() => setSheet(null)}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    row: { flex: 1, flexDirection: "row", gap: 14, paddingHorizontal: 16 },
    column: { flex: 1 },
    raised: { zIndex: 10 },
    card: { flex: 1, paddingVertical: 18, paddingHorizontal: 8, alignItems: "center", gap: 10 },
    list: { alignSelf: "stretch", alignItems: "center", gap: 2 },
    addHint: { fontFamily: NEON_FONT, fontSize: 15, opacity: 0.55, marginTop: 6 },
});
