import { useState } from "react";
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import NeonButton from "@/components/neon-button";
import { NeonPanel } from "@/components/neon-panel";
import { NeonText } from "@/components/neon-text";
import { NEON_FONT, TEAM_STYLE } from "@/features/game/team-style";
import type { TeamId } from "@/features/game/types";

export const MAX_NAME_LENGTH = 14;

type Props = {
    team: TeamId;
    /** "add" keeps the sheet open after each name for quick entry. */
    mode: "add" | "edit";
    initialName?: string;
    suggestions: string[];
    onSubmit: (name: string) => void;
    onRemove?: () => void;
    onClose: () => void;
};

/** Overlay for typing a player name (add) or renaming/removing one (edit). */
export function NameSheet({
    team,
    mode,
    initialName = "",
    suggestions,
    onSubmit,
    onRemove,
    onClose,
}: Props) {
    const [name, setName] = useState(initialName);
    const style = TEAM_STYLE[team];
    const trimmed = name.trim();

    const submit = (value = trimmed) => {
        if (!value) return;
        onSubmit(value);
        if (mode === "add") setName("");
        else onClose();
    };

    return (
        // A Modal so the scrim covers the whole screen, not just the editor area.
        <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
            <Pressable style={styles.scrim} onPress={onClose} />
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                style={styles.center}
                pointerEvents="box-none"
            >
                <NeonPanel color={style.color} warmColor={style.warm} style={styles.panel}>
                    <NeonText fontSize={24} color={style.color} warmColor={style.warm}>
                        {mode === "add" ? `ADD TO ${style.label}` : "EDIT PLAYER"}
                    </NeonText>

                    <TextInput
                        value={name}
                        onChangeText={setName}
                        autoFocus
                        maxLength={MAX_NAME_LENGTH}
                        placeholder="Name"
                        placeholderTextColor="#ffffff40"
                        returnKeyType={mode === "add" ? "next" : "done"}
                        submitBehavior={mode === "add" ? "submit" : "blurAndSubmit"}
                        onSubmitEditing={() => submit()}
                        autoCapitalize="words"
                        autoCorrect={false}
                        selectionColor={style.color}
                        style={[styles.input, { borderColor: style.color }]}
                    />

                    {mode === "add" && suggestions.length > 0 && (
                        <ScrollView
                            horizontal
                            keyboardShouldPersistTaps="always"
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.chips}
                        >
                            {suggestions.map((s) => (
                                <Pressable
                                    key={s}
                                    onPress={() => submit(s)}
                                    style={({ pressed }) => [
                                        styles.chip,
                                        { borderColor: style.color },
                                        pressed && { backgroundColor: `${style.color}33` },
                                    ]}
                                >
                                    <Text style={[styles.chipText, { color: style.warm }]}>{s}</Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    )}

                    <View style={styles.actions}>
                        {mode === "edit" && onRemove && (
                            <NeonButton
                                fontSize={20}
                                color="#ff3b3b"
                                warmColor="#ffa0a0"
                                onPress={() => {
                                    onRemove();
                                    onClose();
                                }}
                            >
                                Remove
                            </NeonButton>
                        )}
                        <NeonButton
                            fontSize={20}
                            color={style.color}
                            warmColor={style.warm}
                            disabled={mode === "edit" && !trimmed}
                            onPress={() => (mode === "add" && !trimmed ? onClose() : submit())}
                        >
                            {mode === "add" ? (trimmed ? "Add" : "Done") : "Save"}
                        </NeonButton>
                    </View>
                </NeonPanel>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    scrim: { ...StyleSheet.absoluteFill, backgroundColor: "#000000c8" },
    center: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
    panel: { padding: 22, gap: 18, alignItems: "center" },
    input: {
        alignSelf: "stretch",
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        color: "#fff",
        fontFamily: NEON_FONT,
        fontSize: 24,
        backgroundColor: "#00000080",
    },
    chips: { gap: 8, paddingVertical: 2 },
    chip: {
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    chipText: { fontFamily: NEON_FONT, fontSize: 16 },
    actions: { flexDirection: "row", gap: 16, alignItems: "center" },
});
