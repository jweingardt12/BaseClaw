import { Card, CardContent } from "../components/card";
import { IntelPanel } from "../shared/intel-panel";
import { type PlayerIntel } from "../shared/intel-badge";
import { KpiTile } from "../shared/kpi-tile";
import { Badge } from "@/components/ui/badge";
import { Subheading } from "../components/heading";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { mlbHeadshotUrl, teamLogoFromName, teamAbbrevFromName } from "../shared/mlb-images";
import { ChevronLeft, ExternalLink } from "@/shared/icons";
import { useAppContextSafe } from "../shared/app-context";

interface PlayerReportData extends PlayerIntel {
  type: string;
  name: string;
  mlb_id?: number;
  ai_recommendation?: string | null;
  yahoo_stats?: Record<string, unknown>;
  yahoo_player_id?: string;
  valuation?: {
    rank?: number;
    z_final?: number;
    tier?: string;
    type?: string;
    pos?: string;
    per_category_zscores?: Record<string, number>;
  };
  percentiles?: { metrics?: Record<string, number>; data_season?: number };
}

interface GameEntry {
  date: string;
  opponent: string;
  [key: string]: unknown;
}

var TIER_STYLE: Record<string, { bg: string; text: string; ring: string }> = {
  success: { bg: "bg-sem-success-subtle border-sem-success-border", text: "text-sem-success", ring: "ring-sem-success/60" },
  info:    { bg: "bg-sem-info-subtle border-sem-info-border",       text: "text-sem-info",    ring: "ring-border" },
  warning: { bg: "bg-sem-warning-subtle border-sem-warning-border", text: "text-sem-warning", ring: "ring-sem-warning/60" },
  risk:    { bg: "bg-sem-risk-subtle border-sem-risk-border",       text: "text-sem-risk",    ring: "ring-sem-risk/60" },
  neutral: { bg: "bg-muted",                                        text: "text-foreground",  ring: "ring-border" },
};

function tierColor(tier: string): "success" | "risk" | "warning" | "info" | "neutral" {
  var t = (tier || "").toLowerCase();
  if (t === "elite" || t === "great" || t === "excellent") return "success";
  if (t === "good" || t === "above average") return "info";
  if (t === "average" || t === "below average") return "warning";
  if (t === "poor" || t === "bad") return "risk";
  return "neutral";
}

function pctColor(pct: number | null | undefined): "success" | "risk" | "warning" | "info" | "neutral" {
  if (pct == null) return "neutral";
  if (pct >= 80) return "success";
  if (pct >= 50) return "info";
  if (pct >= 25) return "warning";
  return "risk";
}

function num(v: unknown, decimals: number = 0): string {
  if (v == null || v === "" || v === "-") return "\u2014";
  var n = Number(v);
  if (isNaN(n)) return String(v);
  return decimals > 0 ? n.toFixed(decimals) : String(Math.round(n));
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  var parts = dateStr.split("-");
  if (parts.length === 3) return Number(parts[1]) + "/" + Number(parts[2]);
  return dateStr;
}

function shortTeam(name: string): string {
  if (!name) return "";
  return teamAbbrevFromName(name) || name.split(" ").pop() || name.substring(0, 3);
}

function batterGameScore(g: GameEntry): number {
  return Number(g.hits || 0)
    + Number(g.homeRuns || 0) * 3
    + Number(g.rbi || 0)
    + Number(g.runs || 0) * 0.5
    + Number(g.stolenBases || 0) * 1.5
    - Number(g.strikeOuts || 0) * 0.3;
}

function parseInnings(ip: unknown): number {
  var raw = Number(ip || 0);
  var full = Math.floor(raw);
  var outs = Math.round((raw - full) * 10);
  return full + outs / 3;
}

function pitcherGameScore(g: GameEntry): number {
  var ip = parseInnings(g.inningsPitched);
  var er = Number(g.earnedRuns || 0);
  var k = Number(g.strikeOuts || 0);
  if (ip === 0) return 0;
  var era = (er / ip) * 9;
  var score = ip * 2 + k - era * 1.5;
  if (Number(g.wins || 0) > 0) score += 3;
  if (Number(g.saves || 0) > 0) score += 3;
  return score;
}

function gameRowBg(score: number): string {
  if (score >= 5) return "bg-sem-success-subtle";
  if (score >= 3) return "";
  if (score <= 0) return "bg-sem-risk-subtle";
  return "";
}

interface Headline {
  source: string;
  title: string;
  date: string;
  link?: string;
  injury_flag?: boolean;
}

function relativeTime(dateStr: string): string {
  if (!dateStr) return "";
  try {
    var d = new Date(dateStr);
    var now = new Date();
    var diffMs = now.getTime() - d.getTime();
    var mins = Math.floor(diffMs / 60000);
    if (mins < 60) return mins + "m";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h";
    var days = Math.floor(hrs / 24);
    if (days < 7) return days + "d";
    return Math.floor(days / 7) + "w";
  } catch (_) { return ""; }
}

function sourceColor(source: string): string {
  if (source.indexOf("ESPN") >= 0) return "bg-sem-risk-subtle text-sem-risk";
  if (source.indexOf("RotoWire") >= 0 || source.indexOf("Yahoo") >= 0) return "bg-sem-info-subtle text-sem-info";
  if (source.indexOf("FanGraphs") >= 0 || source.indexOf("MLB") >= 0) return "bg-sem-success-subtle text-sem-success";
  return "bg-muted text-muted-foreground";
}

function sourceLabel(source: string): string {
  return source.replace(" MLB", "").replace(".com", "");
}

function NewsSection({ headlines, app }: { headlines: Headline[]; app: any }) {
  if (!headlines || headlines.length === 0) return null;

  function openLink(url: string) {
    if (app && app.openLink) {
      app.openLink(url);
    }
  }

  return (
    <Card>
      <CardContent className="p-3">
        <Subheading className="mb-2">News</Subheading>
        <div className="space-y-2.5">
          {headlines.map(function (h, i) {
            var hasLink = h.link && h.link.length > 0;
            return (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1 min-w-0">
                  {hasLink ? (
                    <button
                      type="button"
                      onClick={function () { openLink(h.link!); }}
                      className="text-left text-sm leading-snug font-medium hover:text-primary transition-colors group"
                    >
                      <span className="group-hover:underline">{h.title}</span>
                      <ExternalLink className="inline h-3 w-3 ml-1 opacity-40 group-hover:opacity-70 -mt-0.5" />
                    </button>
                  ) : (
                    <p className="text-sm leading-snug font-medium">{h.title}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={"inline-flex px-1.5 py-0 rounded text-[10px] font-semibold " + sourceColor(h.source)}>
                      {sourceLabel(h.source)}
                    </span>
                    {h.date && (
                      <span className="text-[10px] text-muted-foreground">{relativeTime(h.date)}</span>
                    )}
                    {h.injury_flag && (
                      <span className="text-[10px] text-sem-risk font-semibold">INJURY</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

var PCT_BAR_BG: Record<string, string> = { success: "bg-sem-success", info: "bg-sem-info", warning: "bg-sem-warning", risk: "bg-sem-risk", neutral: "bg-muted-foreground/50" };
var PCT_BAR_TEXT: Record<string, string> = { success: "text-sem-success", info: "text-sem-info", warning: "text-sem-warning", risk: "text-sem-risk", neutral: "text-muted-foreground" };

function PercentileBar({ label, pct, value }: { label: string; pct: number | null | undefined; value?: string }) {
  if (pct == null) return null;
  var p = Math.max(0, Math.min(100, Math.round(pct)));
  var tier = pctColor(p);
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-[11px] text-muted-foreground w-[72px] shrink-0 text-right">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={(PCT_BAR_BG[tier] || PCT_BAR_BG.neutral) + " h-full rounded-full transition-all"} style={{ width: p + "%" }} />
      </div>
      <span className={"text-xs font-mono font-bold w-8 text-right tabular-nums " + (PCT_BAR_TEXT[tier] || PCT_BAR_TEXT.neutral)}>{p}</span>
      {value && <span className="text-[10px] text-muted-foreground w-12 text-right font-mono">{value}</span>}
    </div>
  );
}

interface RankingsDef { label: string; pctKey: string; valKey?: string }

var BATTER_RANKINGS: RankingsDef[] = [
  { label: "xwOBA", pctKey: "xwoba", valKey: "xwoba_val" },
  { label: "xBA", pctKey: "xba", valKey: "xba_val" },
  { label: "Exit Velo", pctKey: "exit_velocity", valKey: "ev_val" },
  { label: "Barrel%", pctKey: "barrel_pct", valKey: "barrel_val" },
  { label: "Hard Hit%", pctKey: "hard_hit_pct", valKey: "hh_val" },
  { label: "K%", pctKey: "k_pct" },
  { label: "BB%", pctKey: "bb_pct" },
  { label: "Whiff%", pctKey: "whiff_pct" },
  { label: "Chase%", pctKey: "chase_rate" },
  { label: "Speed", pctKey: "sprint_speed", valKey: "sprint_val" },
];

var PITCHER_RANKINGS: RankingsDef[] = BATTER_RANKINGS.filter(function (d) { return d.pctKey !== "sprint_speed"; });

function LeagueRankings({ percentiles, statcast, isPitcher }: { percentiles: any; statcast: any; isPitcher: boolean }) {
  var metrics = (percentiles && percentiles.metrics) || {};
  if (Object.keys(metrics).length === 0) return null;

  var defs = isPitcher ? PITCHER_RANKINGS : BATTER_RANKINGS;
  var expected = (statcast && statcast.expected) || {};
  var bb = (statcast && statcast.batted_ball) || {};
  var spd = (statcast && statcast.speed) || {};

  // Map raw values for display alongside percentile bars
  var valMap: Record<string, string> = {};
  if (expected.xwoba != null) valMap.xwoba_val = num(expected.xwoba, 3);
  if (expected.xba != null) valMap.xba_val = num(expected.xba, 3);
  if (bb.avg_exit_velo != null) valMap.ev_val = num(bb.avg_exit_velo, 1);
  if (bb.barrel_pct != null) valMap.barrel_val = num(bb.barrel_pct, 1) + "%";
  if (bb.hard_hit_pct != null) valMap.hh_val = num(bb.hard_hit_pct, 1) + "%";
  if (spd.sprint_speed != null) valMap.sprint_val = num(spd.sprint_speed, 1);

  var rendered = defs.filter(function (d) { return metrics[d.pctKey] != null; });
  if (rendered.length === 0) return null;

  var dataSeason = percentiles.data_season;
  var isOldData = dataSeason && dataSeason !== new Date().getFullYear();

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1">
          <Subheading>League Rankings</Subheading>
          {isOldData && <span className="text-[10px] text-muted-foreground">{dataSeason} data</span>}
        </div>
        <div>
          {rendered.map(function (d) {
            var val = d.valKey ? valMap[d.valKey] : undefined;
            return <PercentileBar key={d.pctKey} label={d.label} pct={metrics[d.pctKey]} value={val} />;
          })}
        </div>
        {expected.pa != null && (
          <div className="mt-1.5 text-[10px] text-muted-foreground text-right">{expected.pa + " PA"}</div>
        )}
      </CardContent>
    </Card>
  );
}

function StatRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      <div className="text-right">
        <span className="text-sm font-mono font-bold tabular-nums">{value}</span>
        {sub && <span className="text-xs text-muted-foreground ml-1">{sub}</span>}
      </div>
    </div>
  );
}

function HeroStat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center min-w-0">
      <span className={"font-mono font-bold leading-tight tabular-nums " + (accent ? "text-xl text-sem-success" : "text-base")}>{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight mt-0.5">{label}</span>
    </div>
  );
}

function BatterGameLog({ games }: { games: GameEntry[] }) {
  if (!games || games.length === 0) return null;
  return (
    <div className="mcp-app-scroll-x">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-1 pr-2 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide whitespace-nowrap">Date</th>
            <th className="text-left py-1 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide whitespace-nowrap">Opp</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">AB</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">H</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">R</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">HR</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">RBI</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">BB</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">K</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">SB</th>
          </tr>
        </thead>
        <tbody>
          {games.map(function (g, i) {
            var score = batterGameScore(g);
            var logo = teamLogoFromName(g.opponent);
            return (
              <tr key={i} className={"border-b border-border/30 transition-colors " + gameRowBg(score)}>
                <td className="py-1 pr-2 font-mono text-muted-foreground whitespace-nowrap">{formatDate(g.date)}</td>
                <td className="py-1 px-1 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    {logo && <img src={logo} alt="" className="w-3.5 h-3.5" />}
                    <span className="text-muted-foreground">{shortTeam(g.opponent)}</span>
                  </span>
                </td>
                <td className="text-center py-1 px-1 font-mono">{num(g.atBats)}</td>
                <td className={"text-center py-1 px-1 font-mono font-semibold " + (Number(g.hits || 0) >= 2 ? "text-sem-success" : "")}>{num(g.hits)}</td>
                <td className="text-center py-1 px-1 font-mono">{num(g.runs)}</td>
                <td className={"text-center py-1 px-1 font-mono font-semibold " + (Number(g.homeRuns || 0) > 0 ? "text-sem-success" : "")}>{num(g.homeRuns)}</td>
                <td className={"text-center py-1 px-1 font-mono " + (Number(g.rbi || 0) >= 2 ? "font-semibold" : "")}>{num(g.rbi)}</td>
                <td className="text-center py-1 px-1 font-mono">{num(g.baseOnBalls)}</td>
                <td className={"text-center py-1 px-1 font-mono " + (Number(g.strikeOuts || 0) >= 3 ? "text-sem-risk" : "")}>{num(g.strikeOuts)}</td>
                <td className={"text-center py-1 px-1 font-mono " + (Number(g.stolenBases || 0) > 0 ? "font-semibold text-sem-info" : "")}>{num(g.stolenBases)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PitcherGameLog({ games }: { games: GameEntry[] }) {
  if (!games || games.length === 0) return null;
  return (
    <div className="mcp-app-scroll-x">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-1 pr-2 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide whitespace-nowrap">Date</th>
            <th className="text-left py-1 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide whitespace-nowrap">Opp</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">IP</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">H</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">ER</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">K</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">BB</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Dec</th>
          </tr>
        </thead>
        <tbody>
          {games.map(function (g, i) {
            var score = pitcherGameScore(g);
            var dec = Number(g.wins || 0) > 0 ? "W" : Number(g.losses || 0) > 0 ? "L" : Number(g.saves || 0) > 0 ? "SV" : Number(g.holds || 0) > 0 ? "HLD" : "\u2014";
            var decColor = dec === "W" || dec === "SV" ? "text-sem-success font-semibold" : dec === "L" ? "text-sem-risk font-semibold" : "";
            var logo = teamLogoFromName(g.opponent);
            return (
              <tr key={i} className={"border-b border-border/30 transition-colors " + gameRowBg(score)}>
                <td className="py-1 pr-2 font-mono text-muted-foreground whitespace-nowrap">{formatDate(g.date)}</td>
                <td className="py-1 px-1 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    {logo && <img src={logo} alt="" className="w-3.5 h-3.5" />}
                    <span className="text-muted-foreground">{shortTeam(g.opponent)}</span>
                  </span>
                </td>
                <td className={"text-center py-1 px-1 font-mono " + (parseInnings(g.inningsPitched) >= 6 ? "font-semibold text-sem-success" : "")}>{g.inningsPitched || "\u2014"}</td>
                <td className="text-center py-1 px-1 font-mono">{num(g.hits)}</td>
                <td className={"text-center py-1 px-1 font-mono " + (Number(g.earnedRuns || 0) >= 4 ? "text-sem-risk font-semibold" : Number(g.earnedRuns || 0) === 0 ? "text-sem-success" : "")}>{num(g.earnedRuns)}</td>
                <td className={"text-center py-1 px-1 font-mono " + (Number(g.strikeOuts || 0) >= 8 ? "font-semibold text-sem-success" : "")}>{num(g.strikeOuts)}</td>
                <td className="text-center py-1 px-1 font-mono">{num(g.baseOnBalls)}</td>
                <td className={"text-center py-1 px-1 font-mono " + decColor}>{dec}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BatterCareerTable({ seasons }: { seasons: Record<string, unknown>[] }) {
  if (!seasons || seasons.length === 0) return null;
  return (
    <div className="mcp-app-scroll-x">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-1.5 pr-1.5 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide whitespace-nowrap">Yr</th>
            <th className="text-left py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide whitespace-nowrap">Tm</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">G</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">AVG</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">OPS</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">HR</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">RBI</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">SB</th>
          </tr>
        </thead>
        <tbody>
          {seasons.map(function (s, i) {
            var isCurrentYear = String(s.season) === String(new Date().getFullYear());
            var logo = teamLogoFromName(String(s.team || ""));
            return (
              <tr key={i} className={"border-b border-border/30 " + (isCurrentYear ? "bg-sem-info-subtle font-semibold" : i % 2 === 0 ? "" : "bg-muted/30")}>
                <td className="py-1 pr-1.5 font-mono text-muted-foreground whitespace-nowrap">{"\u2019" + String(s.season).slice(-2)}</td>
                <td className="py-1 px-1 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    {logo && <img src={logo} alt="" className="w-3.5 h-3.5" />}
                    <span className="text-muted-foreground">{teamAbbrevFromName(String(s.team || "")) || shortTeam(String(s.team || ""))}</span>
                  </span>
                </td>
                <td className="text-center py-1 px-1 font-mono">{num(s.gamesPlayed)}</td>
                <td className={"text-center py-1 px-1 font-mono " + (Number(s.avg || 0) >= 0.300 ? "text-sem-success font-semibold" : "")}>{s.avg || "\u2014"}</td>
                <td className={"text-center py-1 px-1 font-mono " + (Number(s.ops || 0) >= 0.850 ? "text-sem-success font-semibold" : "")}>{s.ops || "\u2014"}</td>
                <td className={"text-center py-1 px-1 font-mono " + (Number(s.homeRuns || 0) >= 30 ? "text-sem-success font-semibold" : "")}>{num(s.homeRuns)}</td>
                <td className="text-center py-1 px-1 font-mono">{num(s.rbi)}</td>
                <td className="text-center py-1 px-1 font-mono">{num(s.stolenBases)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PitcherCareerTable({ seasons }: { seasons: Record<string, unknown>[] }) {
  if (!seasons || seasons.length === 0) return null;
  return (
    <div className="mcp-app-scroll-x">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-1.5 pr-1.5 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide whitespace-nowrap">Yr</th>
            <th className="text-left py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide whitespace-nowrap">Tm</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">ERA</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">W-L</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">IP</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">K</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">WHIP</th>
            <th className="text-center py-1.5 px-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">SV</th>
          </tr>
        </thead>
        <tbody>
          {seasons.map(function (s, i) {
            var isCurrentYear = String(s.season) === String(new Date().getFullYear());
            var logo = teamLogoFromName(String(s.team || ""));
            return (
              <tr key={i} className={"border-b border-border/30 " + (isCurrentYear ? "bg-sem-info-subtle font-semibold" : i % 2 === 0 ? "" : "bg-muted/30")}>
                <td className="py-1 pr-1.5 font-mono text-muted-foreground whitespace-nowrap">{"\u2019" + String(s.season).slice(-2)}</td>
                <td className="py-1 px-1 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    {logo && <img src={logo} alt="" className="w-3.5 h-3.5" />}
                    <span className="text-muted-foreground">{teamAbbrevFromName(String(s.team || "")) || shortTeam(String(s.team || ""))}</span>
                  </span>
                </td>
                <td className={"text-center py-1 px-1 font-mono " + (Number(s.era || 99) <= 3.00 ? "text-sem-success font-semibold" : Number(s.era || 99) >= 5.00 ? "text-sem-risk" : "")}>{s.era || "\u2014"}</td>
                <td className="text-center py-1 px-1 font-mono">{num(s.wins) + "-" + num(s.losses)}</td>
                <td className="text-center py-1 px-1 font-mono">{s.inningsPitched || "\u2014"}</td>
                <td className={"text-center py-1 px-1 font-mono " + (Number(s.strikeOuts || 0) >= 200 ? "text-sem-success font-semibold" : "")}>{num(s.strikeOuts)}</td>
                <td className={"text-center py-1 px-1 font-mono " + (Number(s.whip || 99) <= 1.00 ? "text-sem-success font-semibold" : "")}>{s.whip || "\u2014"}</td>
                <td className="text-center py-1 px-1 font-mono">{num(s.saves)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PlayerReportView({ data, app, navigate }: { data: PlayerReportData; app: any; navigate: (data: any) => void }) {
  var ctx = useAppContextSafe();
  var goBack = ctx?.goBack;

  var sc = data.statcast || {} as any;
  var trends = data.trends || {} as any;
  var splits = trends.splits || {};
  var ys = data.yahoo_stats || {};
  var isPitcher = sc.player_type === "pitcher" || trends.player_type === "pitcher";
  var gameLog: GameEntry[] = trends.game_log || [];
  var careerStats: Record<string, unknown>[] = trends.career_stats || [];
  var val = data.valuation || {} as any;
  var newsCtx = (data as any).news_context || {};
  var headlines: Headline[] = newsCtx.headlines || [];

  var eraAnalysis = sc.era_analysis || {};
  var stuffMetrics = sc.stuff_metrics || {};
  var expected = sc.expected || {};
  var battedBall = sc.batted_ball || {};
  var percentiles = data.percentiles || {};

  var hasYahooStats = Object.keys(ys).length > 0 && Object.values(ys).some(function (v) { return v != null && v !== "" && v !== "-" && v !== 0; });
  var qualityTier = sc.quality_tier || expected.quality_tier;
  var tc = qualityTier ? tierColor(qualityTier) : "neutral";

  return (
    <div className="space-y-3 animate-stagger min-w-0">
      {/* Back button */}
      {goBack && (
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-2 px-1 -ml-1 rounded-md hover:bg-muted/50"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Back</span>
        </button>
      )}

      {/* Hero */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            {data.mlb_id && (
              <Avatar className={"size-14 shrink-0 ring-2 " + (TIER_STYLE[tc] || TIER_STYLE.neutral).ring}>
                <AvatarImage src={mlbHeadshotUrl(data.mlb_id)} />
                <AvatarFallback className="text-lg font-bold">{data.name.charAt(0)}</AvatarFallback>
              </Avatar>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xl font-bold truncate leading-tight">{data.name}</p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {val.rank > 0 && (
                  <Badge className="bg-sem-info-subtle border border-sem-info-border text-sem-info">
                    {"#" + val.rank + " " + (val.type === "P" ? "SP" : "Batter")}
                  </Badge>
                )}
                {qualityTier && (
                  <Badge className={"border " + (TIER_STYLE[tc] || TIER_STYLE.neutral).bg + " " + (TIER_STYLE[tc] || TIER_STYLE.neutral).text}>
                    {qualityTier}
                  </Badge>
                )}
                {val.pos && (
                  <span className="text-xs text-muted-foreground">{val.pos}</span>
                )}
              </div>
            </div>
            {val.z_final != null && val.z_final !== 0 && (function () {
              var zc = val.z_final >= 12 ? "success" : val.z_final >= 0 ? "info" : "risk";
              var zStyle = TIER_STYLE[zc] || TIER_STYLE.neutral;
              return (
                <div className={"flex flex-col items-center justify-center shrink-0 rounded-lg px-2.5 py-1.5 border " + zStyle.bg}>
                  <span className={"text-2xl font-bold font-mono leading-none tabular-nums " + zStyle.text}>{num(val.z_final, 1)}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-0.5">z-score</span>
                </div>
              );
            })()}
          </div>

          {/* Hero Stats */}
          {hasYahooStats && (
            <div className="flex items-center justify-around mt-3 pt-3 border-t border-border/50">
              {isPitcher ? (<>
                <HeroStat value={num(ys.ERA, 2)} label="ERA" accent={Number(ys.ERA || 99) < 3.50} />
                <HeroStat value={num(ys.WHIP, 2)} label="WHIP" accent={Number(ys.WHIP || 99) < 1.15} />
                <HeroStat value={num(ys.W)} label="W" />
                <HeroStat value={num(ys.K)} label="K" accent={Number(ys.K || 0) >= 50} />
                <HeroStat value={num(ys.QS)} label="QS" />
              </>) : (<>
                <HeroStat value={num(ys.AVG, 3)} label="AVG" accent={Number(ys.AVG || 0) >= 0.280} />
                <HeroStat value={num(ys.HR)} label="HR" accent={Number(ys.HR || 0) >= 10} />
                <HeroStat value={num(ys.RBI)} label="RBI" accent={Number(ys.RBI || 0) >= 25} />
                <HeroStat value={num(ys.R)} label="R" />
                <HeroStat value={num(ys.NSB)} label="NSB" accent={Number(ys.NSB || 0) >= 5} />
              </>)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Game Log */}
      {gameLog.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1.5">
              <Subheading>Game Log</Subheading>
              <span className="text-xs text-muted-foreground">{trends.games_total ? "Last " + gameLog.length + " of " + trends.games_total + "g" : gameLog.length + " games"}</span>
            </div>
            {isPitcher ? (
              <PitcherGameLog games={gameLog} />
            ) : (
              <BatterGameLog games={gameLog} />
            )}
          </CardContent>
        </Card>
      )}

      {/* News */}
      <NewsSection headlines={headlines} app={app} />

      {/* Advanced Metrics */}
      {sc && (isPitcher ? (
        <div className="kpi-grid">
          {eraAnalysis.era != null && (
            <KpiTile value={num(eraAnalysis.era, 2)} label="ERA" color={Number(eraAnalysis.era) < 3.5 ? "success" : Number(eraAnalysis.era) < 4.5 ? "warning" : "risk"} />
          )}
          {eraAnalysis.fip != null && (
            <KpiTile value={num(eraAnalysis.fip, 2)} label="FIP" color={Number(eraAnalysis.fip) < 3.5 ? "success" : Number(eraAnalysis.fip) < 4.5 ? "warning" : "risk"} />
          )}
          {eraAnalysis.xera != null && (
            <KpiTile value={num(eraAnalysis.xera, 2)} label="xERA" color={Number(eraAnalysis.xera) < 3.5 ? "success" : Number(eraAnalysis.xera) < 4.5 ? "warning" : "risk"} />
          )}
          {stuffMetrics.stuff_plus != null && (
            <KpiTile value={num(stuffMetrics.stuff_plus)} label="Stuff+" color={Number(stuffMetrics.stuff_plus) > 110 ? "success" : Number(stuffMetrics.stuff_plus) > 95 ? "info" : "warning"} />
          )}
        </div>
      ) : (
        <div className="kpi-grid">
          {expected.xba != null && (
            <KpiTile value={num(expected.xba, 3)} label={"xBA" + (expected.xba_pct != null ? " (" + num(expected.xba_pct) + "th)" : "")} color={pctColor(expected.xba_pct)} />
          )}
          {expected.xslg != null && (
            <KpiTile value={num(expected.xslg, 3)} label="xSLG" color={pctColor(expected.xslg_pct)} />
          )}
          {battedBall.barrel_pct != null && (
            <KpiTile value={num(battedBall.barrel_pct, 1) + "%"} label={"Barrel%" + (battedBall.barrel_pct_rank != null ? " (" + num(battedBall.barrel_pct_rank) + "th)" : "")} color={pctColor(battedBall.barrel_pct_rank)} />
          )}
          {battedBall.avg_exit_velo != null && (
            <KpiTile value={num(battedBall.avg_exit_velo, 1)} label={"Exit Velo" + (battedBall.ev_pct != null ? " (" + num(battedBall.ev_pct) + "th)" : "")} color={pctColor(battedBall.ev_pct)} />
          )}
        </div>
      ))}

      {/* League Rankings (Savant percentile bars) */}
      <LeagueRankings percentiles={percentiles} statcast={sc} isPitcher={isPitcher} />

      {/* Recent Trends */}
      {splits && Object.keys(splits).length > 0 && (
        <Card>
          <CardContent className="p-3">
            <Subheading className="mb-1">Recent Trends</Subheading>
            {isPitcher ? (
              <div className="grid grid-cols-2 gap-x-4">
                {splits.era_14d != null && <StatRow label="14d ERA" value={num(splits.era_14d, 2)} />}
                {splits.era_30d != null && <StatRow label="30d ERA" value={num(splits.era_30d, 2)} />}
                {splits.k_14d != null && <StatRow label="14d K" value={num(splits.k_14d)} />}
                {splits.k_30d != null && <StatRow label="30d K" value={num(splits.k_30d)} />}
                {splits.whip_14d != null && <StatRow label="14d WHIP" value={num(splits.whip_14d, 2)} />}
                {splits.ip_14d != null && <StatRow label="14d IP" value={num(splits.ip_14d, 1)} />}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-4">
                {splits.avg_14d != null && <StatRow label="14d AVG" value={num(splits.avg_14d, 3)} />}
                {splits.avg_30d != null && <StatRow label="30d AVG" value={num(splits.avg_30d, 3)} />}
                {splits.ops_14d != null && <StatRow label="14d OPS" value={num(splits.ops_14d, 3)} />}
                {splits.ops_30d != null && <StatRow label="30d OPS" value={num(splits.ops_30d, 3)} />}
                {splits.hr_14d != null && <StatRow label="14d HR" value={num(splits.hr_14d)} />}
                {splits.rbi_14d != null && <StatRow label="14d RBI" value={num(splits.rbi_14d)} />}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Career Stats */}
      {careerStats.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1.5">
              <Subheading>Career</Subheading>
              <span className="text-xs text-muted-foreground">{careerStats.length + " seasons"}</span>
            </div>
            {isPitcher ? (
              <PitcherCareerTable seasons={careerStats} />
            ) : (
              <BatterCareerTable seasons={careerStats} />
            )}
          </CardContent>
        </Card>
      )}

      {/* AI Recommendation */}
      {data.ai_recommendation && (
        <Card>
          <CardContent className="p-3">
            <Subheading className="mb-1">AI Analysis</Subheading>
            <p className="text-sm text-muted-foreground leading-relaxed">{data.ai_recommendation}</p>
          </CardContent>
        </Card>
      )}

      {/* Full Intel Panel */}
      <IntelPanel intel={data} defaultExpanded />
    </div>
  );
}
