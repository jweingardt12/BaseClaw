import type {
  Achievement,
  BatTrackingBreakout,
  BreakoutCandidate,
  BustCandidate,
  CategoryCheck,
  CategoryTrend,
  CloserMonitorEntry,
  LeagueContext,
  LeagueHistoryEntry,
  LeagueHistorySeason,
  LeagueIntelTeam,
  LeaguePulseTeam,
  Matchup,
  MLBDivision,
  MLBGame,
  MLBInjury,
  OwnershipTrendEntry,
  ParkFactor,
  PastStandingEntry,
  PlayerIntelResponse,
  PlayerTierResponse,
  PlayoffPlanner,
  PlayerListResponse,
  PositionalRanksResponse,
  PowerRanking,
  ProbablePitcher,
  ProjectionDisagreement,
  RankedPlayer,
  RecordBook,
  RegressionCandidatesResponse,
  RivalHistory,
  RosterStatsPlayer,
  ScheduleAnalysis,
  Scoreboard,
  SeasonPace,
  Standing,
  Transaction,
  TransactionTrends,
  TrendingPlayer,
  WeatherGame,
  ZscoreShiftsResponse,
} from "@/types/fantasy";

const API_BASE = "/api";

const apiCache = new Map<string, { data: unknown; ts: number }>();
const DEFAULT_TTL = 5 * 60 * 1000;

const TTL_OVERRIDES: Record<string, number> = {
  "/transactions": 2 * 60 * 1000,
  "/scoreboard": 2 * 60 * 1000,
  "/matchup-detail": 2 * 60 * 1000,
  "/league-intel": 10 * 60 * 1000,
  "/positional-ranks": 10 * 60 * 1000,
  "/rankings": 10 * 60 * 1000,
  "/regression-candidates": 10 * 60 * 1000,
  "/intel/breakouts": 10 * 60 * 1000,
  "/intel/busts": 10 * 60 * 1000,
  "/intel/bat-tracking-breakouts": 10 * 60 * 1000,
  "/intel/trending": 10 * 60 * 1000,
  "/mlb/schedule": 15 * 60 * 1000,
  "/mlb/weather": 15 * 60 * 1000,
  "/probable-pitchers": 15 * 60 * 1000,
  "/park-factors": 30 * 60 * 1000,
  "/mlb/standings": 30 * 60 * 1000,
  "/record-book": 60 * 60 * 1000,
  "/league-history": 60 * 60 * 1000,
};

function getCacheTTL(path: string): number {
  const basePath = path.split("?")[0];
  return TTL_OVERRIDES[basePath] ?? DEFAULT_TTL;
}

export function getCachedData<T>(path: string): T | undefined {
  const cached = apiCache.get(path);
  const ttl = getCacheTTL(path);
  if (cached && Date.now() - cached.ts < ttl) {
    return cached.data as T;
  }
  return undefined;
}

export function clearApiCache(path?: string) {
  if (path) {
    for (const key of apiCache.keys()) {
      if (key.startsWith(path)) apiCache.delete(key);
    }
  } else {
    apiCache.clear();
  }
}

async function fetchApi<T>(path: string): Promise<T> {
  const cached = apiCache.get(path);
  const ttl = getCacheTTL(path);
  if (cached && Date.now() - cached.ts < ttl) {
    return cached.data as T;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API error: ${res.status}${body ? " — " + body : ""}`);
  }
  const data: T = await res.json();
  apiCache.set(path, { data, ts: Date.now() });
  // Evict stale entries if cache grows large
  if (apiCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of apiCache) {
      if (now - v.ts > getCacheTTL(k)) apiCache.delete(k);
    }
  }
  return data;
}

// --- Standings ---

interface StandingRaw {
  name?: string;
  team?: string;
  rank?: number;
  wins?: number;
  losses?: number;
  ties?: number;
  gb?: number;
  playoffPct?: number;
  categories?: Record<string, { value: number; rank: number }>;
  powerRank?: number;
  trend?: { week: number; wins: number; losses: number }[];
  team_logo?: string;
  manager_image?: string;
}

function normalizeStandings(raw: StandingRaw[]): Standing[] {
  return raw.map((s) => ({
    team: s.name || s.team || "",
    rank: s.rank ?? 0,
    wins: s.wins ?? 0,
    losses: s.losses ?? 0,
    ties: s.ties ?? 0,
    gb: s.gb ?? 0,
    playoffPct: s.playoffPct ?? 0,
    categories: s.categories ?? {},
    powerRank: s.powerRank ?? 0,
    trend: s.trend ?? [],
    team_logo: s.team_logo,
    manager_image: s.manager_image,
  }));
}

export interface DetailedStanding {
  name: string;
  rank: number;
  wins: number;
  losses: number;
  team_key?: string;
  team_logo?: string;
  manager_image?: string;
  stats: Record<string, number>;
}

export interface StandingsDetailedResponse {
  standings: DetailedStanding[];
  categories: string[];
}

export const getStandingsDetailed = () =>
  fetchApi<StandingsDetailedResponse>("/standings-detailed");

export const getStandings = (): Promise<Standing[]> =>
  fetchApi<{ standings?: StandingRaw[] } | StandingRaw[]>("/standings").then((r) => {
    const raw = Array.isArray(r) ? r : r.standings ?? [];
    return normalizeStandings(raw);
  });

// --- Matchups ---

export const getScoreboard = () => fetchApi<Scoreboard>("/scoreboard");

export const getMatchups = (week?: string) =>
  fetchApi<{ matchups: { team1: string; team2: string; status: string }[] }>(
    "/matchups" + (week ? "?week=" + encodeURIComponent(week) : ""),
  );

export const getMatchupDetail = () => fetchApi<Matchup>("/matchup-detail");

// --- Power Rankings ---

interface PowerRankingRaw {
  name?: string;
  team?: string;
  rank?: number;
  team_logo?: string;
  total_score?: number;
  score?: number;
  record?: string;
  [key: string]: unknown;
}

function normalizePowerRankings(raw: PowerRankingRaw[]): PowerRanking[] {
  return raw.map((r) => ({
    ...r,
    team: r.name || r.team || "",
    rank: r.rank ?? 0,
    team_logo: r.team_logo,
    score: r.total_score ?? r.score,
    record: r.record,
  }));
}

export const getPowerRankings = (): Promise<PowerRanking[]> =>
  fetchApi<{ rankings?: PowerRankingRaw[] } | PowerRankingRaw[]>("/power-rankings").then((r) => {
    const raw = Array.isArray(r) ? r : r.rankings ?? [];
    return normalizePowerRankings(raw);
  });

// --- Players / Stats ---

export const getPlayerList = (posType = "B", count = 50, status = "A") =>
  fetchApi<PlayerListResponse>(
    `/player-list?pos_type=${encodeURIComponent(posType)}&count=${count}&status=${encodeURIComponent(status)}`,
  );

export const getCategoryCheck = (): Promise<CategoryCheck[]> =>
  fetchApi<{ categories: CategoryCheck[] }>("/category-check").then((r) => r.categories ?? []);

export const getCategoryTrends = (): Promise<CategoryTrend[]> =>
  fetchApi<{ trends?: CategoryTrend[] } | CategoryTrend[]>("/category-trends").then((r) =>
    Array.isArray(r) ? r : r.trends ?? [],
  );

// --- Positional Ranks ---

export const getPositionalRanks = () => fetchApi<PositionalRanksResponse>("/positional-ranks");

// --- Transactions ---

export const getTransactions = (type?: string, count?: string): Promise<Transaction[]> => {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (count) params.set("count", count);
  const qs = params.toString();
  return fetchApi<{ transactions: Transaction[] }>("/transactions" + (qs ? "?" + qs : "")).then(
    (r) => r.transactions ?? [],
  );
};

export const getTransactionTrends = () => fetchApi<TransactionTrends>("/transaction-trends");

// --- Season / Playoff ---

export const getSeasonPace = () => fetchApi<SeasonPace>("/season-pace");

export const getPlayoffPlanner = () => fetchApi<PlayoffPlanner>("/playoff-planner");

export const getScheduleAnalysis = (team?: string) =>
  team
    ? fetchApi<ScheduleAnalysis>(`/schedule-analysis?team=${encodeURIComponent(team)}`)
    : Promise.resolve(null);

// --- League ---

export const getLeagueContext = (): Promise<LeagueContext> =>
  Promise.all([
    fetchApi<LeagueContext>("/league-context"),
    fetchApi<{ team_name?: string; name?: string; current_week?: number }>("/info").catch(
      () => ({}) as { team_name?: string; name?: string; current_week?: number },
    ),
  ]).then(([ctx, info]) => ({
    ...ctx,
    team_name: ctx.team_name || info.team_name,
    league_name: ctx.league_name || info.name,
    current_week: ctx.current_week ?? info.current_week,
  }));

// --- League History (raw seasons) ---

export const getLeagueHistoryRaw = () =>
  fetchApi<{ seasons: LeagueHistorySeason[] }>("/league-history").then((r) => r.seasons ?? []);

export const getLeagueHistory = (): Promise<LeagueHistoryEntry[]> =>
  fetchApi<{ seasons: { year: number; your_record?: string; your_finish?: string; champion?: string; details?: Record<string, unknown> }[] }>(
    "/league-history",
  ).then((r) =>
    (r.seasons ?? []).map((s) => {
      const parts = (s.your_record || "").split("-").map(Number);
      const rank = parseInt(String(s.your_finish || "")) || 0;
      return {
        season: s.year,
        wins: parts[0] || 0,
        losses: parts[1] || 0,
        rank,
        champion: s.champion || "",
        details: s.details || {},
      };
    }),
  );

// --- Record Book ---

export const getRecordBook = () => fetchApi<RecordBook>("/record-book");

// --- Past Standings ---

export const getPastStandings = (year: number) =>
  fetchApi<{ standings: PastStandingEntry[] }>(`/past-standings?year=${year}`).then((r) => r.standings ?? []);

// --- Past Draft ---

export const getPastDraft = (year: number, count = 300) =>
  fetchApi<Record<string, unknown>>(`/past-draft?year=${year}&count=${count}`);

// --- Past Trades ---

export const getPastTrades = (year: number) =>
  fetchApi<Record<string, unknown>>(`/past-trades?year=${year}`);

// --- Achievements ---

export const getAchievements = () =>
  fetchApi<{ achievements: Achievement[] }>("/achievements").then((r) => r.achievements ?? []);

// --- Rival History ---

export const getRivalHistory = (opponent?: string) =>
  fetchApi<RivalHistory>("/rival-history" + (opponent ? "?opponent=" + encodeURIComponent(opponent) : ""));

// --- League Pulse ---

export const getLeaguePulse = () =>
  fetchApi<{ teams: LeaguePulseTeam[] }>("/league-pulse").then((r) => r.teams ?? []);

// --- League Intel ---

interface LeagueIntelResponse {
  rankings: LeagueIntelTeam[];
  category_leaderboards: Record<string, unknown>[];
  h2h_matrix: Record<string, unknown>[];
  [key: string]: unknown;
}

export const getLeagueIntel = () =>
  fetchApi<LeagueIntelResponse>("/league-intel");

// --- Roster Stats ---

export const getRosterStats = () =>
  fetchApi<{ players: RosterStatsPlayer[]; period?: string }>("/roster-stats");

// --- Ownership Trends ---

export const getOwnershipTrends = (): Promise<OwnershipTrendEntry[]> =>
  fetchApi<{ most_added?: { name: string; percent_owned: number; delta: string; [k: string]: unknown }[] }>("/transaction-trends").then((r) =>
    (r.most_added ?? []).map((p) => ({
      name: p.name,
      percent_owned: p.percent_owned,
      change: parseFloat(p.delta) || 0,
    })),
  );

// --- Closer Monitor ---

export const getCloserMonitor = (): Promise<CloserMonitorEntry[]> =>
  fetchApi<{ closers?: CloserMonitorEntry[] } | CloserMonitorEntry[]>("/closer-monitor").then((r) =>
    Array.isArray(r) ? r : r.closers ?? [],
  );

// --- Breakout Candidates ---

export const getBreakoutCandidates = () =>
  fetchApi<{ candidates: BreakoutCandidate[] }>("/intel/breakouts").then((r) => r.candidates ?? []);

// --- Z-Score Shifts ---

export const getZscoreShifts = (count = 25) =>
  fetchApi<ZscoreShiftsResponse>(`/zscore-shifts?count=${count}`);

// --- Regression Candidates ---

export const getRegressionCandidates = () =>
  fetchApi<RegressionCandidatesResponse>("/regression-candidates");

// --- Player Intel ---

export const getPlayerIntel = (player: string) =>
  fetchApi<PlayerIntelResponse>(`/player-intel?player=${encodeURIComponent(player)}`);

// --- Player Tier ---

export const getPlayerTier = (name: string) =>
  fetchApi<PlayerTierResponse>(`/player-tier?name=${encodeURIComponent(name)}`);

// --- Trash Talk ---

export const getTrashTalk = (intensity = "competitive") =>
  fetchApi<Record<string, unknown>>(`/trash-talk?intensity=${encodeURIComponent(intensity)}`);

// --- Rankings (all players) ---

export const getRankings = (posType = "B", count = 200) =>
  fetchApi<{ players: RankedPlayer[] }>(`/rankings?pos_type=${encodeURIComponent(posType)}&count=${count}`);

// --- MLB Data ---

export const getMLBStandings = () =>
  fetchApi<{ divisions: MLBDivision[] }>("/mlb/standings");

export const getMLBSchedule = () =>
  fetchApi<{ date: string; games: MLBGame[] }>("/mlb/schedule");

export const getProbablePitchers = () =>
  fetchApi<{ pitchers: ProbablePitcher[] }>("/probable-pitchers");

export const getMLBInjuries = () =>
  fetchApi<{ injuries: MLBInjury[] }>("/mlb/injuries");

export const getMLBWeather = () =>
  fetchApi<{ date: string; games: WeatherGame[]; dome_count: number; outdoor_count: number }>("/mlb/weather");

export const getParkFactors = () =>
  fetchApi<{ park_factors: ParkFactor[] }>("/park-factors");

// --- Enhanced Intel ---

export const getBustCandidates = () =>
  fetchApi<{ candidates: BustCandidate[] }>("/intel/busts").then((r) => r.candidates ?? []);

export const getBatTrackingBreakouts = () =>
  fetchApi<{ breakouts: BatTrackingBreakout[] }>("/intel/bat-tracking-breakouts").then((r) => r.breakouts ?? []);

export const getTrendingPlayers = () =>
  fetchApi<{ trending: TrendingPlayer[] }>("/intel/trending").then((r) => r.trending ?? []);

export const getProjectionDisagreements = () =>
  fetchApi<{ disagreements: ProjectionDisagreement[] }>("/projection-disagreements").then((r) => r.disagreements ?? []);
