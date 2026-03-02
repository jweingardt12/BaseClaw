#!/usr/bin/env npx tsx
// Refresh mock-data.ts by snapshotting all API endpoints from the running Python API.
// Usage: npx tsx scripts/refresh-mock-data.ts [--write]
//   Without --write: prints to stdout
//   With --write: overwrites ui/preview-app/mock-data.ts

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const API_BASE = process.env.API_URL || "http://localhost:8766";

// Mirror of VIEW_API_MAP from live-data.ts
const VIEW_API_MAP: Record<string, { path: string; method?: string; body?: any }> = {
  standings:             { path: "/api/standings" },
  matchups:              { path: "/api/matchups" },
  "matchup-detail":      { path: "/api/matchup-detail" },
  scoreboard:            { path: "/api/scoreboard" },
  info:                  { path: "/api/info" },
  "stat-categories":     { path: "/api/stat-categories" },
  transactions:          { path: "/api/transactions" },
  "transaction-trends":  { path: "/api/transaction-trends" },
  "league-pulse":        { path: "/api/league-pulse" },
  "power-rankings":      { path: "/api/power-rankings" },
  "season-pace":         { path: "/api/season-pace" },
  "category-check":      { path: "/api/category-check" },
  "injury-report":       { path: "/api/injury-report" },
  "waiver-analyze":      { path: "/api/waiver-analyze?pos_type=B&count=15" },
  "lineup-optimize":     { path: "/api/lineup-optimize" },
  streaming:             { path: "/api/streaming" },
  "daily-update":        { path: "/api/daily-update" },
  "scout-opponent":      { path: "/api/scout-opponent" },
  "matchup-strategy":    { path: "/api/matchup-strategy" },
  "trade-eval":          { path: "/api/trade-eval", method: "POST", body: { give_ids: "0", get_ids: "1" } },
  roster:                { path: "/api/roster" },
  "free-agents":         { path: "/api/free-agents?pos_type=B&count=20" },
  rankings:              { path: "/api/rankings?pos_type=B&count=25" },
  compare:               { path: "/api/compare?player1=Shohei+Ohtani&player2=Aaron+Judge" },
  value:                 { path: "/api/value?player_name=Shohei+Ohtani" },
  "draft-status":        { path: "/api/draft-status" },
  "draft-recommend":     { path: "/api/draft-recommend" },
  "best-available":      { path: "/api/best-available?pos_type=B&count=25" },
  "draft-cheatsheet":    { path: "/api/draft-cheatsheet" },
  "mlb-teams":           { path: "/api/mlb/teams" },
  "mlb-roster":          { path: "/api/mlb/roster?team=NYY" },
  "mlb-player":          { path: "/api/mlb/player?player_id=660271" },
  "mlb-stats":           { path: "/api/mlb/stats?player_id=660271" },
  "mlb-injuries":        { path: "/api/mlb/injuries" },
  "mlb-standings":       { path: "/api/mlb/standings" },
  "mlb-schedule":        { path: "/api/mlb/schedule" },
  "league-history":      { path: "/api/league-history" },
  "record-book":         { path: "/api/record-book" },
  "past-standings":      { path: "/api/past-standings?year=2025" },
  "past-draft":          { path: "/api/past-draft?year=2025" },
  "past-teams":          { path: "/api/past-teams?year=2025" },
  "past-trades":         { path: "/api/past-trades?year=2025" },
  "past-matchup":        { path: "/api/past-matchup?year=2025&week=1" },
  "intel-player":        { path: "/api/intel/player?name=Shohei+Ohtani" },
  "intel-breakouts":     { path: "/api/intel/breakouts?pos_type=B&count=15" },
  "intel-busts":         { path: "/api/intel/busts?pos_type=B&count=15" },
  "intel-reddit":        { path: "/api/intel/reddit" },
  "intel-trending":      { path: "/api/intel/trending" },
  "intel-prospects":     { path: "/api/intel/prospects" },
  "intel-transactions":  { path: "/api/intel/transactions?days=7" },
  "set-lineup":          { path: "/api/set-lineup" },
  "pending-trades":      { path: "/api/pending-trades" },
  "whats-new":           { path: "/api/whats-new" },
  "trade-finder":        { path: "/api/trade-finder" },
  "week-planner":        { path: "/api/week-planner" },
  "closer-monitor":      { path: "/api/closer-monitor" },
  "pitcher-matchup":     { path: "/api/pitcher-matchup" },
  "category-trends":     { path: "/api/category-trends" },
  "who-owns":            { path: "/api/who-owns?player_name=Pete+Alonso" },
  "morning-briefing":    { path: "/api/morning-briefing" },
  "punt-advisor":        { path: "/api/punt-advisor" },
  "playoff-planner":     { path: "/api/playoff-planner" },
  "optimal-moves":       { path: "/api/optimal-moves" },
  "il-stash-advisor":    { path: "/api/il-stash-advisor" },
  "trash-talk":          { path: "/api/trash-talk" },
  "rival-history":       { path: "/api/rival-history" },
  achievements:          { path: "/api/achievements" },
  "weekly-narrative":    { path: "/api/weekly-narrative" },
  "faab-recommend":      { path: "/api/faab-recommend" },
  "ownership-trends":    { path: "/api/ownership-trends" },
  "roster-stats":        { path: "/api/roster-stats" },
};

// Additional mock keys that share an endpoint or are derived
const EXTRA_KEYS: Record<string, string> = {
  "action-add": "roster",       // add result shows roster
  "action-drop": "roster",
  "action-swap": "roster",
  "trade-action": "pending-trades",
  "trade-builder": "roster",
  "category-simulate": "category-check",
};

async function fetchEndpoint(entry: { path: string; method?: string; body?: any }): Promise<any> {
  const url = API_BASE + entry.path;
  let init: RequestInit | undefined;
  if (entry.method === "POST") {
    init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry.body || {}),
    };
  }
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(res.status + " " + res.statusText);
  return res.json();
}

const CONCURRENCY = 6;

async function main() {
  const writeFile = process.argv.includes("--write");

  console.error("Fetching from " + API_BASE + "...");

  const result: Record<string, any> = {};
  const keys = Object.keys(VIEW_API_MAP);
  let succeeded = 0;
  let failed = 0;

  // Fetch in parallel with concurrency limit
  for (let i = 0; i < keys.length; i += CONCURRENCY) {
    const batch = keys.slice(i, i + CONCURRENCY);
    const outcomes = await Promise.allSettled(
      batch.map(async (key) => {
        const data = await fetchEndpoint(VIEW_API_MAP[key]);
        return { key, data };
      })
    );
    for (const outcome of outcomes) {
      if (outcome.status === "fulfilled") {
        result[outcome.value.key] = outcome.value.data;
        succeeded++;
        console.error("  OK  " + outcome.value.key);
      } else {
        failed++;
        const failedKey = batch[outcomes.indexOf(outcome)];
        console.error("  FAIL " + failedKey + ": " + (outcome.reason?.message || outcome.reason));
      }
    }
  }

  // Add extra keys that are copies/aliases
  for (const [extraKey, sourceKey] of Object.entries(EXTRA_KEYS)) {
    if (result[sourceKey] && !result[extraKey]) {
      result[extraKey] = result[sourceKey];
    }
  }

  console.error("\nDone: " + succeeded + " succeeded, " + failed + " failed, " + Object.keys(result).length + " total keys");

  const output = "// Mock data for the preview app.\n"
    + "// Auto-generated by scripts/refresh-mock-data.ts on " + new Date().toISOString().slice(0, 10) + "\n"
    + "// Re-run: npx tsx scripts/refresh-mock-data.ts --write\n\n"
    + "export const MOCK_DATA: Record<string, any> = " + JSON.stringify(result, null, 2) + ";\n";

  if (writeFile) {
    const outPath = resolve(import.meta.dirname || ".", "..", "ui", "preview-app", "mock-data.ts");
    writeFileSync(outPath, output, "utf-8");
    console.error("Written to " + outPath);
  } else {
    process.stdout.write(output);
  }
}

main().catch(function (err) {
  console.error("Fatal: " + err.message);
  process.exit(1);
});
