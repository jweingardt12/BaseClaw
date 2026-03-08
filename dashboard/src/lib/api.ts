const API_BASE = "http://localhost:8766";

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Types
export interface Player {
  name: string;
  team: string;
  position: string;
  status: "active" | "bench" | "IL" | "NA";
  stats: Record<string, number>;
  mlb_id?: number;
  statcast?: Record<string, number>;
  trends?: { date: string; value: number }[];
  splits?: { split: string; stats: Record<string, number> }[];
}

export interface RosterPlayer extends Player {
  slot: string;
  isLocked: boolean;
}

export interface FreeAgent extends Player {
  ownership: number;
  addScore: number;
  type: "hitter" | "pitcher";
  faabSuggested: number;
}

export interface Standing {
  team: string;
  rank: number;
  wins: number;
  losses: number;
  ties: number;
  gb: number;
  categories: Record<string, { value: number; rank: number }>;
  powerRank: number;
  playoffPct: number;
  trend: { week: number; wins: number; losses: number }[];
  team_logo?: string;
  manager_image?: string;
}

export interface MorningBriefing {
  date: string;
  summary: string;
  alerts: { type: "info" | "warning" | "critical"; message: string }[];
  lineupChanges: { player: string; action: string }[];
  gamesOverview: string;
}

export interface CategoryCheck {
  category: string;
  value: number;
  rank: number;
  trend: { date: string; value: number }[];
  target: number;
}

export interface Matchup {
  opponent: string;
  categories: { name: string; yours: number; theirs: number; winning: boolean }[];
  score: { wins: number; losses: number; ties: number };
}

export interface Scoreboard {
  matchups: { team1: string; team2: string; score1: number; score2: number }[];
}

export interface Trade {
  id: string;
  partner: string;
  sending: Player[];
  receiving: Player[];
  grade: string;
  analysis: string;
  status: "pending" | "accepted" | "rejected" | "countered";
}

export interface LeagueHistoryEntry {
  season: number;
  wins: number;
  losses: number;
  rank: number;
  champion: string;
  details: Record<string, unknown>;
}

export interface WeekPlannerDay {
  date: string;
  dayOfWeek: string;
  games: number;
  starters: { name: string; matchup: string; quality: "good" | "neutral" | "bad" }[];
  recommendations: string[];
}

export interface PlayerReport {
  player: Player;
  analysis: string;
  outlook: string;
  comparisons: { metric: string; actual: number; expected: number }[];
}

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  timestamp: string;
  playerName?: string;
}

export interface BreakoutCandidate {
  player: Player;
  reason: string;
  confidence: number;
  keyMetrics: Record<string, number>;
}

export interface SystemStatus {
  status: "healthy" | "degraded" | "down";
  uptime: string;
  version: string;
  components: { name: string; status: string }[];
}

export interface AutonomyConfig {
  mode: "off" | "suggest" | "auto";
  actions: Record<string, boolean>;
  faabLimit: number;
}

export interface Rankings {
  players: { rank: number; name: string; team: string; position: string; value: number }[];
}

// GET endpoints
export const getRoster = () => fetchApi<RosterPlayer[]>("/roster");
export const getFreeAgents = () => fetchApi<FreeAgent[]>("/free-agents");
export const getStandings = () => fetchApi<Standing[]>("/standings");
export const getMorningBriefing = () => fetchApi<MorningBriefing>("/morning-briefing");
export const getCategoryCheck = () => fetchApi<CategoryCheck[]>("/category-check");
export const getMatchup = () => fetchApi<Matchup>("/matchup");
export const getScoreboard = () => fetchApi<Scoreboard>("/scoreboard");
export const getPendingTrades = () => fetchApi<Trade[]>("/trades/pending");
export const getLeagueHistory = () => fetchApi<LeagueHistoryEntry[]>("/league-history");
export const getWeekPlanner = () => fetchApi<WeekPlannerDay[]>("/week-planner");
export const getPlayerReport = (name: string) => fetchApi<PlayerReport>(`/player-report?name=${encodeURIComponent(name)}`);
export const getNewsLatest = () => fetchApi<NewsItem[]>("/news/latest");
export const getBreakoutCandidates = () => fetchApi<BreakoutCandidate[]>("/breakout-candidates");
export const getBustCandidates = () => fetchApi<BreakoutCandidate[]>("/bust-candidates");
export const getRankings = () => fetchApi<Rankings>("/rankings");
export const getSystemStatus = () => fetchApi<SystemStatus>("/health");
export const getAutonomyConfig = () => fetchApi<AutonomyConfig>("/autonomy-config");

// POST endpoints
export const autoOptimizeLineup = () => fetchApi<{ success: boolean; changes: string[] }>("/lineup/optimize", { method: "POST" });
export const addPlayer = (name: string, faab?: number) => fetchApi<{ success: boolean }>("/players/add", { method: "POST", body: JSON.stringify({ name, faab }) });
export const dropPlayer = (name: string) => fetchApi<{ success: boolean }>("/players/drop", { method: "POST", body: JSON.stringify({ name }) });
export const acceptTrade = (id: string) => fetchApi<{ success: boolean }>("/trades/accept", { method: "POST", body: JSON.stringify({ id }) });
export const rejectTrade = (id: string) => fetchApi<{ success: boolean }>("/trades/reject", { method: "POST", body: JSON.stringify({ id }) });

// PUT endpoints
export const setAutonomyConfig = (config: AutonomyConfig) => fetchApi<AutonomyConfig>("/autonomy-config", { method: "PUT", body: JSON.stringify(config) });

// SSE Chat
export function postChat(message: string, onChunk: (text: string) => void, onToolCall?: (tool: string) => void): AbortController {
  const controller = new AbortController();
  fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
    signal: controller.signal,
  }).then(async (res) => {
    const reader = res.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") return;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "text") onChunk(parsed.content);
            if (parsed.type === "tool_call" && onToolCall) onToolCall(parsed.name);
          } catch {
            onChunk(data);
          }
        }
      }
    }
  });
  return controller;
}
