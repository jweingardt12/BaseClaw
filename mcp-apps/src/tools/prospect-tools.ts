import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { apiGet, toolError } from "../api/python-client.js";
import {
  str,
  type ProspectReportResponse,
  type ProspectRankingsResponse,
  type CallupWireResponse,
  type StashAdvisorResponse,
  type ProspectCompareResponse,
  type ProspectBuzzResponse,
  type EtaTrackerResponse,
  type ProspectTradeTargetsResponse,
  type ProspectNewsResponse,
} from "../api/types.js";

export function registerProspectTools(server: McpServer) {
  // prospect_report
  registerAppTool(
    server,
    "fantasy_prospect_report",
    {
      description: "Deep prospect analysis with MiLB stats, scouting evaluation, call-up probability, and stash recommendation",
      inputSchema: { player_name: z.string().describe("Prospect name to look up") },
      annotations: { readOnlyHint: true },
      _meta: {},
    },
    async ({ player_name }) => {
      try {
        const data = await apiGet<ProspectReportResponse>("/api/prospects/report", { name: player_name });
        if (data.error) {
          return { content: [{ type: "text" as const, text: "Error: " + data.error }] };
        }
        const lines: string[] = [];
        lines.push("Prospect Report: " + str(data.name));
        lines.push("");
        if (data.age) lines.push("  Age: " + data.age);
        if (data.position) lines.push("  Position: " + data.position);
        if (data.organization) lines.push("  Organization: " + data.organization);
        if (data.current_level) lines.push("  Current Level: " + data.current_level);
        if (data.on_40_man != null) lines.push("  40-Man: " + (data.on_40_man ? "Yes" : "No"));
        if (data.fv_grade) lines.push("  FV Grade: " + data.fv_grade);
        if (data.overall_rank) lines.push("  Overall Rank: #" + data.overall_rank);
        if (data.eta) lines.push("  ETA: " + data.eta);
        if (data.milb_stats && data.milb_stats.length > 0) {
          lines.push("");
          lines.push("MiLB Stats:");
          for (const s of data.milb_stats) {
            lines.push("  " + str(s.level) + " - " + s.games + " G" +
              Object.entries(s).filter(function([k]) { return k !== "level" && k !== "games"; })
                .map(function([k, v]) { return ", " + k + ": " + v; }).join(""));
          }
        }
        if (data.evaluation) {
          const ev = data.evaluation;
          lines.push("");
          lines.push("Evaluation: " + str(ev.grade));
          lines.push("  Readiness Score: " + ev.readiness_score);
          if (ev.strengths && ev.strengths.length > 0) {
            lines.push("  Strengths: " + ev.strengths.join(", "));
          }
          if (ev.concerns && ev.concerns.length > 0) {
            lines.push("  Concerns: " + ev.concerns.join(", "));
          }
        }
        if (data.callup_probability) {
          const cp = data.callup_probability;
          lines.push("");
          lines.push("Call-Up Probability: " + cp.probability + "% (" + str(cp.classification) + ")");
          if (cp.factors && cp.factors.length > 0) {
            lines.push("  Factors: " + cp.factors.join(", "));
          }
        }
        if (data.stash_recommendation) {
          const sr = data.stash_recommendation;
          lines.push("");
          lines.push("Stash Recommendation: " + str(sr.action) + " (confidence: " + sr.confidence + ")");
          if (sr.reasons && sr.reasons.length > 0) {
            lines.push("  Reasons: " + sr.reasons.join(", "));
          }
        }
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (e) { return toolError(e); }
    },
  );

  // prospect_rankings
  registerAppTool(
    server,
    "fantasy_prospect_rankings",
    {
      description: "Top prospects ranked by composite score with call-up probabilities. Filter by position, level, or team.",
      inputSchema: {
        position: z.string().optional().describe("Filter by position (e.g. SS, OF, RHP)"),
        level: z.string().optional().describe("Filter by level (e.g. AAA, AA)"),
        team: z.string().optional().describe("Filter by MLB organization"),
        count: z.number().optional().describe("Number of prospects to return (default 25)"),
      },
      annotations: { readOnlyHint: true },
      _meta: {},
    },
    async ({ position, level, team, count }) => {
      try {
        const params: Record<string, string> = {};
        if (position) params.position = position;
        if (level) params.level = level;
        if (team) params.team = team;
        if (count) params.count = String(count);
        const data = await apiGet<ProspectRankingsResponse>("/api/prospects/rankings", params);
        const lines: string[] = [];
        lines.push("Prospect Rankings (" + data.count + " prospects):");
        if (data.filters) {
          const filterParts = Object.entries(data.filters).map(function([k, v]) { return k + "=" + v; });
          if (filterParts.length > 0) lines.push("  Filters: " + filterParts.join(", "));
        }
        lines.push("");
        lines.push("  " + "#".padEnd(5) + "Name".padEnd(22) + "Pos".padEnd(6) + "Org".padEnd(6) + "Level".padEnd(6) + "FV".padEnd(5) + "ETA".padEnd(8) + "CallUp%");
        lines.push("  " + "-".repeat(65));
        for (const p of (data.prospects || [])) {
          lines.push("  " +
            str(p.overall_rank || "-").padEnd(5) +
            str(p.name).padEnd(22) +
            str(p.position || "").padEnd(6) +
            str(p.organization || "").padEnd(6) +
            str(p.current_level || "").padEnd(6) +
            str(p.fv_grade || "").padEnd(5) +
            str(p.eta || "").padEnd(8) +
            str(p.callup_probability != null ? p.callup_probability + "%" : ""));
        }
        if ((data.prospects || []).length === 0) lines.push("  No prospects found.");
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (e) { return toolError(e); }
    },
  );

  // callup_wire
  registerAppTool(
    server,
    "fantasy_callup_wire",
    {
      description: "Recent MLB call-ups with fantasy impact analysis - prospect ranks, opportunity created",
      inputSchema: {
        days: z.number().optional().describe("Number of days to look back (default 7)"),
      },
      annotations: { readOnlyHint: true },
      _meta: {},
    },
    async ({ days }) => {
      try {
        const params: Record<string, string> = {};
        if (days) params.days = String(days);
        const data = await apiGet<CallupWireResponse>("/api/prospects/callup-wire", params);
        const lines: string[] = [];
        lines.push("Call-Up Wire (last " + data.days + " days, " + data.count + " transactions):");
        lines.push("");
        for (const t of (data.transactions || [])) {
          lines.push("  " + str(t.date).padEnd(12) + str(t.type).padEnd(15) + str(t.player_name).padEnd(22) + str(t.team));
          if (t.description) lines.push("    " + t.description);
          if (t.prospect_rank) lines.push("    Prospect Rank: #" + t.prospect_rank);
          if (t.fantasy_relevance != null) lines.push("    Fantasy Relevance: " + t.fantasy_relevance + "/10");
          if (t.creates_opportunity && t.creates_opportunity.length > 0) {
            lines.push("    Creates Opportunity: " + t.creates_opportunity.join(", "));
          }
          lines.push("");
        }
        if ((data.transactions || []).length === 0) lines.push("  No recent call-ups found.");
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (e) { return toolError(e); }
    },
  );

  // stash_advisor
  registerAppTool(
    server,
    "fantasy_stash_advisor",
    {
      description: "NA stash recommendations based on call-up probability and league context - who to stash on your NA slots",
      inputSchema: {
        count: z.number().optional().describe("Number of recommendations to return (default 10)"),
      },
      annotations: { readOnlyHint: true },
      _meta: {},
    },
    async ({ count }) => {
      try {
        const params: Record<string, string> = {};
        if (count) params.count = String(count);
        const data = await apiGet<StashAdvisorResponse>("/api/prospects/stash-advisor", params);
        const lines: string[] = [];
        lines.push("NA Stash Advisor (" + data.count + " recommendations):");
        lines.push("");
        for (const r of (data.recommendations || [])) {
          lines.push("  " + str(r.name) + " (" + str(r.position) + ", " + str(r.organization) + ")");
          lines.push("    Action: " + str(r.action) + " | Confidence: " + r.confidence);
          if (r.callup_probability != null) lines.push("    Call-Up Probability: " + r.callup_probability + "% (" + str(r.classification) + ")");
          if (r.readiness_score != null) lines.push("    Readiness: " + r.readiness_score);
          if (r.fv_grade) lines.push("    FV Grade: " + r.fv_grade);
          if (r.reasons && r.reasons.length > 0) {
            lines.push("    Reasons: " + r.reasons.join("; "));
          }
          lines.push("");
        }
        if ((data.recommendations || []).length === 0) lines.push("  No stash recommendations available.");
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (e) { return toolError(e); }
    },
  );

  // prospect_compare
  registerAppTool(
    server,
    "fantasy_prospect_compare",
    {
      description: "Side-by-side prospect comparison - stats, grades, call-up probability, and evaluation",
      inputSchema: {
        player1: z.string().describe("First prospect name"),
        player2: z.string().describe("Second prospect name"),
      },
      annotations: { readOnlyHint: true },
      _meta: {},
    },
    async ({ player1, player2 }) => {
      try {
        const data = await apiGet<ProspectCompareResponse>("/api/prospects/compare", { player1, player2 });
        const p1 = data.player1;
        const p2 = data.player2;
        const lines: string[] = [];
        lines.push("Prospect Comparison: " + str(p1.name) + " vs " + str(p2.name));
        lines.push("");
        lines.push("  " + "".padEnd(20) + str(p1.name).padEnd(22) + str(p2.name).padEnd(22));
        lines.push("  " + "-".repeat(64));
        lines.push("  " + "Position".padEnd(20) + str(p1.position || "-").padEnd(22) + str(p2.position || "-").padEnd(22));
        lines.push("  " + "Organization".padEnd(20) + str(p1.organization || "-").padEnd(22) + str(p2.organization || "-").padEnd(22));
        lines.push("  " + "Age".padEnd(20) + str(p1.age || "-").padEnd(22) + str(p2.age || "-").padEnd(22));
        lines.push("  " + "Level".padEnd(20) + str(p1.current_level || "-").padEnd(22) + str(p2.current_level || "-").padEnd(22));
        lines.push("  " + "FV Grade".padEnd(20) + str(p1.fv_grade || "-").padEnd(22) + str(p2.fv_grade || "-").padEnd(22));
        lines.push("  " + "Overall Rank".padEnd(20) + str(p1.overall_rank ? "#" + p1.overall_rank : "-").padEnd(22) + str(p2.overall_rank ? "#" + p2.overall_rank : "-").padEnd(22));
        lines.push("  " + "ETA".padEnd(20) + str(p1.eta || "-").padEnd(22) + str(p2.eta || "-").padEnd(22));
        lines.push("  " + "40-Man".padEnd(20) + str(p1.on_40_man != null ? (p1.on_40_man ? "Yes" : "No") : "-").padEnd(22) + str(p2.on_40_man != null ? (p2.on_40_man ? "Yes" : "No") : "-").padEnd(22));
        if (p1.callup_probability || p2.callup_probability) {
          lines.push("  " + "Call-Up %".padEnd(20) +
            str(p1.callup_probability ? p1.callup_probability.probability + "%" : "-").padEnd(22) +
            str(p2.callup_probability ? p2.callup_probability.probability + "%" : "-").padEnd(22));
        }
        if (p1.evaluation || p2.evaluation) {
          lines.push("");
          lines.push("  Evaluation:");
          lines.push("  " + "Grade".padEnd(20) + str(p1.evaluation ? p1.evaluation.grade : "-").padEnd(22) + str(p2.evaluation ? p2.evaluation.grade : "-").padEnd(22));
          lines.push("  " + "Readiness".padEnd(20) + str(p1.evaluation ? p1.evaluation.readiness_score : "-").padEnd(22) + str(p2.evaluation ? p2.evaluation.readiness_score : "-").padEnd(22));
        }
        if (p1.stash_recommendation || p2.stash_recommendation) {
          lines.push("");
          lines.push("  Stash Rec:");
          lines.push("  " + "Action".padEnd(20) + str(p1.stash_recommendation ? p1.stash_recommendation.action : "-").padEnd(22) + str(p2.stash_recommendation ? p2.stash_recommendation.action : "-").padEnd(22));
        }
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (e) { return toolError(e); }
    },
  );

  // prospect_buzz
  registerAppTool(
    server,
    "fantasy_prospect_buzz",
    {
      description: "Reddit prospect buzz and discussion tracker - trending prospect posts and mentions",
      annotations: { readOnlyHint: true },
      _meta: {},
    },
    async () => {
      try {
        const data = await apiGet<ProspectBuzzResponse>("/api/prospects/buzz");
        const lines: string[] = [];
        lines.push("Prospect Buzz (" + data.count + " posts):");
        lines.push("");
        for (const p of (data.posts || [])) {
          const sub = p.subreddit ? "[r/" + p.subreddit + "] " : "";
          const match = p.prospect_match ? " -> " + p.prospect_match : "";
          lines.push("  " + sub + str(p.title) + " (score:" + p.score + ", comments:" + p.num_comments + ")" + match);
        }
        if ((data.posts || []).length === 0) lines.push("  No prospect buzz found.");
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (e) { return toolError(e); }
    },
  );

  // eta_tracker
  registerAppTool(
    server,
    "fantasy_eta_tracker",
    {
      description: "Track call-up probability changes for watchlist prospects - flags significant movements",
      annotations: { readOnlyHint: true },
      _meta: {},
    },
    async () => {
      try {
        const data = await apiGet<EtaTrackerResponse>("/api/prospects/eta-tracker");
        const lines: string[] = [];
        lines.push("ETA Tracker (" + data.count + " prospects):");
        lines.push("");
        lines.push("  " + "Name".padEnd(22) + "Current".padStart(9) + "Previous".padStart(10) + "Change".padStart(9) + "  " + "Class".padEnd(12) + "Flag");
        lines.push("  " + "-".repeat(70));
        for (const p of (data.prospects || [])) {
          const arrow = p.change > 0 ? "+" : "";
          const flag = p.flagged ? " ***" : "";
          lines.push("  " +
            str(p.name).padEnd(22) +
            (p.current_probability + "%").padStart(9) +
            (p.previous_probability + "%").padStart(10) +
            (arrow + p.change + "%").padStart(9) + "  " +
            str(p.classification).padEnd(12) +
            flag);
        }
        if ((data.prospects || []).length === 0) lines.push("  No tracked prospects.");
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (e) { return toolError(e); }
    },
  );

  // prospect_trade_targets
  registerAppTool(
    server,
    "fantasy_prospect_trade_targets",
    {
      description: "League-specific prospect trade targets - identifies stashed prospects on other teams worth acquiring",
      annotations: { readOnlyHint: true },
      _meta: {},
    },
    async () => {
      try {
        const data = await apiGet<ProspectTradeTargetsResponse>("/api/prospects/trade-targets");
        const lines: string[] = [];
        lines.push("Prospect Trade Targets (" + data.count + " targets):");
        lines.push("");
        for (const t of (data.targets || [])) {
          lines.push("  " + str(t.name) + " (" + str(t.position) + ", " + str(t.organization) + ")");
          if (t.owner) lines.push("    Owned by: " + t.owner);
          if (t.overall_rank) lines.push("    Prospect Rank: #" + t.overall_rank);
          if (t.fv_grade) lines.push("    FV Grade: " + t.fv_grade);
          if (t.callup_probability != null) lines.push("    Call-Up Probability: " + t.callup_probability + "% (" + str(t.callup_classification) + ")");
          if (t.urgency) lines.push("    Urgency: " + t.urgency);
          if (t.eta) lines.push("    ETA: " + t.eta);
          if (t.trade_suggestion) lines.push("    Suggestion: " + t.trade_suggestion);
          lines.push("");
        }
        if ((data.targets || []).length === 0) lines.push("  No trade targets identified.");
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (e) { return toolError(e); }
    },
  );

  // fantasy_prospect_watch_add
  registerAppTool(
    server,
    "fantasy_prospect_watch_add",
    {
      description: "Add or remove a prospect from your ETA watchlist for tracking call-up probability changes over time",
      inputSchema: {
        player_name: z.string().describe("Prospect name to add or remove"),
        action: z.string().optional().describe("'add' (default) or 'remove'"),
      },
      annotations: { readOnlyHint: false },
      _meta: {},
    },
    async ({ player_name, action }) => {
      try {
        const params: Record<string, string> = { name: player_name };
        if (action) params.action = action;
        const data = await apiGet<{ success?: boolean; error?: string; name?: string; current_probability?: number; action?: string }>("/api/prospects/watch-add", params);
        if (data.error) {
          return { content: [{ type: "text" as const, text: "Error: " + data.error }] };
        }
        const lines: string[] = [];
        if (data.action === "removed") {
          lines.push("Removed " + str(data.name) + " from watchlist.");
        } else {
          lines.push("Added " + str(data.name) + " to watchlist.");
          if (data.current_probability != null) {
            lines.push("Current call-up probability: " + data.current_probability + "%");
          }
        }
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (e) { return toolError(e); }
    },
  );

  // prospect_news
  registerAppTool(
    server,
    "fantasy_prospect_news",
    {
      description: "Get qualitative news intelligence for a prospect — aggregates front office quotes, beat reporter intel, roster decisions, injury news, and rumors from MLB Trade Rumors, ESPN, FanGraphs, and Google News. Shows each article's sentiment signals and how they modify the prospect's call-up probability. Use before stash/trade decisions to check for breaking news that stats alone would miss.",
      inputSchema: {
        player_name: z.string().describe("Prospect name to search for"),
        days: z.number().optional().describe("Number of days of news to search (default 7)"),
      },
      annotations: { readOnlyHint: true },
      _meta: {},
    },
    async ({ player_name, days }) => {
      try {
        const params: Record<string, string> = { name: player_name };
        if (days) params.days = String(days);
        const data = await apiGet<ProspectNewsResponse>("/api/prospects/news", params);
        if (data.error) {
          return { content: [{ type: "text" as const, text: "Error: " + data.error }] };
        }
        const lines: string[] = [];
        const sentiment = data.overall_sentiment || { label: "NO NEWS", emoji: "~", score: 0 };
        lines.push("News Intelligence: " + str(data.prospect_name));
        lines.push("");
        lines.push("  Sentiment: " + sentiment.emoji + " " + sentiment.label + " (score: " + sentiment.score + ")");
        lines.push("  Articles Found: " + data.articles_found);
        lines.push("  Signals Extracted: " + data.signals_extracted);
        if (data.ensemble_probability != null) {
          lines.push("");
          lines.push("  Call-Up Probability Impact:");
          lines.push("    Stat-based:     " + (data.stat_based_probability != null ? data.stat_based_probability + "%" : "N/A"));
          lines.push("    News-adjusted:  " + (data.news_adjusted_probability != null ? data.news_adjusted_probability + "%" : "N/A"));
          lines.push("    Ensemble:       " + data.ensemble_probability + "%");
          const deltaSign = (data.news_delta || 0) >= 0 ? "+" : "";
          lines.push("    News delta:     " + deltaSign + (data.news_delta || 0) + "pp");
        }
        if (data.article_summaries && data.article_summaries.length > 0) {
          lines.push("");
          lines.push("  Recent Articles:");
          for (const article of data.article_summaries.slice(0, 8)) {
            const icon = article.sentiment === "BULLISH" ? "[+]" : article.sentiment === "BEARISH" ? "[-]" : "[~]";
            lines.push("    " + icon + " [" + article.date + "] " + str(article.source));
            lines.push("      " + str(article.title));
            for (const signal of (article.signals || [])) {
              lines.push("      -> " + signal);
            }
          }
        } else {
          lines.push("");
          lines.push("  No recent news found for this prospect.");
        }
        if (data.signal_contributions && data.signal_contributions.length > 0) {
          lines.push("");
          lines.push("  Signal Breakdown:");
          for (const contrib of data.signal_contributions.slice(0, 5)) {
            const sign = contrib.probability_delta >= 0 ? "+" : "";
            lines.push("    " + sign + contrib.probability_delta + "pp -- " + str(contrib.description) + " (" + str(contrib.source) + ", decay: " + contrib.decay_factor + ")");
          }
        }
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (e) { return toolError(e); }
    },
  );
}
