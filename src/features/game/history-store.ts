import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { GameRecord } from "./types";

type HistoryState = {
    /** Newest first. */
    games: GameRecord[];
    add: (record: GameRecord) => void;
};

export const useHistoryStore = create<HistoryState>()(
    persist(
        (set) => ({
            games: [],
            add: (record) => set((s) => ({ games: [record, ...s.games] })),
        }),
        {
            name: "side-pocket/history",
            version: 1,
            storage: createJSONStorage(() => AsyncStorage),
        },
    ),
);

const MAX_RECENT_NAMES = 12;

/** Distinct player names from past games, most recent first. */
export function recentNames(games: GameRecord[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const g of games) {
        for (const p of Object.values(g.players)) {
            const key = p.name.trim().toLowerCase();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            out.push(p.name.trim());
            if (out.length >= MAX_RECENT_NAMES) return out;
        }
    }
    return out;
}
