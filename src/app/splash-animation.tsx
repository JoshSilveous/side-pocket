import { NeonRenderer } from "@/components/neon-renderer";
import { Text, View } from "react-native";

export default function SplashAnimation() {
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
                <Text style={{ color: "white", fontSize: 48 }}>hi</Text>
            </View>
        </NeonRenderer>
    );
}
