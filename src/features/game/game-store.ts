import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { useHistoryStore } from "./history-store";
import { applyLineup, lineupAt, newId, otherTeam, sameTeams } from "./turns";
import type { LiveGame, RosterDraft, Side, TeamId } from "./types";

type GameState = {
    /** Setup screen roster. Kept after a game so a rematch is one tap. */
    draft: RosterDraft;
    game: LiveGame | null;

    setDraft: (draft: RosterDraft) => void;
    startGame: () => void;
    next: () => void;
    undo: () => void;
    /** Cycles a team's side: open → solids → stripes → open (other team mirrors). */
    cycleSide: (team: TeamId) => void;
    /** Apply a mid-game lineup edit from the current turn onward. */
    editLineup: (draft: RosterDraft) => void;
    endGame: (winner: TeamId) => void;
    abandonGame: () => void;
};

const EMPTY_DRAFT: RosterDraft = { players: {}, teams: { 1: [], 2: [] } };

export const useGameStore = create<GameState>()(
    persist(
        (set, get) => ({
            draft: EMPTY_DRAFT,
            game: null,

            setDraft: (draft) => set({ draft }),

            startGame: () => {
                const { draft } = get();
                if (draft.teams[1].length === 0 || draft.teams[2].length === 0) return;
                set({
                    game: {
                        id: newId("g"),
                        startedAt: Date.now(),
                        players: { ...draft.players },
                        lineups: [
                            {
                                fromTurn: 0,
                                teams: { 1: [...draft.teams[1]], 2: [...draft.teams[2]] },
                                offset: { 1: 0, 2: 0 },
                            },
                        ],
                        turn: 0,
                        sides: { 1: null, 2: null },
                    },
                });
            },

            next: () => {
                const { game } = get();
                if (game) set({ game: { ...game, turn: game.turn + 1 } });
            },

            undo: () => {
                const { game } = get();
                if (game && game.turn > 0) set({ game: { ...game, turn: game.turn - 1 } });
            },

            cycleSide: (team) => {
                const { game } = get();
                if (!game) return;
                const cur = game.sides[team];
                const nextSide: Side =
                    cur === null ? "solids" : cur === "solids" ? "stripes" : null;
                const mirror: Side =
                    nextSide === null ? null : nextSide === "solids" ? "stripes" : "solids";
                set({
                    game: {
                        ...game,
                        sides: { [team]: nextSide, [otherTeam(team)]: mirror } as LiveGame["sides"],
                    },
                });
            },

            editLineup: (draft) => {
                const { game } = get();
                if (!game) return;
                if (draft.teams[1].length === 0 || draft.teams[2].length === 0) return;
                if (sameTeams(lineupAt(game, game.turn).teams, draft.teams)) {
                    // Renames only: no new lineup segment needed.
                    set({ game: { ...game, players: { ...game.players, ...draft.players } } });
                    return;
                }
                set({ game: applyLineup(game, draft) });
            },

            endGame: (winner) => {
                const { game } = get();
                if (!game) return;
                useHistoryStore.getState().add({
                    id: game.id,
                    startedAt: game.startedAt,
                    endedAt: Date.now(),
                    players: game.players,
                    lineups: game.lineups,
                    turns: game.turn,
                    sides: game.sides,
                    winner,
                });
                // The final lineup becomes the next game's setup (rematch).
                const last = lineupAt(game, game.turn);
                const players: RosterDraft["players"] = {};
                for (const id of [...last.teams[1], ...last.teams[2]]) players[id] = game.players[id];
                set({
                    game: null,
                    draft: { players, teams: { 1: [...last.teams[1]], 2: [...last.teams[2]] } },
                });
            },

            abandonGame: () => set({ game: null }),
        }),
        {
            name: "side-pocket/game",
            version: 1,
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (s) => ({ draft: s.draft, game: s.game }),
        },
    ),
);
