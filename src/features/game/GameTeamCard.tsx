import { Pressable, StyleSheet, Text, View } from "react-native";

import { NeonPanel } from "@/components/neon-panel";
import { NeonBadge } from "@/components/neon-shapes";
import { NeonText } from "@/components/neon-text";
import { NEON_FONT, SIDE_LABEL, TEAM_STYLE } from "./team-style";
import { lineupAt, playerAt } from "./turns";
import type { LiveGame, TeamId } from "./types";

/** One team's card on the game screen: roster, who's up, and their side. */
export function GameTeamCard({
    game,
    team,
    onCycleSide,
}: {
    game: LiveGame;
    team: TeamId;
    onCycleSide: () => void;
}) {
    const ts = TEAM_STYLE[team];
    const roster = lineupAt(game, game.turn).teams[team];
    const upId = playerAt(game, game.turn).player?.id;
    const side = game.sides[team];

    return (
        <NeonPanel color={ts.color} warmColor={ts.warm} style={styles.card}>
            <NeonText fontSize={22} color={ts.color} warmColor={ts.warm}>
                {ts.label}
            </NeonText>
            <View style={styles.names}>
                {roster.map((id) => (
                    <Text
                        key={id}
                        numberOfLines={1}
                        style={[
                            styles.name,
                            { color: ts.warm, textShadowColor: ts.color },
                            id === upId && styles.up,
                        ]}
                    >
                        {game.players[id]?.name}
                    </Text>
                ))}
            </View>
            <Pressable onPress={onCycleSide} hitSlop={10} style={styles.side}>
                {side && <NeonBadge shape={side} color={ts.color} warmColor={ts.warm} size={20} />}
                <Text style={[styles.sideText, { color: side ? ts.warm : "#ffffff70" }]}>
                    {side ? SIDE_LABEL[side] : "OPEN TABLE"}
                </Text>
            </Pressable>
        </NeonPanel>
    );
}

const styles = StyleSheet.create({
    card: { flex: 1, paddingVertical: 14, paddingHorizontal: 8, alignItems: "center", gap: 8 },
    names: { alignSelf: "stretch", alignItems: "center", gap: 2, minHeight: 60 },
    name: {
        fontFamily: NEON_FONT,
        fontSize: 17,
        opacity: 0.6,
        textShadowRadius: 6,
        textShadowOffset: { width: 0, height: 0 },
    },
    up: { opacity: 1, fontSize: 19 },
    side: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 4 },
    sideText: { fontFamily: NEON_FONT, fontSize: 14, letterSpacing: 1.5 },
});
