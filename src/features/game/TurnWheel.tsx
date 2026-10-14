import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
    cancelAnimation,
    useAnimatedReaction,
    useDerivedValue,
    useSharedValue,
    withSpring,
    type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { LightFrame } from "@/components/neon-renderer";
import { NeonBadge, NeonLine } from "@/components/neon-shapes";
import { NeonText } from "@/components/neon-text";
import { TEAM_STYLE } from "./team-style";
import { playerAt } from "./turns";
import type { LiveGame, Side } from "./types";

const ROW = 64;
/** Vertical position (px) of the current player's row inside the wheel. */
const ANCHOR_Y = 108;
export const WHEEL_HEIGHT = 280;
/** How far past the current turn you can scroll to peek at who's coming. */
const FUTURE_TURNS = 10;
/** Rows kept mounted either side of the scroll position. */
const WINDOW_BEFORE = 3;
const WINDOW_AFTER = 4;
const SNAP_BACK_MS = 3000;
const SPRING = { damping: 20, stiffness: 180, mass: 0.8 };
const DIVIDER_COLOR = "#ffd23f";
const DIVIDER_WARM = "#ffe89c";

/**
 * Slot-machine drum: distance d (in turns) from the scroll position bends rows
 * toward the centre, shrinks them and fades them. Past rows fade faster so the
 * wheel reads prev / CURRENT / next / next+2.
 */
function rowY(d: number) {
    "worklet";
    const a = Math.min(Math.abs(d), 3.5);
    return Math.sign(d) * ROW * (a - 0.12 * a * a);
}
function rowScale(d: number) {
    "worklet";
    return Math.max(0.4, 1 - 0.2 * Math.abs(d));
}
function rowOpacity(d: number) {
    "worklet";
    const a = Math.abs(d);
    return Math.max(0, d < 0 ? 1 - 0.5 * a : 1 - 0.3 * a);
}

function WheelRow({
    turn,
    offset,
    game,
    sides,
    changeAt,
    onInfo,
}: {
    turn: number;
    offset: SharedValue<number>;
    game: LiveGame;
    sides: Record<1 | 2, Side>;
    changeAt: boolean;
    onInfo: (turn: number) => void;
}) {
    const ty = useDerivedValue(() => rowY(turn - offset.value), [turn]);
    const scale = useDerivedValue(() => rowScale(turn - offset.value), [turn]);
    const opacity = useDerivedValue(() => rowOpacity(turn - offset.value), [turn]);

    const slot = playerAt(game, turn);
    const ts = TEAM_STYLE[slot.team];
    const side = sides[slot.team];

    return (
        <LightFrame
            translateY={ty}
            scale={scale}
            opacity={opacity}
            style={styles.row}
            pointerEvents="box-none"
        >
            {changeAt && (
                <View style={styles.divider} pointerEvents="box-none">
                    <NeonLine color={DIVIDER_COLOR} warmColor={DIVIDER_WARM} style={styles.dividerLine} />
                    <Pressable hitSlop={14} onPress={() => onInfo(turn)}>
                        <NeonBadge shape="ring" label="i" color={DIVIDER_COLOR} warmColor={DIVIDER_WARM} size={22} />
                    </Pressable>
                </View>
            )}
            <View style={styles.rowContent}>
                <NeonBadge
                    shape={side ?? "ring"}
                    label={side ? undefined : String(slot.team)}
                    color={ts.color}
                    warmColor={ts.warm}
                    size={28}
                />
                <NeonText fontSize={38} color={ts.color} warmColor={ts.warm}>
                    {slot.player?.name ?? "—"}
                </NeonText>
            </View>
        </LightFrame>
    );
}

/**
 * Scrollable turn wheel. Free-scrolls through past and upcoming turns; snaps back
 * to whoever's up 3s after the last touch, and whenever the turn changes.
 */
export function TurnWheel({
    game,
    onInfo,
}: {
    game: LiveGame;
    onInfo: (turn: number) => void;
}) {
    const offset = useSharedValue(game.turn);
    const start = useSharedValue(0);
    const maxTurn = useSharedValue(game.turn + FUTURE_TURNS);
    const [center, setCenter] = useState(game.turn);
    const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const turnRef = useRef(game.turn);
    turnRef.current = game.turn;

    useAnimatedReaction(
        () => Math.round(offset.value),
        (c, prev) => {
            if (c !== prev) scheduleOnRN(setCenter, c);
        },
    );

    const cancelSnap = () => {
        if (snapTimer.current) clearTimeout(snapTimer.current);
        snapTimer.current = null;
    };
    const armSnap = () => {
        cancelSnap();
        snapTimer.current = setTimeout(() => {
            offset.value = withSpring(turnRef.current, SPRING);
        }, SNAP_BACK_MS);
    };

    useEffect(() => {
        cancelSnap();
        maxTurn.value = game.turn + FUTURE_TURNS;
        offset.value = withSpring(game.turn, SPRING);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [game.turn]);

    useEffect(() => cancelSnap, []);

    const pan = Gesture.Pan()
        .activeOffsetY([-6, 6])
        .onBegin(() => {
            cancelAnimation(offset);
            start.value = offset.value;
            scheduleOnRN(cancelSnap);
        })
        .onUpdate((e) => {
            const v = start.value - e.translationY / ROW;
            offset.value = Math.max(0, Math.min(maxTurn.value, v));
        })
        .onEnd((e) => {
            const flung = offset.value - (e.velocityY / ROW) * 0.15;
            const target = Math.max(0, Math.min(maxTurn.value, Math.round(flung)));
            offset.value = withSpring(target, SPRING);
        })
        .onFinalize(() => {
            scheduleOnRN(armSnap);
        });

    const changeTurns = new Set(game.lineups.filter((l) => l.fromTurn > 0).map((l) => l.fromTurn));
    const rows: number[] = [];
    for (let n = Math.max(0, center - WINDOW_BEFORE); n <= center + WINDOW_AFTER; n++) rows.push(n);

    return (
        <GestureDetector gesture={pan}>
            <View style={styles.wheel}>
                {rows.map((n) => (
                    <WheelRow
                        key={n}
                        turn={n}
                        offset={offset}
                        game={game}
                        sides={game.sides}
                        changeAt={changeTurns.has(n)}
                        onInfo={onInfo}
                    />
                ))}
            </View>
        </GestureDetector>
    );
}

const styles = StyleSheet.create({
    wheel: { height: WHEEL_HEIGHT },
    row: {
        position: "absolute",
        left: 0,
        right: 0,
        top: ANCHOR_Y - ROW / 2,
        height: ROW,
        alignItems: "center",
        justifyContent: "center",
    },
    rowContent: { flexDirection: "row", alignItems: "center", gap: 14 },
    divider: {
        position: "absolute",
        top: -10,
        left: "16%",
        right: "16%",
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    dividerLine: { flex: 1 },
});
