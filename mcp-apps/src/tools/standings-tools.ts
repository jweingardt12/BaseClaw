import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { apiGet, toolError } from "../api/python-client.js";
import {
  generateStandingsInsight,
  generateSeasonPaceInsight,
  generatePowerRankInsight,
} from "../insights.js";
import {
  str,
  type StandingsResponse,
  type MatchupsResponse,
  type ScoreboardResponse,
  type MatchupDetailResponse,
  type LeagueInfoResponse,
  type TransactionsResponse,
  type StatCategoriesResponse,
  type TransactionTrendsResponse,
  type LeaguePulseResponse,
  type PowerRankingsResponse,
  type SeasonPaceResponse,
} from "../api/types.js";

const STANDINGS_URI = "ui://fbb-mcp/standings.html";

export function registerStandingsTools(server: McpServer, distDir: string) {
  registerAppResource(
    server,
    "Standings View",
    STANDINGS_URI,
    {
      description: "League standings, matchups, and scoreboard",
      _meta: {
        ui: {
          csp: {
            resourceDomains: [
              "img.mlbstatic.com",
              "www.mlbstatic.com",
              "s.yimg.com",
              "securea.mlb.com",
            ],
          },
          permissions: { clipboardWrite: {} },
          prefersBorder: true,
        },
      },
    },
    async () => ({
      contents: [{
        uri: STANDINGS_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: await fs.readFile(path.join(distDir, "standings.html"), "utf-8"),
      }],
    }),
  );

  // yahoo_standings
  registerAppTool(
    server,
    "yahoo_standings",
    {
      description: "Show league standings with win-loss records",
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: STANDINGS_URI } },
    },
    async () => {
      try {
        const data = await apiGet<StandingsResponse>("/api/standings");
        const text = "League Standings:\n" + data.standings.map((s) =>
          "  " + String(s.rank).padStart(2) + ". " + str(s.name).padEnd(30) + " " + s.wins + "-" + s.losses
          + (s.points_for ? " (" + s.points_for + " pts)" : "")
        ).join("\n");
        const ai_recommendation = generateStandingsInsight(data);
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { type: "standings", ai_recommendation, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );

  // yahoo_matchups
  registerAppTool(
    server,
    "yahoo_matchups",
    {
      description: "Show weekly H2H matchup pairings. Leave week empty for current week.",
      inputSchema: { week: z.string().describe("Week number, empty for current week").default("") },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: STANDINGS_URI } },
    },
    async ({ week }) => {
      try {
        const params: Record<string, string> = {};
        if (week) params.week = week;
        const data = await apiGet<MatchupsResponse>("/api/matchups", params);
        const weekLabel = week || "current";
        const text = "Matchups (week " + weekLabel + "):\n" + data.matchups.map((m) =>
          "  " + str(m.team1).padEnd(28) + " vs  " + str(m.team2)
          + (m.status ? "  (" + m.status + ")" : "")
        ).join("\n");
        var ai_recommendation: string | null = data.matchups.length + " matchups for week " + weekLabel + ".";
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { type: "matchups", ai_recommendation, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );

  // yahoo_scoreboard
  registerAppTool(
    server,
    "yahoo_scoreboard",
    {
      description: "Show live scoring overview for the current week",
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: STANDINGS_URI } },
    },
    async () => {
      try {
        const data = await apiGet<ScoreboardResponse>("/api/scoreboard");
        const text = "Scoreboard - Week " + data.week + ":\n" + data.matchups.map((m) =>
          "  " + str(m.team1).padEnd(28) + " vs  " + str(m.team2).padEnd(28) + str(m.status)
        ).join("\n");
        var ai_recommendation: string | null = "Live scoreboard for week " + data.week + ". " + data.matchups.length + " matchups in progress.";
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { type: "scoreboard", ai_recommendation, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );

  // yahoo_my_matchup
  registerAppTool(
    server,
    "yahoo_my_matchup",
    {
      description: "Show your detailed H2H matchup with per-category comparison for the current week",
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: STANDINGS_URI } },
    },
    async () => {
      try {
        const data = await apiGet<MatchupDetailResponse>("/api/matchup-detail");
        const score = data.score;
        const text = "Week " + data.week + " Matchup: " + data.my_team + " vs " + data.opponent + "\n"
          + "Score: " + score.wins + "-" + score.losses + "-" + score.ties + "\n"
          + (data.categories || []).map((c) =>
            "  " + (c.result === "win" ? "W" : c.result === "loss" ? "L" : "T") + " " + str(c.name).padEnd(10) + " " + str(c.my_value).padStart(8) + " vs " + str(c.opp_value).padStart(8)
          ).join("\n");
        var result = score.wins > score.losses ? "Winning" : score.wins < score.losses ? "Losing" : "Tied";
        var ai_recommendation = result + " " + score.wins + "-" + score.losses + (score.ties > 0 ? "-" + score.ties : "") + " vs " + data.opponent + ".";
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { type: "matchup-detail", ai_recommendation, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );

  // yahoo_info
  registerAppTool(
    server,
    "yahoo_info",
    {
      description: "Show league settings and team info",
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: STANDINGS_URI } },
    },
    async () => {
      try {
        const data = await apiGet<LeagueInfoResponse>("/api/info");
        const text = "League Info:\n"
          + "  Name: " + data.name + "\n"
          + "  Draft Status: " + data.draft_status + "\n"
          + "  Season: " + data.season + "\n"
          + "  Start: " + data.start_date + "\n"
          + "  End: " + data.end_date + "\n"
          + "  Current Week: " + data.current_week + "\n"
          + "  Teams: " + data.num_teams + "\n"
          + "  Playoff Teams: " + data.playoff_teams + "\n"
          + "  Max Weekly Adds: " + data.max_weekly_adds + "\n"
          + "  Your Team: " + data.team_name + " (" + data.team_id + ")";
        var ai_recommendation: string | null = null;
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { type: "info", ai_recommendation, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );

  // yahoo_transactions
  registerAppTool(
    server,
    "yahoo_transactions",
    {
      description: "Show recent league transactions. trans_type: add, drop, trade, or empty for all",
      inputSchema: { trans_type: z.string().describe("Transaction type: add, drop, trade, or empty for all").default(""), count: z.number().describe("Number of transactions to return").default(25) },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: STANDINGS_URI } },
    },
    async ({ trans_type, count }) => {
      try {
        const params: Record<string, string> = {};
        if (trans_type) params.type = trans_type;
        params.count = String(count);
        const data = await apiGet<TransactionsResponse>("/api/transactions", params);
        const label = trans_type || "all";
        const text = "Recent transactions (" + label + "):\n" + data.transactions.map((t) =>
          "  " + str(t.type).padEnd(8) + " " + str(t.player).padEnd(25) + (t.team ? " -> " + t.team : "")
        ).join("\n");
        var ai_recommendation: string | null = data.transactions.length + " recent transaction" + (data.transactions.length === 1 ? "" : "s") + ". Monitor league activity for waiver targets.";
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { type: "transactions", ai_recommendation, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );

  // yahoo_stat_categories
  registerAppTool(
    server,
    "yahoo_stat_categories",
    {
      description: "Show league scoring categories",
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: STANDINGS_URI } },
    },
    async () => {
      try {
        const data = await apiGet<StatCategoriesResponse>("/api/stat-categories");
        const text = "Stat Categories:\n" + data.categories.map((c) =>
          "  " + c.name + (c.position_type ? " (" + c.position_type + ")" : "")
        ).join("\n");
        var batting = (data.categories || []).filter(function (c) { return c.position_type === "B"; });
        var pitching = (data.categories || []).filter(function (c) { return c.position_type === "P"; });
        var ai_recommendation: string | null = batting.length + " batting and " + pitching.length + " pitching categories in this league.";
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { type: "stat-categories", ai_recommendation, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );

  // yahoo_transaction_trends
  registerAppTool(
    server,
    "yahoo_transaction_trends",
    {
      description: "Most added and most dropped players across all Yahoo Fantasy leagues",
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: STANDINGS_URI } },
    },
    async () => {
      try {
        const data = await apiGet<TransactionTrendsResponse>("/api/transaction-trends");
        const addedLines = (data.most_added || []).slice(0, 10).map((p, i) =>
          "  " + String(i + 1).padStart(2) + ". " + str(p.name).padEnd(25) + " " + str(p.team).padEnd(4)
          + " " + str(p.percent_owned) + "% (" + str(p.delta) + ")"
        );
        const droppedLines = (data.most_dropped || []).slice(0, 10).map((p, i) =>
          "  " + String(i + 1).padStart(2) + ". " + str(p.name).padEnd(25) + " " + str(p.team).padEnd(4)
          + " " + str(p.percent_owned) + "% (" + str(p.delta) + ")"
        );
        const text = "Most Added:\n" + addedLines.join("\n") + "\n\nMost Dropped:\n" + droppedLines.join("\n");
        var topAdded = (data.most_added || [])[0];
        var ai_recommendation: string | null = topAdded
          ? "Hottest pickup: " + topAdded.name + " (" + topAdded.percent_owned + "% owned, " + topAdded.delta + "). Check if available in your league."
          : null;
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { type: "transaction-trends", ai_recommendation, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );

  // yahoo_league_pulse
  registerAppTool(
    server,
    "yahoo_league_pulse",
    {
      description: "Show league activity - moves and trades per team, sorted by most active",
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: STANDINGS_URI } },
    },
    async () => {
      try {
        const data = await apiGet<LeaguePulseResponse>("/api/league-pulse");
        const lines = [
          "League Activity Pulse:",
          "  " + "Team".padEnd(30) + "Moves".padStart(6) + "Trades".padStart(7) + "Total".padStart(6),
          "  " + "-".repeat(49),
        ];
        for (const t of data.teams) {
          lines.push("  " + str(t.name).padEnd(30) + String(t.moves).padStart(6)
            + String(t.trades).padStart(7) + String(t.total).padStart(6));
        }
        var mostActive = (data.teams || [])[0];
        var ai_recommendation: string | null = mostActive
          ? "Most active team: " + mostActive.name + " with " + mostActive.total + " total moves. Active managers often gain an edge."
          : null;
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: { type: "league-pulse", ai_recommendation, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );

  // yahoo_power_rankings
  registerAppTool(
    server,
    "yahoo_power_rankings",
    {
      description: "Rank all league teams by estimated roster strength (based on aggregate player ownership %)",
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: STANDINGS_URI } },
    },
    async () => {
      try {
        const data = await apiGet<PowerRankingsResponse>("/api/power-rankings");
        const lines = [
          "Power Rankings:",
          "  " + "#".padStart(3) + "  " + "Team".padEnd(30) + "Avg Own%".padStart(9) + "  H/P",
          "  " + "-".repeat(52),
        ];
        for (const r of data.rankings) {
          const marker = r.is_my_team ? " <-- YOU" : "";
          lines.push("  " + String(r.rank).padStart(3) + "  " + str(r.name).padEnd(30)
            + String(r.avg_owned_pct).padStart(8) + "%  " + r.hitting_count + "/" + r.pitching_count + marker);
        }
        const ai_recommendation = generatePowerRankInsight(data);
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: { type: "power-rankings", ai_recommendation, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );

  // yahoo_season_pace
  registerAppTool(
    server,
    "yahoo_season_pace",
    {
      description: "Project season pace, playoff probability, and magic number for all teams",
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: STANDINGS_URI } },
    },
    async () => {
      try {
        const data = await apiGet<SeasonPaceResponse>("/api/season-pace");
        const lines = [
          "Season Pace (Week " + data.current_week + "/" + data.end_week + ", " + data.playoff_teams + " playoff spots):",
          "  " + "#".padStart(3) + "  " + "Team".padEnd(28) + "Record".padStart(8) + "  Pace".padStart(6) + "  Magic#".padStart(8) + "  Status",
          "  " + "-".repeat(70),
        ];
        for (const t of data.teams) {
          let record = t.wins + "-" + t.losses;
          if (t.ties) record += "-" + t.ties;
          const marker = t.is_my_team ? " <-- YOU" : "";
          lines.push("  " + String(t.rank).padStart(3) + "  " + str(t.name).padEnd(28)
            + record.padStart(8) + "  " + String(t.projected_wins).padStart(5)
            + "  " + String(t.magic_number).padStart(7) + "  " + t.playoff_status + marker);
        }
        const ai_recommendation = generateSeasonPaceInsight(data);
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: { type: "season-pace", ai_recommendation, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );
}
