import { useCallback, useEffect, useRef } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
    playPowerOnSizzle,
    SidePocketNeon,
    type SidePocketNeonHandle,
} from "@/components/side-pocket";
import SidePocketHaptics from "../../modules/side-pocket-haptics";

export default function SplashAnimation() {
    const { width: screenWidth } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const signWidth = Math.min(screenWidth * 0.85, 420);

    const signRef = useRef<SidePocketNeonHandle>(null);

    // The haptic sizzle that rides along with the power-on flush.
    const playSizzle = useCallback(() => playPowerOnSizzle(), []);

    // Play button: replay the start animation + its sizzle.
    const play = useCallback(() => {
        signRef.current?.powerOn();
        playSizzle();
    }, [playSizzle]);

    // Warm the engine and sizzle alongside the sign's auto power-on on mount.
    useEffect(() => {
        SidePocketHaptics.prepare().catch(() => {});
        playSizzle();
    }, [playSizzle]);

    return (
        <View style={{ flex: 1 }}>
            <View
                style={{
                    flex: 1,
                    backgroundColor: "transparent",
                    justifyContent: "center",
                    alignItems: "center",
                }}
            >
                {/* Tap the sign to replay the ripple; Play replays the start anim. */}
                <SidePocketNeon ref={signRef} width={signWidth} />
            </View>

            <Pressable
                onPress={play}
                style={({ pressed }) => ({
                    position: "absolute",
                    bottom: insets.bottom + 40,
                    alignSelf: "center",
                    paddingHorizontal: 32,
                    paddingVertical: 14,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: "#39ff14",
                    backgroundColor: pressed ? "#39ff1433" : "#00000088",
                })}
            >
                <Text
                    style={{
                        color: "#ffffff",
                        fontSize: 16,
                        fontWeight: "700",
                        letterSpacing: 2,
                    }}
                >
                    ▶ PLAY
                </Text>
            </Pressable>
        </View>
    );
}
