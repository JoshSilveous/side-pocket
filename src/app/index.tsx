import { useRouter } from "expo-router";

import { PlaceholderScreen } from "@/components/placeholder-screen";

export default function Home() {
    const router = useRouter();
    return (
        <PlaceholderScreen
            title="SIDE POCKET"
            hue={320}
            actions={[{ label: "Start Game", hue: 160, onPress: () => router.push("/setup") }]}
        />
    );
}
