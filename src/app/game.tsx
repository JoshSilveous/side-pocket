import { useRouter } from "expo-router";

import { PlaceholderScreen } from "@/components/placeholder-screen";

export default function Game() {
    const router = useRouter();
    return (
        <PlaceholderScreen
            title="GAME"
            hue={50}
            actions={[{ label: "End Game", hue: 0, onPress: () => router.dismissTo("/") }]}
        />
    );
}
