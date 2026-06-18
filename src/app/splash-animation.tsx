import { useWindowDimensions, View } from "react-native";

import { NeonRenderer } from "@/components/neon-renderer";
import { SidePocketNeon } from "@/components/side-pocket";

export default function SplashAnimation() {
    const { width: screenWidth } = useWindowDimensions();
    const signWidth = Math.min(screenWidth * 0.85, 420);

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
                {/* Tap the sign to replay the power-on animation. */}
                <SidePocketNeon width={signWidth} />
            </View>
        </NeonRenderer>
    );
}
