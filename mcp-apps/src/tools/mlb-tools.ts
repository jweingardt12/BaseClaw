import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { apiGet, toolError } from "../api/python-client.js";
import {
  str,
  type MlbTeamsResponse,
  type MlbRosterResponse,
  type MlbPlayerResponse,
  type MlbStatsResponse,
  type MlbInjuriesResponse,
  type MlbStandingsResponse,
  type MlbScheduleResponse,
  type MlbDraftResponse,
  type WeatherResponse,
} from "../api/types.js";
import { shouldRegister as _shouldRegister } from "../toolsets.js";

export function registerMlbTools(server: McpServer, enabledTools?: Set<string>) {
  const shouldRegister = (name: string) => _shouldRegister(enabledTools, name);

  // mlb_teams
  if (shouldRegister("mlb_teams")) {
  registerAppTool(
    server,
    "mlb_teams",
    {
      description: "Use this to list all 30 MLB teams with their abbreviations and full names. Returns the team abbreviation codes needed by other tools like mlb_roster and mlb_standings. Use mlb_roster instead when you want to see a specific team's player roster.",
      annotations: { readOnlyHint: true },
      _meta: {},
    },
    async () => {
      try {
        const data = await apiGet<MlbTeamsResponse>("/api/mlb/teams");
        const text = "MLB Teams:\n" + data.teams.map((t) =>
          "  " + str(t.abbreviation).padEnd(4) + " " + str(t.name)
        ).join("\n");
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { type: "mlb-teams", ai_recommendation: null, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );
  }

  // mlb_roster
  if (shouldRegister("mlb_roster")) {
  registerAppTool(
    server,
    "mlb_roster",
    {
      description: "Use this to see all players on an MLB team's 40-man roster with jersey numbers and positions. Pass the team abbreviation (e.g. 'NYY', 'LAD') or MLB team ID. Use mlb_player instead when you want detailed info on a specific player rather than the full roster.",
      inputSchema: { team: z.string().describe("Team abbreviation (NYY, LAD) or MLB team ID") },
      annotations: { readOnlyHint: true },
      _meta: {},
    },
    async ({ team }) => {
      try {
        const data = await apiGet<MlbRosterResponse>("/api/mlb/roster", { team });
        const text = data.team_name + " Roster:\n" + data.roster.map((p) =>
          "  #" + str(p.jersey_number).padStart(2) + " " + str(p.name).padEnd(25) + " " + str(p.position)
        ).join("\n");
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { type: "mlb-roster", ai_recommendation: null, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );
  }

  // mlb_player
  if (shouldRegister("mlb_player")) {
  registerAppTool(
    server,
    "mlb_player",
    {
      description: "Use this to get biographical info for an MLB player including position, team, bats/throws, and age. Pass the MLB Stats API player ID. Use mlb_stats instead when you want a player's season statistics rather than their bio.",
      inputSchema: { player_id: z.string().describe("MLB Stats API player ID") },
      annotations: { readOnlyHint: true },
      _meta: {},
    },
    async ({ player_id }) => {
      try {
        const data = await apiGet<MlbPlayerResponse>("/api/mlb/player", { player_id });
        const text = "Player: " + data.name + "\n"
          + "  Position: " + data.position + "\n"
          + "  Team: " + data.team + "\n"
          + "  Bats/Throws: " + data.bats + "/" + data.throws + "\n"
          + "  Age: " + data.age + "\n"
          + "  MLB ID: " + data.mlb_id;
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { type: "mlb-player", ai_recommendation: null, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );
  }

  // mlb_stats
  if (shouldRegister("mlb_stats")) {
  registerAppTool(
    server,
    "mlb_stats",
    {
      description: "Use this to get a player's official season statistics from the MLB Stats API. Pass the player ID and optional season year. Use fantasy_player_report instead when you want a richer analysis with Statcast data, trends, and fantasy context beyond raw stats.",
      inputSchema: { player_id: z.string().describe("MLB Stats API player ID"), season: z.string().describe("Season year (e.g. 2025)").default("2025") },
      annotations: { readOnlyHint: true },
      _meta: {},
    },
    async ({ player_id, season }) => {
      try {
        const data = await apiGet<MlbStatsResponse>("/api/mlb/stats", { player_id, season });
        const lines = ["Stats for " + season + ":"];
        for (const [key, val] of Object.entries(data.stats)) {
          lines.push("  " + key + ": " + String(val));
        }
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: { type: "mlb-stats", ai_recommendation: null, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );
  }

  // mlb_injuries
  if (shouldRegister("mlb_injuries")) {
  registerAppTool(
    server,
    "mlb_injuries",
    {
      description: "Use this to see all current MLB injuries across every team with player names and injury descriptions. Returns the league-wide injury list which is useful for waiver wire planning. Use yahoo_player_intel instead when you want injury details for one specific player along with other qualitative context.",
      annotations: { readOnlyHint: true },
      _meta: {},
    },
    async () => {
      try {
        const data = await apiGet<MlbInjuriesResponse>("/api/mlb/injuries");
        const text = data.injuries.length > 0
          ? "Current Injuries:\n" + data.injuries.map((i) =>
              "  " + i.player + " (" + i.team + "): " + i.description
            ).join("\n")
          : "No injuries reported (may be offseason)";
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { type: "mlb-injuries", ai_recommendation: null, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );
  }

  // mlb_standings
  if (shouldRegister("mlb_standings")) {
  registerAppTool(
    server,
    "mlb_standings",
    {
      description: "Use this to see current MLB division standings with win-loss records and games back. Returns all six divisions with team rankings. Use mlb_schedule instead when you want to see upcoming games rather than standings.",
      annotations: { readOnlyHint: true },
      _meta: {},
    },
    async () => {
      try {
        const data = await apiGet<MlbStandingsResponse>("/api/mlb/standings");
        const lines: string[] = [];
        for (const div of data.divisions) {
          lines.push("", div.name + ":");
          for (const t of div.teams) {
            lines.push("  " + str(t.name).padEnd(25) + " " + t.wins + "-" + t.losses + " (" + str(t.games_back) + " GB)");
          }
        }
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: { type: "mlb-standings", ai_recommendation: null, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );
  }

  // mlb_schedule
  if (shouldRegister("mlb_schedule")) {
  registerAppTool(
    server,
    "mlb_schedule",
    {
      description: "Use this to see the MLB game schedule for a given day showing matchups and game status. Pass a date in YYYY-MM-DD format or leave empty for today's games. Use yahoo_weather instead when you need to know which games are at outdoor vs domed stadiums for weather risk.",
      inputSchema: { date: z.string().describe("Date in YYYY-MM-DD format, empty for today").default("") },
      annotations: { readOnlyHint: true },
      _meta: {},
    },
    async ({ date }) => {
      try {
        const params: Record<string, string> = {};
        if (date) params.date = date;
        const data = await apiGet<MlbScheduleResponse>("/api/mlb/schedule", params);
        const text = "Games for " + data.date + ":\n" + data.games.map((g) =>
          "  " + g.away + " @ " + g.home + " - " + g.status
        ).join("\n");
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { type: "mlb-schedule", ai_recommendation: null, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );
  }

  // mlb_draft
  if (shouldRegister("mlb_draft")) {
  registerAppTool(
    server,
    "mlb_draft",
    {
      description: "Use this to see MLB amateur draft picks by year with player names, teams, rounds, positions, and schools. Pass the year or omit for the current year's draft results. Use fantasy_prospect_rankings instead when you want fantasy-relevant prospect rankings with call-up probabilities rather than raw draft order.",
      inputSchema: { year: z.string().describe("Draft year (e.g. '2025'). Omit for current year.").default("") },
      annotations: { readOnlyHint: true },
      _meta: {},
    },
    async ({ year }) => {
      try {
        var params: Record<string, string> = {};
        if (year) params.year = year;
        var data = await apiGet<MlbDraftResponse>("/api/mlb/draft", params);
        if (data.note) {
          return {
            content: [{ type: "text" as const, text: data.note }],
            structuredContent: { type: "mlb-draft", ai_recommendation: null, ...data },
          };
        }
        var lines = ["MLB Draft " + (data.year || year) + ":"];
        var currentRound = "";
        for (var p of data.picks) {
          if (str(p.round) !== currentRound) {
            currentRound = str(p.round);
            lines.push("  Round " + currentRound + ":");
          }
          var line = "    #" + str(p.pick_number).padStart(3) + " " + str(p.name).padEnd(25) + " " + str(p.position).padEnd(5) + " " + str(p.team);
          if (p.school) line += " (" + p.school + ")";
          lines.push(line);
        }
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: { type: "mlb-draft", ai_recommendation: null, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );
  }

  // yahoo_weather
  if (shouldRegister("yahoo_weather")) {
  registerAppTool(
    server,
    "yahoo_weather",
    {
      description: "Use this to check weather and venue risk for MLB games by seeing which games are at outdoor vs domed stadiums. Returns a breakdown of dome and outdoor game counts to help with lineup and streaming pitcher decisions. Use mlb_schedule instead when you just need the game matchups without weather context.",
      inputSchema: { date: z.string().describe("Date in YYYY-MM-DD format, empty for today").default("") },
      annotations: { readOnlyHint: true },
      _meta: {},
    },
    async ({ date }) => {
      try {
        var params: Record<string, string> = {};
        if (date) params.date = date;
        var data = await apiGet<WeatherResponse>("/api/mlb/weather", params);
        var lines = ["Weather Risk Report - " + data.date, ""];
        var dome: string[] = [];
        var outdoor: string[] = [];
        for (var g of data.games) {
          var label = g.is_dome ? "[DOME]" : "[OUTDOOR]";
          var line = "  " + g.away + " @ " + g.home + " - " + g.venue + " " + label;
          if (g.is_dome) {
            dome.push(line);
          } else {
            outdoor.push(line);
          }
        }
        if (outdoor.length > 0) {
          lines.push("OUTDOOR (check forecast):");
          lines.push.apply(lines, outdoor);
          lines.push("");
        }
        if (dome.length > 0) {
          lines.push("DOME/RETRACTABLE (no weather risk):");
          lines.push.apply(lines, dome);
          lines.push("");
        }
        lines.push("Dome: " + data.dome_count + "  Outdoor: " + data.outdoor_count);
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: { type: "weather", ai_recommendation: null, ...data },
        };
      } catch (e) { return toolError(e); }
    },
  );
  }
}
