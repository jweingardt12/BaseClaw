import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { apiGet, apiPost, toolError } from "../api/python-client.js";
import { header, actionList, issueList, waiverPairList, compactSection } from "../api/format-text.js";
import {
  str,
  type MorningBriefingResponse,
  type MatchupDetailResponse,
  type MatchupStrategyResponse,
  type WhatsNewResponse,
  type LeagueLandscapeResponse,
  type SeasonPaceResponse,
  type TradeFinderResponse,
  type RosterHealthResponse,
  type WaiverRecommendationsResponse,
  type CategoryCheckResponse,
  type TradeAnalysisResponse,
  type InjuryReportResponse,
  type LineupOptimizeResponse,
} from "../api/types.js";
import { SEASON_URI } from "./season-tools.js";

export function registerWorkflowTools(server: McpServer, writesEnabled: boolean = false) {

  // yahoo_morning_briefing
  registerAppTool(
    server,
    "yahoo_morning_briefing",
    {
      description: "Comprehensive daily briefing: injuries, lineup issues, live matchup scores, category strategy, league activity, opponent moves, and top waiver targets — all in one call with priority-ranked action items. Replaces 7+ individual tool calls.",
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: SEASON_URI } },
    },
    async () => {
      try {
        const data = await apiGet<MorningBriefingResponse>("/api/workflow/morning-briefing");

        const matchup: Partial<MatchupDetailResponse> = data.matchup || {};
        const strategy: Partial<MatchupStrategyResponse> = data.strategy || {};
        const whatsNew: Partial<WhatsNewResponse> = data.whats_new || {};
        const score = matchup.score || { wins: 0, losses: 0, ties: 0 };
        const strat = strategy.strategy || { target: [], protect: [], concede: [], lock: [] };

        const issueCount = (data.action_items || []).filter((a) => a.priority <= 2).length;
        const opCount = (data.action_items || []).filter((a) => a.priority === 3).length;

        const lines: string[] = [];
        lines.push(header("MORNING_BRIEFING", "Week " + str(matchup.week || "?") + " | " + issueCount + " issue(s) | " + opCount + " opportunity(s)"));

        // Live matchup
        lines.push("MATCHUP: vs " + str(matchup.opponent || "?") + " | " + score.wins + "-" + score.losses + "-" + score.ties);

        // Strategy summary
        if (strat.target.length > 0) lines.push("TARGET: " + strat.target.join(", "));
        if (strat.protect.length > 0) lines.push("PROTECT: " + strat.protect.join(", "));
        if (strat.concede.length > 0) lines.push("CONCEDE: " + strat.concede.join(", "));

        // Action items
        lines.push("");
        lines.push(actionList(data.action_items || []));

        // Opponent activity
        const oppTx = strategy.opp_transactions || [];
        if (oppTx.length > 0) {
          lines.push("");
          lines.push("OPPONENT MOVES: " + oppTx.map((t) => str(t.type) + " " + str(t.player)).join(", "));
        }

        // League activity digest
        const activity = (whatsNew.league_activity || []).slice(0, 3);
        if (activity.length > 0) {
          lines.push(compactSection("LEAGUE", activity.map((a) => str(a.type) + " " + str(a.player) + " -> " + str(a.team))));
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: { type: "morning-briefing", ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );

  // yahoo_league_landscape
  registerAppTool(
    server,
    "yahoo_league_landscape",
    {
      description: "Complete league intelligence: standings, playoff projections, roster strength, manager activity, recent transactions, this week's matchup results across the league, and trade opportunities. Use weekly for strategic planning.",
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: SEASON_URI } },
    },
    async () => {
      try {
        const data = await apiGet<LeagueLandscapeResponse>("/api/workflow/league-landscape");

        const standings = data.standings?.standings || [];
        const pace: Partial<SeasonPaceResponse> = data.pace || {};
        const pulse = data.league_pulse?.teams || [];
        const tradeFinder: Partial<TradeFinderResponse> = data.trade_finder || {};
        const scoreboard = data.scoreboard?.matchups || [];

        // Find user's team in pace data
        const myTeam = (pace.teams || []).find((t) => t.is_my_team);

        const lines: string[] = [];

        // Header with your position
        if (myTeam) {
          lines.push(header("LEAGUE_LANDSCAPE", "You: " + myTeam.rank + getSuffix(myTeam.rank) + " | Playoff: " + str(myTeam.playoff_status) + " (magic# " + str(myTeam.magic_number) + ")"));
        } else {
          lines.push(header("LEAGUE_LANDSCAPE", "League overview"));
        }

        // Standings summary (top 5 + you)
        lines.push("STANDINGS:");
        for (const s of standings.slice(0, 5)) {
          const you = myTeam && str(s.name) === str(myTeam.name) ? " <-- YOU" : "";
          lines.push("  " + String(s.rank).padStart(2) + ". " + str(s.name).padEnd(28) + " " + s.wins + "-" + s.losses + you);
        }

        // Active vs dormant managers
        const active = pulse.filter((t) => t.total >= 5).slice(0, 3);
        const dormant = pulse.filter((t) => t.total <= 1);
        if (active.length > 0) {
          lines.push(compactSection("ACTIVE", active.map((t) => str(t.name) + " (" + t.total + " moves)")));
        }
        if (dormant.length > 0) {
          lines.push(compactSection("DORMANT", dormant.map((t) => str(t.name))));
        }

        // This week's scoreboard
        if (scoreboard.length > 0) {
          lines.push("THIS WEEK:");
          for (const m of scoreboard.slice(0, 5)) {
            lines.push("  " + str(m.team1).padEnd(20) + " vs " + str(m.team2).padEnd(20) + " " + str(m.status));
          }
        }

        // Trade opportunities
        const partners = (tradeFinder.partners || []).slice(0, 2);
        if (partners.length > 0) {
          lines.push("TRADE TARGETS:");
          for (const p of partners) {
            lines.push("  " + str(p.team_name) + " — complementary: " + (p.complementary_categories || []).join(", "));
          }
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: { type: "league-landscape", ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );

  // yahoo_roster_health_check
  registerAppTool(
    server,
    "yahoo_roster_health_check",
    {
      description: "Audit roster for problems: injured players in active slots, healthy players stuck on IL, bust candidates, off-day starters. Returns issues ranked by severity (critical/warning/info) with concrete fix recommendations.",
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: SEASON_URI } },
    },
    async () => {
      try {
        const data = await apiGet<RosterHealthResponse>("/api/workflow/roster-health");

        const critical = (data.issues || []).filter((i) => i.severity === "critical").length;
        const warning = (data.issues || []).filter((i) => i.severity === "warning").length;
        const info = (data.issues || []).filter((i) => i.severity === "info").length;

        const lines: string[] = [];
        lines.push(header("ROSTER_HEALTH", critical + " critical | " + warning + " warning | " + info + " info"));
        lines.push("");
        lines.push(issueList(data.issues || []));

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: { type: "roster-health", ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );

  // yahoo_waiver_recommendations
  registerAppTool(
    server,
    "yahoo_waiver_recommendations",
    {
      description: "Find the best waiver pickups for your team's weak categories, paired with recommended drops. Returns ranked add/drop pairs with projected category impact. Combines category analysis, waiver scoring, and simulation into one call.",
      inputSchema: { count: z.number().describe("Number of recommendations per position type").default(5) },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: SEASON_URI } },
    },
    async ({ count }) => {
      try {
        const data = await apiGet<WaiverRecommendationsResponse>("/api/workflow/waiver-recommendations", { count: String(count) });

        const catCheck: Partial<CategoryCheckResponse> = data.category_check || {};
        const weakest = catCheck.weakest || [];

        const lines: string[] = [];
        lines.push(header("WAIVER_RECOMMENDATIONS", (data.pairs || []).length + " options | weak: " + weakest.join(", ")));
        lines.push("");
        lines.push(waiverPairList(data.pairs || []));

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: { type: "waiver-recommendations", ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );

  // yahoo_auto_lineup (write-gated)
  if (writesEnabled) {
  registerAppTool(
    server,
    "yahoo_auto_lineup",
    {
      description: "Automatically optimize today's lineup: bench off-day players, start active bench players, flag injured starters. SAFE for autonomous execution — idempotent, only moves players between active/bench slots. Returns summary of changes made.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      _meta: { ui: { resourceUri: SEASON_URI } },
    },
    async () => {
      try {
        const [injury, lineup] = await Promise.all([
          apiGet<InjuryReportResponse>("/api/injury-report"),
          apiGet<LineupOptimizeResponse>("/api/lineup-optimize", { apply: "true" }),
        ]);

        const lines: string[] = [];
        lines.push(header("AUTO_LINEUP", lineup.applied ? "changes applied" : "preview only"));

        // Report injuries found
        if ((injury.injured_active || []).length > 0) {
          lines.push("INJURED IN LINEUP (" + injury.injured_active.length + "):");
          for (const p of injury.injured_active) {
            lines.push("  " + str(p.name) + " [" + str(p.status) + "] - needs manual IL move");
          }
        }

        // Report swaps made
        if ((lineup.suggested_swaps || []).length > 0) {
          lines.push("SWAPS " + (lineup.applied ? "APPLIED" : "SUGGESTED") + ":");
          for (const s of lineup.suggested_swaps) {
            lines.push("  Bench " + s.bench_player + " -> Start " + s.start_player + " (" + s.position + ")");
          }
        } else {
          lines.push("Lineup already optimal — no swaps needed.");
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: { type: "auto-lineup", injury, lineup },
        };
      } catch (e) { return toolError(e); }
    },
  );
  } // end writesEnabled

  // yahoo_trade_analysis
  registerAppTool(
    server,
    "yahoo_trade_analysis",
    {
      description: "Evaluate a trade by player names (not IDs). Resolves names, evaluates z-score value, and checks Statcast/intel data. Returns unified recommendation with reasoning.",
      inputSchema: {
        give_names: z.array(z.string()).describe("Player names you would give up"),
        get_names: z.array(z.string()).describe("Player names you would receive"),
      },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: SEASON_URI } },
    },
    async ({ give_names, get_names }) => {
      try {
        const data = await apiPost<TradeAnalysisResponse>("/api/workflow/trade-analysis", {
          give_names,
          get_names,
        });

        const lines: string[] = [];
        lines.push(header("TRADE_ANALYSIS", "Give " + give_names.join(", ") + " | Get " + get_names.join(", ")));

        // Player values
        lines.push("");
        lines.push("GIVING:");
        for (const p of data.give_players || []) {
          const total = Number(p.z_scores?.Final ?? 0);
          lines.push("  " + str(p.name).padEnd(25) + " z-total=" + total.toFixed(2));
        }
        lines.push("GETTING:");
        for (const p of data.get_players || []) {
          const total = Number(p.z_scores?.Final ?? 0);
          lines.push("  " + str(p.name).padEnd(25) + " z-total=" + total.toFixed(2));
        }

        // Trade eval if available
        const te = data.trade_eval;
        if (te && !("_error" in te)) {
          lines.push("");
          lines.push("EVALUATION:");
          lines.push("  Give value: " + str(te.give_value) + " | Get value: " + str(te.get_value) + " | Net: " + str(te.net_value));
          lines.push("  Grade: " + str(te.grade));
        }

        // Intel summary
        const intel = data.intel || {};
        const intelEntries = Object.entries(intel).filter(([, v]) => v && !("_error" in v));
        if (intelEntries.length > 0) {
          lines.push("");
          lines.push("INTEL:");
          for (const [name, report] of intelEntries) {
            const sc = report.statcast || {};
            if (sc.quality_tier) {
              lines.push("  " + str(name).padEnd(25) + " tier=" + str(sc.quality_tier));
            }
          }
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: { type: "trade-analysis", ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );
}

function getSuffix(rank: number): string {
  const mod100 = rank % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  const mod10 = rank % 10;
  if (mod10 === 1) return "st";
  if (mod10 === 2) return "nd";
  if (mod10 === 3) return "rd";
  return "th";
}
