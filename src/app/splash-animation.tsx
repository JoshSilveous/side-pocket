import { useRef } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NeonRenderer } from "@/components/neon-renderer";
import {
    SidePocketNeon,
    type SidePocketNeonHandle,
} from "@/components/side-pocket";

export default function SplashAnimation() {
    const { width: screenWidth } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const signWidth = Math.min(screenWidth * 0.85, 420);

    const signRef = useRef<SidePocketNeonHandle>(null);

    return (
        <NeonRenderer
            tileCount={0.8}
            wallTextures={{
                albedo: require("@/assets/textures/brick_albedo.png"),
                normalMap: require("@/assets/textures/brick_normal.png"),
                roughnessMap: require("@/assets/textures/brick_roughness.png"),
            }}
        >
            <View
                style={{
                    flex: 1,
                    backgroundColor: "transparent",
                    justifyContent: "center",
                    alignItems: "center",
                }}
            >
                <SidePocketNeon ref={signRef} width={signWidth} />
            </View>

            {/* Temporary dev control: replay the power-on animation. */}
            <Pressable
                onPress={() => signRef.current?.powerOn()}
                style={({ pressed }) => ({
                    position: "absolute",
                    bottom: insets.bottom + 90,
                    alignSelf: "center",
                    paddingHorizontal: 28,
                    paddingVertical: 12,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: "#ff2020",
                    backgroundColor: pressed ? "#ff202022" : "#00000088",
                })}
            >
                <Text
                    style={{
                        color: "#ffffff",
                        fontSize: 16,
                        fontWeight: "700",
                        letterSpacing: 1,
                    }}
                >
                    POWER ON
                </Text>
            </Pressable>
        </NeonRenderer>
    );
}
