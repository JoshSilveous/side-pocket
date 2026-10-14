import { Pressable, StyleSheet, Text, View } from "react-native";

import NeonButton from "@/components/neon-button";
import { NeonText } from "@/components/neon-text";
import { Overlay } from "./Overlay";
import { NEON_FONT, TEAM_STYLE } from "./team-style";
import { TEAM_IDS } from "./turns";
import type { TeamId } from "./types";

export function WinnerPrompt({
    onPick,
    onCancel,
    onDiscard,
}: {
    onPick: (team: TeamId) => void;
    onCancel: () => void;
    onDiscard: () => void;
}) {
    return (
        <Overlay>
            <View style={styles.center}>
                <NeonText fontSize={46} color="#ffd23f" warmColor="#ffe89c">
                    WHO WON?
                </NeonText>
                <View style={styles.teams}>
                    {TEAM_IDS.map((t) => (
                        <NeonButton
                            key={t}
                            color={TEAM_STYLE[t].color}
                            warmColor={TEAM_STYLE[t].warm}
                            onPress={() => onPick(t)}
                        >
                            {`Team ${t}`}
                        </NeonButton>
                    ))}
                </View>
                <Pressable onPress={onCancel} hitSlop={10}>
                    <Text style={styles.link}>Keep playing</Text>
                </Pressable>
                <Pressable onPress={onDiscard} hitSlop={10}>
                    <Text style={[styles.link, styles.discard]}>Discard game</Text>
                </Pressable>
            </View>
        </Overlay>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 36 },
    teams: { gap: 28, alignItems: "center" },
    link: { fontFamily: NEON_FONT, fontSize: 18, color: "#ffffffb0" },
    discard: { color: "#ff6b6b", fontSize: 15 },
});
