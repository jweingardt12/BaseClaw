import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingIndicator } from "@/shared/loading-indicator";
import { EmptyMessage } from "@/shared/empty-message";
import { KpiTile } from "@/shared/kpi-tile";
import { RefreshButton } from "@/shared/refresh-button";
import { useCallTool } from "../shared/use-call-tool";
import { PlayerRowData } from "../shared/player-row";
import { TeamLogo } from "../shared/team-logo";
import { qualityColor, hotColdIcon, SampleBadge } from "../shared/intel-badge";

/* ── Constants ────────────────────────────────────────────── */

var BATTER_STAT_KEYS = ["AVG", "HR", "RBI", "OBP", "R", "SB", "H", "TB", "XBH"];
var PITCHER_STAT_KEYS = ["ERA", "WHIP", "K", "W", "IP", "QS", "SV", "HLD"];
var PITCHER_POS = new Set(["SP", "RP", "P"]);
var HIDDEN_POSITIONS = new Set(["Util", "BN", "IL", "IL+", "DL", "NA"]);

/* ── Helpers ──────────────────────────────────────────────── */

function pickStats(stats: Record<string, any> | undefined, keys: string[]): Array<{ key: string; val: string }> {
  if (!stats) return [];
  var result: Array<{ key: string; val: string }> = [];
  for (var k of keys) {
    var v = stats[k];
    if (v != null && v !== "" && v !== 0) {
      result.push({ key: k, val: String(v) });
    }
    if (result.length >= 3) break;
  }
  return result;
}

function isPitcher(p: PlayerRowData): boolean {
  if (PITCHER_POS.has(p.position || "")) return true;
  var elig = p.eligible_positions || [];
  for (var i = 0; i < elig.length; i++) {
    if (PITCHER_POS.has(elig[i])) return true;
  }
  return false;
}

function isIL(p: PlayerRowData): boolean {
  return p.position === "IL" || p.position === "IL+" || p.position === "NA";
}

/* ── Main component ──────────────────────────────────────── */

interface RosterData {
  players: PlayerRowData[];
  ai_recommendation?: string | null;
}

export function RosterView({ data, app, navigate }: { data: RosterData; app: any; navigate: (data: any) => void }) {
  var { loading } = useCallTool(app);
  var [loadingPlayer, setLoadingPlayer] = useState<string | null>(null);
  var [activeTab, setActiveTab] = useState("batters");

  var players = data.players || [];
  var ilPlayers = players.filter(isIL);
  var hasNA = ilPlayers.some(function (p) { return p.position === "NA"; });
  var active = players.filter(function (p) { return !isIL(p); });
  var batters = active.filter(function (p) { return !isPitcher(p); });
  var pitchers = active.filter(isPitcher);
  var injuredCount = players.filter(function (p) { return p.status && p.status !== "Healthy"; }).length;
  var withGames = players.filter(function (p) { return !!p.opponent; }).length;
  var displayed = activeTab === "batters" ? batters : activeTab === "pitchers" ? pitchers : ilPlayers;

  var handlePlayerTap = async function (p: PlayerRowData) {
    if (loadingPlayer) return;
    setLoadingPlayer(p.name);
    try {
      var result = await app.callServerTool({ name: "yahoo_player_intel", arguments: { player: p.name } });
      if (result && result.structuredContent) {
        navigate(result.structuredContent);
      }
    } catch (_e) {
      if (app && app.openLink) {
        var slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        app.openLink("https://www.fangraphs.com/players/" + slug);
      }
    } finally {
      setLoadingPlayer(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Roster</h2>
        {app && navigate && (
          <RefreshButton app={app} toolName="yahoo_roster" navigate={navigate} />
        )}
      </div>

      {/* KPI tiles */}
      <div className="kpi-grid">
        <KpiTile value={players.length} label="Roster" color="primary" />
        <KpiTile value={injuredCount} label="Injured" color={injuredCount > 0 ? "risk" : "success"} />
        <KpiTile value={withGames} label="Playing" color={withGames > 0 ? "info" : "neutral"} />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} aria-label="Roster sections">
        <TabsList className="gap-1">
          <TabsTrigger value="batters">{"Batters (" + batters.length + ")"}</TabsTrigger>
          <TabsTrigger value="pitchers">{"Pitchers (" + pitchers.length + ")"}</TabsTrigger>
          {ilPlayers.length > 0 && (
            <TabsTrigger value="il">{(hasNA ? "IL/NA" : "IL") + " (" + ilPlayers.length + ")"}</TabsTrigger>
          )}
        </TabsList>
      </Tabs>

      {/* Player list */}
      <div className="relative">
        {loading && <div className="loading-overlay"><LoadingIndicator size={24} /></div>}

        {displayed.length === 0 ? (
          <EmptyMessage title="No players" description="This section is empty." />
        ) : (
          <div className="rounded-lg border border-border/60 overflow-hidden divide-y divide-border/40">
            {displayed.map(function (p) {
              var pos = p.position || "?";
              var hasStatus = p.status && p.status !== "Healthy";
              var elig = (p.eligible_positions || []).filter(function (e) {
                return e !== pos && !HIDDEN_POSITIONS.has(e);
              });
              var tier = p.intel && p.intel.statcast && p.intel.statcast.quality_tier || null;
              var hotCold = p.intel && p.intel.trends && p.intel.trends.hot_cold || null;
              var showHotCold = hotCold && hotCold !== "neutral";
              var statKeys = isPitcher(p) ? PITCHER_STAT_KEYS : BATTER_STAT_KEYS;
              var keyStats = pickStats(p.stats, statKeys);
              var oppAbbrev = p.opponent ? p.opponent.replace(/^(vs |@)/, "") : "";

              return (
                <div
                  key={p.player_id || p.name}
                  className={"flex items-center gap-3 py-2.5 px-3 cursor-pointer transition-colors hover:bg-muted/50 " + (loadingPlayer === p.name ? "opacity-50" : "")}
                  onClick={function () { handlePlayerTap(p); }}
                >
                  {/* Position badge */}
                  <Badge
                    variant="secondary"
                    className="font-mono font-bold min-w-[36px] justify-center shrink-0 text-xs"
                  >
                    {pos}
                  </Badge>

                  {/* Player info */}
                  <div className="flex-1 min-w-0">
                    {/* Name row */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      {p.team && <TeamLogo abbrev={p.team} size={18} />}
                      <span className="font-medium truncate text-sm">
                        {loadingPlayer === p.name && <LoadingIndicator size={12} className="inline mr-1" />}
                        {p.name}
                      </span>
                      {tier && <span className={"w-2 h-2 rounded-full shrink-0 " + qualityColor(tier)} title={tier} />}
                      {showHotCold && <span className="text-xs shrink-0" title={hotCold || ""}>{hotColdIcon(hotCold)}</span>}
                      {hasStatus && <Badge variant="destructive" className="text-[10px] shrink-0 ml-0.5">{p.status}</Badge>}
                    </div>

                    {/* Stats line */}
                    {keyStats.length > 0 && (
                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground font-mono">
                        {keyStats.map(function (s) {
                          return (
                            <span key={s.key}>
                              <span className="opacity-60">{s.key}</span>
                              {" "}
                              <span className="text-foreground">{s.val}</span>
                            </span>
                          );
                        })}
                        <SampleBadge sample={p.sample} />
                      </div>
                    )}

                    {/* Eligibility + opponent */}
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                      {elig.length > 0 && (
                        <span>{elig.join(", ")}</span>
                      )}
                      {elig.length > 0 && p.opponent && <span className="opacity-40">|</span>}
                      {p.opponent && (
                        <span className={"inline-flex items-center gap-1 " + (p.opponent.indexOf("vs ") === 0 ? "text-sem-success" : "")}>
                          <TeamLogo abbrev={oppAbbrev} size={12} />
                          {(p as any).game_time ? (p as any).game_time + " " : ""}{p.opponent}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Chevron */}
                  <span className="text-muted-foreground/30 text-lg shrink-0">{"\u203A"}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
