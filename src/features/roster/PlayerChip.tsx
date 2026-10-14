import { StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { LightFrame } from "@/components/neon-renderer";
import { NeonText } from "@/components/neon-text";

type Props = {
    name: string;
    color: string;
    warmColor: string;
    onTap: () => void;
    onDragStart: () => void;
    /** Called with the drop point's absolute X/Y (screen coords). */
    onDrop: (absoluteX: number, absoluteY: number) => void;
};

/** A player's neon name. Tap to edit; long-press then drag to move teams. */
export function PlayerChip({ name, color, warmColor, onTap, onDragStart, onDrop }: Props) {
    const tx = useSharedValue(0);
    const ty = useSharedValue(0);
    const scale = useSharedValue(1);

    const pan = Gesture.Pan()
        .activateAfterLongPress(220)
        .onStart(() => {
            scale.value = withTiming(1.12, { duration: 120 });
            scheduleOnRN(onDragStart);
        })
        .onUpdate((e) => {
            tx.value = e.translationX;
            ty.value = e.translationY;
        })
        .onEnd((e) => {
            scheduleOnRN(onDrop, e.absoluteX, e.absoluteY);
        })
        .onFinalize(() => {
            // If the drop moved us to the other team this view unmounts anyway.
            tx.value = withSpring(0, { damping: 18, stiffness: 220 });
            ty.value = withSpring(0, { damping: 18, stiffness: 220 });
            scale.value = withTiming(1, { duration: 150 });
        });

    const tap = Gesture.Tap().onEnd((_e, ok) => {
        if (ok) scheduleOnRN(onTap);
    });

    return (
        <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
            <LightFrame translateX={tx} translateY={ty} scale={scale} style={styles.chip}>
                <NeonText fontSize={22} color={color} warmColor={warmColor}>
                    {name}
                </NeonText>
            </LightFrame>
        </GestureDetector>
    );
}

const styles = StyleSheet.create({
    chip: { paddingVertical: 6, alignItems: "center" },
});
