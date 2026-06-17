import {
    BlurMask,
    Canvas,
    Group,
    Paint,
    Path,
    type SkPath,
} from "@shopify/react-native-skia";
import { StyleSheet } from "react-native";

/** Colour of an unlit glass tube — very close to black so the powered-off sign is
 *  barely-there (with ~30 tubes anything lighter reads as too bright). Tune here. */
const COLD_TUBE_COLOR = "#12121479";

type Props = {
    /** Scaled paths in sign-content coordinates (origin = sign top-left). */
    paths: SkPath[];
    /** Padding (px) around the sign content inside SidePocketNeon's View. */
    contentPad: number;
    tubeWidth: number;
};

/**
 * All the "powered-off" glass tubes, drawn once in a single static canvas (no
 * animation, no SharedValues). This stays visible at brightness 0 so a tube reads
 * as a dark unlit neon rod — like the buttons — instead of vanishing. The animated
 * glow lives in the per-tube <PathTube> canvases layered on top.
 */
export function ColdTubes({ paths, contentPad, tubeWidth }: Props) {
    return (
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
            <Group
                transform={[
                    { translateX: contentPad },
                    { translateY: contentPad },
                ]}
            >
                {paths.map((p, i) => (
                    <Path key={i} path={p} color="transparent">
                        <Paint
                            color={COLD_TUBE_COLOR}
                            style="stroke"
                            strokeWidth={tubeWidth * 0.45}
                        >
                            <BlurMask blur={tubeWidth * 0.15} style="normal" />
                        </Paint>
                    </Path>
                ))}
            </Group>
        </Canvas>
    );
}
