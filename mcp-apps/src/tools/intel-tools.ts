import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { apiGet, toolError } from "../api/python-client.js";
import { generatePlayerReportInsight, generateBreakoutInsight } from "../insights.js";
import {
  str,
  type IntelPlayerReportResponse,
  type BreakoutsResponse,
  type BustsResponse,
  type RedditBuzzResponse,
  type TrendingResponse,
  type ProspectWatchResponse,
  type IntelTransactionsResponse,
} from "../api/types.js";

const INTEL_URI = "ui://fbb-mcp/intel.html";

export function registerIntelTools(server: McpServer, distDir: string) {
  registerAppResource(
    server,
    "Intelligence Dashboard",
    INTEL_URI,
    {
      description: "Player intelligence: Statcast, trends, Reddit buzz, breakouts, prospects",
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
        uri: INTEL_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: await fs.readFile(path.join(distDir, "intel.html"), "utf-8"),
      }],
    }),
  );

  // fantasy_player_report
  registerAppTool(
    server,
    "fantasy_player_report",
    {
      description: "Deep-dive Statcast + trends + plate discipline + Reddit buzz for a single player",
      inputSchema: { player_name: z.string().describe("Player name to look up") },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: INTEL_URI } },
    },
    async ({ player_name }) => {
      try {
        const data = await apiGet<IntelPlayerReportResponse>("/api/intel/player", { name: player_name });
        const lines = ["Player Intelligence: " + str(data.name)];
        if (data.statcast) {
          const sc = data.statcast;
          lines.push("");
          lines.push("Statcast: " + (sc.quality_tier || "unknown").toUpperCase());
          if (sc.xwoba != null) lines.push("  xwOBA: " + sc.xwoba + " (" + (sc.xwoba_pct_rank || "?") + "th pct)");
          if (sc.avg_exit_velo != null) lines.push("  Exit Velo: " + sc.avg_exit_velo + " (" + (sc.ev_pct_rank || "?") + "th pct)");
          if (sc.barrel_pct_rank != null) lines.push("  Barrel Rate: " + (sc.barrel_pct_rank || "?") + "th pct");
          if (sc.hard_hit_rate != null) lines.push("  Hard Hit: " + sc.hard_hit_rate + "% (" + (sc.hh_pct_rank || "?") + "th pct)");
        }
        if (data.trends) {
          const t = data.trends;
          lines.push("");
          lines.push("Trend: " + (t.hot_cold || "neutral").toUpperCase());
          if (t.last_14_days) {
            const d = t.last_14_days;
            lines.push("  14-Day: " + Object.entries(d).map(function([k,v]) { return k + "=" + v; }).join(", "));
          }
        }
        if (data.context) {
          const c = data.context;
          if (c.reddit_mentions && c.reddit_mentions > 0) {
            lines.push("");
            lines.push("Reddit: " + c.reddit_mentions + " mentions (" + (c.reddit_sentiment || "neutral") + ")");
          }
        }
        if (data.discipline) {
          const d = data.discipline;
          lines.push("");
          lines.push("Plate Discipline:");
          if (d.bb_rate != null) lines.push("  BB%: " + d.bb_rate);
          if (d.k_rate != null) lines.push("  K%: " + d.k_rate);
        }
        var ai_recommendation = generatePlayerReportInsight(data);
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: { type: "intel-player", ai_recommendation, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );

  // fantasy_breakout_candidates
  registerAppTool(
    server,
    "fantasy_breakout_candidates",
    {
      description: "Find breakout candidates: players whose expected stats (xwOBA) exceed actual performance, suggesting positive regression",
      inputSchema: { pos_type: z.string().describe("B for batters, P for pitchers").default("B"), count: z.number().describe("Number of candidates to return").default(15) },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: INTEL_URI } },
    },
    async ({ pos_type, count }) => {
      try {
        const data = await apiGet<BreakoutsResponse>("/api/intel/breakouts", { pos_type, count: String(count) });
        const label = pos_type === "B" ? "Hitter" : "Pitcher";
        const lines = ["Breakout Candidates (" + label + "s) - xwOBA exceeds actual wOBA:"];
        lines.push("  " + "Player".padEnd(25) + "wOBA".padStart(7) + "  xwOBA".padStart(7) + "  Diff".padStart(7) + "  PA".padStart(5));
        lines.push("  " + "-".repeat(55));
        for (const c of data.candidates) {
          lines.push("  " + str(c.name).padEnd(25) + str(c.woba.toFixed(3)).padStart(7) + "  " + str(c.xwoba.toFixed(3)).padStart(7) + "  +" + str(c.diff.toFixed(3)).padStart(6) + str(c.pa).padStart(5));
        }
        var ai_recommendation = generateBreakoutInsight(data);
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: { type: "intel-breakouts", ai_recommendation, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );

  // fantasy_bust_candidates
  registerAppTool(
    server,
    "fantasy_bust_candidates",
    {
      description: "Find bust candidates: players whose actual performance (wOBA) exceeds expected stats (xwOBA), suggesting negative regression",
      inputSchema: { pos_type: z.string().describe("B for batters, P for pitchers").default("B"), count: z.number().describe("Number of candidates to return").default(15) },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: INTEL_URI } },
    },
    async ({ pos_type, count }) => {
      try {
        const data = await apiGet<BustsResponse>("/api/intel/busts", { pos_type, count: String(count) });
        const label = pos_type === "B" ? "Hitter" : "Pitcher";
        const lines = ["Bust Candidates (" + label + "s) - actual wOBA exceeds xwOBA:"];
        lines.push("  " + "Player".padEnd(25) + "wOBA".padStart(7) + "  xwOBA".padStart(7) + "  Diff".padStart(7) + "  PA".padStart(5));
        lines.push("  " + "-".repeat(55));
        for (const c of data.candidates) {
          lines.push("  " + str(c.name).padEnd(25) + str(c.woba.toFixed(3)).padStart(7) + "  " + str(c.xwoba.toFixed(3)).padStart(7) + "  " + str(c.diff.toFixed(3)).padStart(7) + str(c.pa).padStart(5));
        }
        var ai_recommendation: string | null = null;
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: { type: "intel-busts", ai_recommendation, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );

  // fantasy_reddit_buzz
  registerAppTool(
    server,
    "fantasy_reddit_buzz",
    {
      description: "What r/fantasybaseball is talking about right now - hot posts, trending topics",
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: INTEL_URI } },
    },
    async () => {
      try {
        const data = await apiGet<RedditBuzzResponse>("/api/intel/reddit");
        const lines = ["Reddit Fantasy Baseball Buzz:"];
        for (const p of (data.posts || [])) {
          const flair = p.flair ? "[" + p.flair + "] " : "";
          lines.push("  " + flair + p.title + " (score:" + p.score + ", comments:" + p.num_comments + ")");
        }
        var ai_recommendation: string | null = null;
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: { type: "intel-reddit", ai_recommendation, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );

  // fantasy_trending_players
  registerAppTool(
    server,
    "fantasy_trending_players",
    {
      description: "Players with rising buzz on Reddit - high engagement posts about specific players",
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: INTEL_URI } },
    },
    async () => {
      try {
        const data = await apiGet<TrendingResponse>("/api/intel/trending");
        const lines = ["Trending Players:"];
        for (const p of (data.posts || [])) {
          lines.push("  " + p.title + " (score:" + p.score + ", comments:" + p.num_comments + ")");
        }
        if ((data.posts || []).length === 0) lines.push("  No trending player posts found.");
        var ai_recommendation: string | null = null;
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: { type: "intel-trending", ai_recommendation, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );

  // fantasy_prospect_watch
  registerAppTool(
    server,
    "fantasy_prospect_watch",
    {
      description: "Recent MLB prospect call-ups and roster moves that could impact fantasy",
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: INTEL_URI } },
    },
    async () => {
      try {
        const data = await apiGet<ProspectWatchResponse>("/api/intel/prospects");
        const lines = ["Prospect Watch - Recent Call-ups & Moves:"];
        for (const t of (data.transactions || [])) {
          lines.push("  " + str(t.type).padEnd(12) + " " + str(t.player).padEnd(25) + " " + str(t.team || ""));
        }
        if ((data.transactions || []).length === 0) lines.push("  No recent prospect moves found.");
        var ai_recommendation: string | null = null;
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: { type: "intel-prospects", ai_recommendation, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );

  // fantasy_transactions
  registerAppTool(
    server,
    "fantasy_transactions",
    {
      description: "Recent fantasy-relevant MLB transactions (IL, call-up, DFA, trade). Use days param to control lookback window.",
      inputSchema: { days: z.number().describe("Number of days to look back").default(7) },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: INTEL_URI } },
    },
    async ({ days }) => {
      try {
        const data = await apiGet<IntelTransactionsResponse>("/api/intel/transactions", { days: String(days) });
        const lines = ["MLB Transactions (last " + days + " days):"];
        for (const t of (data.transactions || [])) {
          lines.push("  " + str(t.type).padEnd(12) + " " + str(t.player).padEnd(25) + " " + str(t.team || "") + (t.description ? " - " + t.description : ""));
        }
        if ((data.transactions || []).length === 0) lines.push("  No transactions found.");
        var ai_recommendation: string | null = null;
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: { type: "intel-transactions", ai_recommendation, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );
}
