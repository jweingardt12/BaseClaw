/**
 * Shared API types used across MCP App views.
 *
 * These are the canonical definitions — views should import from here
 * instead of redeclaring interfaces locally.
 */

// ─── Common Player Types ────────────────────────────────────────

export interface Player {
  name: string;
  player_id?: string;
  eligible_positions?: string[];
  positions?: string[];
  position?: string;
  team?: string;
  value?: number;
  mlb_id?: number;
  intel?: Record<string, unknown>;
}

export interface RosterPlayer extends Player {
  status?: string;
  slot?: string;
}

export interface InjuredPlayer {
  name: string;
  position: string;
  status: string;
  description?: string;
  injury_description?: string;
  location?: string;
  section?: string;
  team?: string;
  mlb_id?: number;
  intel?: Record<string, unknown>;
}

// ─── Matchup Types ──────────────────────────────────────────────

export interface MatchupCategory {
  name: string;
  my_value: string;
  opp_value: string;
  result: "win" | "loss" | "tie";
  classification?: string;
  margin?: string;
}

export interface MatchupScore {
  wins: number;
  losses: number;
  ties: number;
}

// ─── Lineup Types ───────────────────────────────────────────────

export interface LineupSwap {
  bench_player: string;
  start_player: string;
  position: string;
}

export interface LineupData {
  games_today: number;
  active_off_day: Player[];
  bench_playing: Player[];
  il_players: Array<{ name: string; position?: string; team?: string }>;
  suggested_swaps: LineupSwap[];
  applied: boolean;
}

// ─── Waiver / Transaction Types ─────────────────────────────────

export interface WaiverTarget {
  name: string;
  pid: string;
  pct: number;
  categories: string[];
  team: string;
  games: number;
  score?: number;
  mlb_id?: number;
}

export interface WaiverRecommendation {
  name: string;
  pid: string;
  score: number;
  team?: string;
  position?: string;
  categories?: string[];
  mlb_id?: number;
}

export interface OppTransaction {
  type: string;
  player: string;
  date: string;
}

// ─── What's New Types ───────────────────────────────────────────

export interface WhatsNewActivity {
  type: string;
  player: string;
  team: string;
}

export interface WhatsNewTrending {
  name: string;
  direction: string;
  delta: string;
  percent_owned: number;
}

// ─── Category Types ─────────────────────────────────────────────

export interface CategoryRank {
  name: string;
  rank: number;
  total: number;
  value?: number;
  strength?: string;
}

// ─── Action Items ───────────────────────────────────────────────

export interface ActionItem {
  priority: number;
  type: string;
  message: string;
  player_id?: string;
  transaction_key?: string;
}

// ─── Strategy Types ─────────────────────────────────────────────

export interface StrategyPlan {
  target: string[];
  protect: string[];
  concede: string[];
  lock: string[];
}

// ─── Roster Context (news/headlines) ────────────────────────────

export interface RosterContextEntry {
  name: string;
  status: string;
  flags?: Array<{ type: string; message: string; detail?: string }>;
  injury_severity?: string;
  latest_headline?: string;
  reddit?: { mentions: number; sentiment?: string };
}

// ─── Yesterday Performance ──────────────────────────────────────

export interface YesterdayPlayer {
  name: string;
  position: string;
  mlb_id?: number;
  stats: Record<string, number | string>;
}

export interface YesterdayData {
  players: YesterdayPlayer[];
  period?: string;
  date?: string;
}
