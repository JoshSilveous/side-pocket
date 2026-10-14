export type TeamId = 1 | 2;
export type Side = "solids" | "stripes" | null;

export type Player = { id: string; name: string };

/** Player ids per team, in rotation order. */
export type Teams = Record<TeamId, string[]>;

/** A lineup in effect from `fromTurn` until the next lineup (or forever). */
export type Lineup = {
    fromTurn: number;
    teams: Teams;
    /** Roster index of each team's first turn at or after `fromTurn`. */
    offset: Record<TeamId, number>;
};

export type LiveGame = {
    id: string;
    startedAt: number;
    /** Game-local players by id (no global players table). */
    players: Record<string, Player>;
    /** Sorted by fromTurn; lineups[0].fromTurn === 0. */
    lineups: Lineup[];
    /** Current turn, 0-based. Team 1 breaks, so even turns are Team 1. */
    turn: number;
    sides: Record<TeamId, Side>;
};

export type GameRecord = {
    id: string;
    startedAt: number;
    endedAt: number;
    players: Record<string, Player>;
    lineups: Lineup[];
    /** Turns played (the turn index when the game ended). */
    turns: number;
    sides: Record<TeamId, Side>;
    winner: TeamId;
};

/** Players + teams being edited (setup screen or a mid-game lineup edit). */
export type RosterDraft = {
    players: Record<string, Player>;
    teams: Teams;
};
