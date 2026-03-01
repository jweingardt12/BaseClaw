import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { apiGet, toolError } from "../api/python-client.js";
import { generateRankingsInsight, generateCompareInsight } from "../insights.js";
import { str, type RankingsResponse, type CompareResponse, type ValueResponse } from "../api/types.js";

const VALUATIONS_URI = "ui://fbb-mcp/valuations.html";

export function registerValuationsTools(server: McpServer, distDir: string) {
  registerAppResource(
    server,
    "Valuations View",
    VALUATIONS_URI,
    {
      description: "Z-score rankings, player comparisons, and valuations",
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
        uri: VALUATIONS_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: await fs.readFile(path.join(distDir, "valuations.html"), "utf-8"),
      }],
    }),
  );

  // yahoo_rankings
  registerAppTool(
    server,
    "yahoo_rankings",
    {
      description: "Show top players ranked by z-score value. pos_type: B for batters, P for pitchers",
      inputSchema: { pos_type: z.string().describe("B for batters, P for pitchers").default("B"), count: z.number().describe("Number of players to return").default(25) },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: VALUATIONS_URI } },
    },
    async ({ pos_type, count }) => {
      try {
        const data = await apiGet<RankingsResponse>("/api/rankings", { pos_type, count: String(count) });
        const label = pos_type === "B" ? "Hitter" : "Pitcher";
        const text = "Top " + count + " " + label + " Rankings (z-score, source: " + data.source + "):\n"
          + data.players.map((p) => {
            const tier = (p.intel && p.intel.statcast && p.intel.statcast.quality_tier) ? " {" + p.intel.statcast.quality_tier + "}" : "";
            return "  " + String(p.rank).padStart(3) + ". " + str(p.name).padEnd(25) + " " + str(p.pos).padEnd(8) + " z=" + p.z_score.toFixed(2) + tier;
          }).join("\n");
        var ai_recommendation = generateRankingsInsight(data);
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { type: "rankings", ai_recommendation, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );

  // yahoo_compare
  registerAppTool(
    server,
    "yahoo_compare",
    {
      description: "Compare two players side by side with z-score breakdowns",
      inputSchema: { player1: z.string().describe("First player name"), player2: z.string().describe("Second player name") },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: VALUATIONS_URI } },
    },
    async ({ player1, player2 }) => {
      try {
        const data = await apiGet<CompareResponse>("/api/compare", { player1, player2 });
        const final1 = data.z_scores["Final"] ? data.z_scores["Final"].player1 : 0;
        const final2 = data.z_scores["Final"] ? data.z_scores["Final"].player2 : 0;
        const lines = [
          "Player Comparison:",
          "  " + data.player1.name + " (z=" + final1.toFixed(2) + ")  vs  " + data.player2.name + " (z=" + final2.toFixed(2) + ")",
          "",
        ];
        const cats1: Record<string, number> = {};
        const cats2: Record<string, number> = {};
        for (const [cat, scores] of Object.entries(data.z_scores)) {
          if (cat === "Final") continue;
          cats1[cat] = scores.player1;
          cats2[cat] = scores.player2;
          lines.push("  " + str(cat).padEnd(12) + str(scores.player1.toFixed(2)).padStart(8) + "  vs  " + str(scores.player2.toFixed(2)).padStart(8));
        }
        var ai_recommendation = generateCompareInsight(data);
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: {
            type: "compare",
            ai_recommendation,
            player1: { name: data.player1.name, z_score: final1, categories: cats1 },
            player2: { name: data.player2.name, z_score: final2, categories: cats2 },
          },
        };
      } catch (e) { return toolError(e); }
    },
  );

  // yahoo_value
  registerAppTool(
    server,
    "yahoo_value",
    {
      description: "Show a player's full z-score breakdown across all categories",
      inputSchema: { player_name: z.string().describe("Player name to look up") },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: VALUATIONS_URI } },
    },
    async ({ player_name }) => {
      try {
        const data = await apiGet<ValueResponse>("/api/value", { player_name });
        const p = data.players[0];
        if (!p) {
          return {
            content: [{ type: "text" as const, text: "Player not found" }],
            structuredContent: { type: "value", name: "Unknown", z_final: 0, categories: [] },
          };
        }
        const zFinal = p.z_scores["Final"] || 0;
        const tier = (p.intel && p.intel.statcast && p.intel.statcast.quality_tier) ? " {" + p.intel.statcast.quality_tier + "}" : "";
        const lines = ["Value Breakdown: " + p.name + " (" + str(p.pos) + ", " + str(p.team) + ", z=" + zFinal.toFixed(2) + ")" + tier];
        const categories: Array<{ category: string; z_score: number; raw_stat: number | null }> = [];
        for (const [cat, z] of Object.entries(p.z_scores)) {
          if (cat === "Final") continue;
          const rawStat = p.raw_stats[cat] ?? null;
          categories.push({ category: cat, z_score: Number(z), raw_stat: rawStat });
          lines.push("  " + str(cat).padEnd(12) + " z=" + Number(z).toFixed(2) + (rawStat != null ? "  (" + rawStat + ")" : ""));
        }
        var ai_recommendation: string | null = null;
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: {
            type: "value",
            ai_recommendation,
            name: p.name,
            team: p.team,
            pos: p.pos,
            player_type: p.type,
            z_final: zFinal,
            categories,
          },
        };
      } catch (e) { return toolError(e); }
    },
  );
}
