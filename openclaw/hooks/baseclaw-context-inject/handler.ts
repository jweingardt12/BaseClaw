import { fetchBaseclaw } from "../lib/fetch";

function formatDate(d: Date): string {
  return d.getFullYear() + "-"
    + String(d.getMonth() + 1).padStart(2, "0") + "-"
    + String(d.getDate()).padStart(2, "0");
}

function detectSeasonPhase(): string {
  var now = new Date();
  var month = now.getMonth() + 1;
  var day = now.getDate();
  if (month < 3 || (month === 3 && day < 20)) return "pre-season";
  if (month === 3 || (month === 4 && day <= 14)) return "early-season";
  if (month >= 4 && month <= 7) return "midseason";
  if (month === 8 || (month === 9 && day <= 15)) return "stretch-run";
  if (month >= 9 && month <= 10) return "playoffs";
  return "off-season";
}

var handler = async function (event: any): Promise<void> {
  if (event.type !== "agent" || event.action !== "bootstrap") {
    return;
  }

  // Fetch league context and roster monitor in parallel
  var [leagueCtx, monitor] = await Promise.all([
    fetchBaseclaw("/api/league-context", 8000),
    fetchBaseclaw("/api/roster-monitor", 8000),
  ]);

  var lines: string[] = [];
  lines.push("# BaseClaw Live Context");
  lines.push("");
  lines.push("*Auto-injected at session start — " + formatDate(new Date()) + "*");
  lines.push("");

  // Season phase
  var phase = detectSeasonPhase();
  lines.push("## Season Phase: " + phase.replace("-", " ").toUpperCase());
  lines.push("");

  // League state
  if (leagueCtx) {
    var league = leagueCtx.league || {};
    var team = leagueCtx.team || {};
    var matchup = leagueCtx.matchup || {};

    if (league.name) {
      lines.push("**League:** " + league.name);
    }
    if (team.name) {
      lines.push("**Team:** " + team.name);
    }
    if (team.standings_rank) {
      lines.push("**Standings:** " + team.standings_rank + " of " + (league.num_teams || "?")
        + " (" + (team.wins || 0) + "-" + (team.losses || 0) + "-" + (team.ties || 0) + ")");
    }
    if (team.faab_balance !== undefined && team.faab_balance !== null) {
      lines.push("**FAAB remaining:** $" + team.faab_balance);
    }
    if (matchup.opponent) {
      var score = matchup.score || {};
      lines.push("**This week vs:** " + matchup.opponent
        + " (" + (score.wins || 0) + "-" + (score.losses || 0) + "-" + (score.ties || 0) + ")");
    }
    if (leagueCtx.edit_date) {
      lines.push("**Next lineup edit:** " + leagueCtx.edit_date);
    }

    // Scoring categories
    if (league.batting_categories || league.pitching_categories) {
      lines.push("");
      lines.push("**Batting cats:** " + (league.batting_categories || []).join(", "));
      lines.push("**Pitching cats:** " + (league.pitching_categories || []).join(", "));
    }

    lines.push("");
  } else {
    lines.push("*League context unavailable — call yahoo_league_context manually*");
    lines.push("");
  }

  // Roster alerts
  if (monitor && monitor.alerts && monitor.alerts.length > 0) {
    lines.push("## Active Alerts");
    lines.push("");
    for (var i = 0; i < monitor.alerts.length; i++) {
      var alert = monitor.alerts[i];
      var icon = alert.severity === "critical" ? "[!!!]" : alert.severity === "warning" ? "[!]" : "[i]";
      lines.push("- " + icon + " " + alert.message);
    }
    lines.push("");
  }

  // Trending FAs from monitor
  if (monitor && monitor.alerts) {
    var trending = monitor.alerts.filter(function (a: any) { return a.type === "trending_fa"; });
    if (trending.length > 0) {
      lines.push("## Trending Free Agents");
      lines.push("");
      for (var j = 0; j < trending.length; j++) {
        lines.push("- " + trending[j].message);
      }
      lines.push("");
    }
  }

  // Phase-specific guidance
  lines.push("## Phase Strategy");
  lines.push("");
  if (phase === "pre-season") {
    lines.push("Focus on draft prep, projection analysis, and sleeper identification.");
  } else if (phase === "early-season") {
    lines.push("Small samples — trust projections over 2-week stats. Patience on slumping stars. Be aggressive on breakout adds.");
  } else if (phase === "midseason") {
    lines.push("Blend projections with actual performance. Trade market is active. Buy low on regression candidates, sell high on overperformers.");
  } else if (phase === "stretch-run") {
    lines.push("Win-now mode. Trade prospects for production. Stream aggressively. Target categories that affect playoff seeding.");
  } else if (phase === "playoffs") {
    lines.push("Maximum daily optimization. Stream pitchers aggressively. Every lineup slot matters. No long-term thinking.");
  } else {
    lines.push("Off-season. Evaluate keeper decisions and plan for next year's draft.");
  }

  var contextMd = lines.join("\n");

  // Inject into bootstrap files
  if (event.context && event.context.bootstrapFiles) {
    event.context.bootstrapFiles.push({
      path: "CONTEXT.md",
      content: contextMd,
    });
  }

  console.log("[baseclaw-context-inject] Injected CONTEXT.md (" + lines.length + " lines, phase=" + phase + ", alerts=" + ((monitor && monitor.alert_count) || 0) + ")");
};

export default handler;
