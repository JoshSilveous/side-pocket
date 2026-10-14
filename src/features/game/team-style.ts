import type { Side, TeamId } from "./types";

export const TEAM_STYLE: Record<TeamId, { color: string; warm: string; label: string }> = {
    1: { color: "#ff2d95", warm: "#ffa3d1", label: "TEAM 1" },
    2: { color: "#00e5ff", warm: "#9ff6ff", label: "TEAM 2" },
};

export const SIDE_LABEL: Record<Exclude<Side, null>, string> = {
    solids: "SOLIDS",
    stripes: "STRIPES",
};

/** RN font family for plain (non-Skia) text, loaded in the root layout. */
export const NEON_FONT = "TiltNeon_400Regular";
