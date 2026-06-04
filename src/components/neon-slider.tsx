import {
    Canvas,
    LinearGradient,
    Rect,
    vec,
} from "@shopify/react-native-skia";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    runOnJS,
    SharedValue,
    useAnimatedStyle,
    useDerivedValue,
    useSharedValue,
} from "react-native-reanimated";

const TRACK_HEIGHT = 6;
const THUMB_SIZE = 28;

type NeonSliderProps = {
    // The SharedValue this slider controls — updated on the UI thread during drag
    value: SharedValue<number>;
    min?: number;
    max?: number;
    // Gradient colors for the track, left to right
    trackColors: string[];
    // Optional label above the slider
    label?: string;
    // Optional JS-thread callback — fires during drag for things that need
    // a JS value (e.g. updating a color string in React state).
    // Keep logic here lightweight since it fires on every frame during drag.
    onJsChange?: (value: number) => void;
};

export function NeonSlider({
    value,
    min = 0,
    max = 1,
    trackColors,
    label,
    onJsChange,
}: NeonSliderProps) {
    // trackWidth drives Canvas dimensions (needs a concrete number for Skia Rect).
    // Stored in regular state since it only changes on layout, not during drag.
    const [trackWidth, setTrackWidth] = useState(0);

    // thumbX is a SharedValue so the thumb moves on the UI thread with no JS re-renders.
    const thumbX = useSharedValue(0);

    // Keep thumbX in sync when value changes externally
    useDerivedValue(() => {
        const normalized = (value.value - min) / (max - min);
        thumbX.value = normalized * Math.max(0, trackWidth - THUMB_SIZE);
    });

    const gesture = Gesture.Pan()
        .onBegin((e) => {
            // Snap thumb to wherever the user touches down, not just where they start dragging
            const normalized = Math.max(0, Math.min(1,
                (e.x - THUMB_SIZE / 2) / Math.max(1, trackWidth - THUMB_SIZE)
            ));
            thumbX.value = normalized * Math.max(0, trackWidth - THUMB_SIZE);
            value.value = min + normalized * (max - min);
            if (onJsChange) runOnJS(onJsChange)(value.value);
        })
        .onUpdate((e) => {
            const normalized = Math.max(0, Math.min(1,
                (e.x - THUMB_SIZE / 2) / Math.max(1, trackWidth - THUMB_SIZE)
            ));
            thumbX.value = normalized * Math.max(0, trackWidth - THUMB_SIZE);
            value.value = min + normalized * (max - min);
            if (onJsChange) runOnJS(onJsChange)(value.value);
        });

    const thumbAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: thumbX.value }],
    }));

    return (
        <View style={styles.container}>
            {label && <Text style={styles.label}>{label}</Text>}

            <GestureDetector gesture={gesture}>
                <View
                    onLayout={(e) => {
                        const w = e.nativeEvent.layout.width;
                        setTrackWidth(w);
                        // Sync thumb to current value after measuring
                        const normalized = (value.value - min) / (max - min);
                        thumbX.value = normalized * Math.max(0, w - THUMB_SIZE);
                    }}
                    style={styles.track}
                >
                    {/* Gradient track drawn with Skia */}
                    {trackWidth > 0 && (
                        <Canvas style={[StyleSheet.absoluteFill, styles.trackCanvas]}>
                            <Rect
                                x={THUMB_SIZE / 2}
                                y={0}
                                width={Math.max(0, trackWidth - THUMB_SIZE)}
                                height={TRACK_HEIGHT}
                                r={TRACK_HEIGHT / 2}
                            >
                                <LinearGradient
                                    start={vec(THUMB_SIZE / 2, 0)}
                                    end={vec(trackWidth - THUMB_SIZE / 2, 0)}
                                    colors={trackColors}
                                />
                            </Rect>
                        </Canvas>
                    )}

                    {/* Thumb */}
                    <Animated.View style={[styles.thumb, thumbAnimatedStyle]} />
                </View>
            </GestureDetector>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        gap: 8,
        paddingHorizontal: 4,
    },
    label: {
        color: "#aaaaaa",
        fontSize: 12,
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: 1,
    },
    track: {
        height: THUMB_SIZE,
        justifyContent: "center",
    },
    trackCanvas: {
        top: (THUMB_SIZE - TRACK_HEIGHT) / 2,
        height: TRACK_HEIGHT,
    },
    thumb: {
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        borderRadius: THUMB_SIZE / 2,
        backgroundColor: "#ffffff",
        shadowColor: "#ffffff",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 6,
        elevation: 4,
    },
});
