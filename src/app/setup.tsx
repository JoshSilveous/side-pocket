import { useRouter } from "expo-router";

import { PlaceholderScreen } from "@/components/placeholder-screen";

export default function Setup() {
    const router = useRouter();
    return (
        <PlaceholderScreen
            title="SETUP"
            hue={200}
            actions={[
                { label: "Start", hue: 120, onPress: () => router.push("/game") },
                { label: "Back", hue: 30, onPress: () => router.back() },
            ]}
        />
    );
}
