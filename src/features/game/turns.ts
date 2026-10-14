import type { Lineup, LiveGame, Player, RosterDraft, TeamId, Teams } from "./types";

export const TEAM_IDS: readonly TeamId[] = [1, 2];

export const otherTeam = (t: TeamId): TeamId => (t === 1 ? 2 : 1);

/** Team 1 always breaks, then teams strictly alternate. */
export function teamAt(turn: number): TeamId {
    return turn % 2 === 0 ? 1 : 2;
}

/** How many of `team`'s turns fall in [from, to). */
export function teamTurnsBetween(from: number, to: number, team: TeamId): number {
    if (to <= from) return 0;
    // Team 1 owns even turns, team 2 odd ones.
    const count = (n: number) =>
        team === 1 ? Math.ceil(n / 2) : Math.floor(n / 2);
    return count(to) - count(from);
}

export function lineupAt(game: Pick<LiveGame, "lineups">, turn: number): Lineup {
    const { lineups } = game;
    for (let i = lineups.length - 1; i >= 0; i--) {
        if (lineups[i].fromTurn <= turn) return lineups[i];
    }
    return lineups[0];
}

export type TurnSlot = { turn: number; team: TeamId; player: Player | null };

/** Who shoots on `turn`, and for which team — as the lineup was at that turn. */
export function playerAt(
    game: Pick<LiveGame, "lineups" | "players">,
    turn: number,
): TurnSlot {
    const team = teamAt(turn);
    const seg = lineupAt(game, turn);
    const roster = seg.teams[team];
    if (roster.length === 0) return { turn, team, player: null };
    const k = teamTurnsBetween(seg.fromTurn, turn, team);
    const id = roster[(seg.offset[team] + k) % roster.length];
    return { turn, team, player: game.players[id] ?? null };
}

/** Index of `team`'s first turn at or after `turn`. */
function nextTeamTurn(turn: number, team: TeamId): number {
    return teamAt(turn) === team ? turn : turn + 1;
}

/**
 * Apply an edited lineup from `game.turn` onward. Earlier turns are untouched.
 * Whoever was next on each team stays next (or the next remaining player in the
 * old rotation if they left). Lineups scheduled at/after this turn (e.g. kept
 * after an undo) are replaced — you're rewriting the lineup from here.
 */
export function applyLineup(game: LiveGame, draft: RosterDraft): LiveGame {
    const at = game.turn;
    const current = lineupAt(game, at);
    const players = { ...game.players, ...draft.players };
    // Who's up is judged by the lineup in effect now, not one scheduled later.
    const effective = game.lineups.filter((l) => l.fromTurn <= at);

    const offset = { 1: 0, 2: 0 } as Record<TeamId, number>;
    for (const team of TEAM_IDS) {
        const next = draft.teams[team];
        if (next.length === 0) continue;
        const old = current.teams[team];
        if (old.length === 0) continue;
        const start = nextTeamTurn(at, team);
        const upId = playerAt({ lineups: effective, players }, start).player?.id;
        const from = upId ? old.indexOf(upId) : 0;
        // Walk the old rotation from whoever's up; first one still on this team wins.
        for (let i = 0; i < old.length; i++) {
            const idx = next.indexOf(old[(from + i) % old.length]);
            if (idx >= 0) {
                offset[team] = idx;
                break;
            }
        }
    }

    const lineup: Lineup = {
        fromTurn: at,
        teams: { 1: [...draft.teams[1]], 2: [...draft.teams[2]] },
        offset,
    };
    const kept = game.lineups.filter((l) => l.fromTurn < at);
    return { ...game, players, lineups: [...kept, lineup] };
}

/** The roster as it stands on `turn`, for editing. */
export function draftAt(game: LiveGame, turn: number): RosterDraft {
    const seg = lineupAt(game, turn);
    const players: Record<string, Player> = {};
    for (const team of TEAM_IDS) {
        for (const id of seg.teams[team]) players[id] = game.players[id];
    }
    return { players, teams: { 1: [...seg.teams[1]], 2: [...seg.teams[2]] } };
}

export function sameTeams(a: Teams, b: Teams): boolean {
    return TEAM_IDS.every(
        (t) => a[t].length === b[t].length && a[t].every((id, i) => b[t][i] === id),
    );
}

/** Human summary of a lineup change, e.g. ["Mike → Team 2", "Sara joined Team 1"]. */
export function describeLineupChange(
    prev: Lineup,
    next: Lineup,
    players: Record<string, Player>,
): string[] {
    const teamOf = (l: Lineup, id: string): TeamId | null =>
        l.teams[1].includes(id) ? 1 : l.teams[2].includes(id) ? 2 : null;
    const ids = new Set([...prev.teams[1], ...prev.teams[2], ...next.teams[1], ...next.teams[2]]);
    const out: string[] = [];
    for (const id of ids) {
        const name = players[id]?.name ?? "?";
        const a = teamOf(prev, id);
        const b = teamOf(next, id);
        if (a === b) continue;
        if (a === null) out.push(`${name} joined Team ${b}`);
        else if (b === null) out.push(`${name} left`);
        else out.push(`${name} → Team ${b}`);
    }
    if (out.length === 0) out.push("Rotation order changed");
    return out;
}

let idCounter = 0;
export function newId(prefix = "p"): string {
    idCounter = (idCounter + 1) % 1e6;
    return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}${Math.random()
        .toString(36)
        .slice(2, 6)}`;
}

/** Fisher–Yates shuffle of everyone across two teams, as evenly as possible. */
export function randomizeTeams(teams: Teams): Teams {
    const all = [...teams[1], ...teams[2]];
    for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [all[i], all[j]] = [all[j], all[i]];
    }
    const half = Math.ceil(all.length / 2);
    return { 1: all.slice(0, half), 2: all.slice(half) };
}
