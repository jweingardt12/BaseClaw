import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { LoadingIndicator } from "@/shared/loading-indicator";
import { EmptyMessage } from "@/shared/empty-message";
import { useCallTool } from "../shared/use-call-tool";
import { PlayerRowData } from "../shared/player-row";
import { TeamLogo } from "../shared/team-logo";
import { qualityColor, hotColdIcon, SampleBadge } from "../shared/intel-badge";
import { TrendIndicator } from "../shared/trend-indicator";

function getPositions(p: PlayerRowData): string {
  if (p.eligible_positions) return Array.isArray(p.eligible_positions) ? p.eligible_positions.join(", ") : String(p.eligible_positions);
  if (p.positions) return Array.isArray(p.positions) ? p.positions.join(", ") : String(p.positions);
  return "";
}

function dig(obj: any, path: string): any {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur == null) return null;
    cur = cur[parts[i]];
  }
  return cur;
}

function fmt(val: any, decimals?: number): string {
  if (val == null) return "-";
  if (typeof val === "number") return decimals != null ? val.toFixed(decimals) : String(val);
  return String(val);
}

/* ── Stat view definitions ────────────────────────────────── */

interface StatDef { label: string; path: string; decimals?: number; suffix?: string; pctPath?: string }

var BATTER_STATCAST: StatDef[] = [
  { label: "xwOBA", path: "intel.statcast.expected.xwoba", decimals: 3, pctPath: "intel.statcast.expected.xwoba_pct" },
  { label: "EV", path: "intel.statcast.batted_ball.avg_exit_velo", decimals: 1 },
  { label: "Brl%", path: "intel.statcast.batted_ball.barrel_pct", decimals: 1, suffix: "%", pctPath: "intel.statcast.batted_ball.barrel_pct_rank" },
  { label: "Spd", path: "intel.statcast.speed.sprint_speed", decimals: 1 },
  { label: "BatSpd", path: "intel.statcast.bat_tracking.bat_speed", decimals: 1 },
];

var PITCHER_STATCAST: StatDef[] = [
  { label: "xwOBA", path: "intel.statcast.expected.xwoba", decimals: 3, pctPath: "intel.statcast.expected.xwoba_pct" },
  { label: "EV", path: "intel.statcast.batted_ball.avg_exit_velo", decimals: 1 },
  { label: "Brl%", path: "intel.statcast.batted_ball.barrel_pct", decimals: 1, suffix: "%" },
  { label: "Stuff+", path: "intel.statcast.stuff_plus", decimals: 0 },
];

var BATTER_PROCESS: StatDef[] = [
  { label: "K%", path: "intel.discipline.k_rate", decimals: 1, suffix: "%" },
  { label: "BB%", path: "intel.discipline.bb_rate", decimals: 1, suffix: "%" },
  { label: "O-Sw%", path: "intel.discipline.o_swing_pct", decimals: 1, suffix: "%" },
  { label: "BABIP", path: "advanced.babip", decimals: 3 },
  { label: "HR/FB", path: "advanced.hr_fb_rate", decimals: 1, suffix: "%" },
];

var PITCHER_PROCESS: StatDef[] = [
  { label: "K%", path: "intel.discipline.k_rate", decimals: 1, suffix: "%" },
  { label: "BB%", path: "intel.discipline.bb_rate", decimals: 1, suffix: "%" },
  { label: "SIERA", path: "advanced.siera", decimals: 2 },
  { label: "BABIP", path: "advanced.babip", decimals: 3 },
  { label: "LOB%", path: "advanced.lob_pct", decimals: 1, suffix: "%" },
];

var PITCHER_POS = new Set(["SP", "RP", "P"]);
function isPitcherPlayer(p: PlayerRowData): boolean {
  var positions = getPositions(p);
  return positions.split(",").some(function (pos) { return PITCHER_POS.has(pos.trim()); });
}

interface FreeAgentsData {
  type: string;
  pos_type?: string;
  count?: number;
  query?: string;
  players?: PlayerRowData[];
  results?: PlayerRowData[];
  ai_recommendation?: string | null;
}

export function FreeAgentsView({ data, app, navigate }: { data: FreeAgentsData; app: any; navigate: (data: any) => void }) {
  var { callTool, loading } = useCallTool(app);
  var [searchQuery, setSearchQuery] = useState("");
  var [addTarget, setAddTarget] = useState<PlayerRowData | null>(null);
  var [activeTab, setActiveTab] = useState(data.pos_type || "B");
  var [statView, setStatView] = useState("overview");
  var players = data.players || data.results || [];

  var title = data.type === "search"
    ? "Search Results: " + (data.query || "")
    : "Free Agents (" + (data.pos_type === "P" ? "Pitchers" : "Batters") + ")";

  var handleTabChange = async function (value: string) {
    setActiveTab(value);
    var result = await callTool("yahoo_free_agents", { pos_type: value, count: 20 });
    if (result) {
      navigate(result.structuredContent);
    }
  };

  var handleSearch = async function (e: any) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    var result = await callTool("yahoo_search", { player_name: searchQuery });
    if (result) {
      navigate(result.structuredContent);
    }
  };

  var handleAdd = async function () {
    if (!addTarget) return;
    var result = await callTool("yahoo_add", { player_id: addTarget.player_id });
    setAddTarget(null);
    if (result) {
      navigate(result.structuredContent);
    }
  };

  var handlePlayerTap = async function (p: PlayerRowData) {
    try {
      var result = await app.callServerTool({ name: "yahoo_player_intel", arguments: { player: p.name } });
      if (result && result.structuredContent) {
        navigate(result.structuredContent);
      }
    } catch (_e) { /* ignore */ }
  };

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>

      {data.type !== "search" && (
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="gap-1">
            <TabsTrigger value="B">Batters</TabsTrigger>
            <TabsTrigger value="P">Pitchers</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          placeholder="Search players..."
          value={searchQuery}
          onChange={function (e: any) { setSearchQuery(e.target.value); }}
        />
        <Button type="submit" variant="secondary" disabled={loading}>
          {loading ? <LoadingIndicator size={16} /> : "Search"}
        </Button>
      </form>

      {/* Stat view toggle */}
      <Tabs value={statView} onValueChange={setStatView}>
        <TabsList className="gap-0.5 h-7">
          <TabsTrigger value="overview" className="text-[10px] px-2 h-6">Overview</TabsTrigger>
          <TabsTrigger value="statcast" className="text-[10px] px-2 h-6">Statcast</TabsTrigger>
          <TabsTrigger value="process" className="text-[10px] px-2 h-6">Process</TabsTrigger>
          <TabsTrigger value="value" className="text-[10px] px-2 h-6">Value</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="relative">
        {loading && <div className="loading-overlay"><LoadingIndicator size={20} /></div>}

        {players.length === 0 ? (
          <EmptyMessage title="No players found" description="Try a different search or position filter." />
        ) : (
          <div className="rounded-lg border border-border/60 overflow-hidden divide-y divide-border/40">
            {players.map(function (p) {
              var positions = getPositions(p);
              var hasStatus = p.status && p.status !== "Healthy";
              var tier = p.intel && p.intel.statcast && p.intel.statcast.quality_tier || null;
              var hotCold = p.intel && p.intel.trends && p.intel.trends.hot_cold || null;
              var showHotCold = hotCold && hotCold !== "neutral";
              var pct = p.percent_owned != null ? p.percent_owned : p.pct;
              var isPit = isPitcherPlayer(p);
              var gameTime = (p as any).game_time;
              var gameStatus = (p as any).game_status;
              var opponent = (p as any).opponent;
              var gameScore = (p as any).game_score;
              var gameInning = (p as any).game_inning;
              var oppAbbrev = opponent ? opponent.replace(/^(vs |@)/, "") : "";

              // Build game status display
              var gameDisplay = "";
              if (gameStatus === "In Progress" && gameInning && gameScore) {
                gameDisplay = gameInning + " \u00B7 " + gameScore;
              } else if (gameStatus === "Final" && gameScore) {
                gameDisplay = "Final " + gameScore;
              } else if (gameTime && opponent) {
                gameDisplay = gameTime;
              }

              // Stat view data
              var statDefs: StatDef[] = [];
              if (statView === "statcast") {
                statDefs = isPit ? PITCHER_STATCAST : BATTER_STATCAST;
              } else if (statView === "process") {
                statDefs = isPit ? PITCHER_PROCESS : BATTER_PROCESS;
              }

              return (
                <div key={p.player_id || p.name} className="flex items-center gap-3 py-2.5 px-3">
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={function () { handlePlayerTap(p); }}
                  >
                    {/* Name row */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      {p.team && <TeamLogo abbrev={p.team} size={18} />}
                      <span className="font-medium truncate text-sm">{p.name}</span>
                      {tier && <span className={"w-2 h-2 rounded-full shrink-0 " + qualityColor(tier)} title={tier} />}
                      {showHotCold && <span className="text-xs shrink-0" title={hotCold || ""}>{hotColdIcon(hotCold)}</span>}
                      {hasStatus && <Badge variant="destructive" className="text-[10px] shrink-0 ml-0.5">{p.status}</Badge>}
                    </div>

                    {/* Info line: position + ownership + sample + game */}
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                      {positions && <span>{positions}</span>}
                      {pct != null && (
                        <span className="inline-flex items-center gap-1">
                          {pct + "%"}
                          {p.trend && <TrendIndicator trend={p.trend} />}
                        </span>
                      )}
                      <SampleBadge sample={p.sample} />
                      {opponent && (
                        <span className={"inline-flex items-center gap-1 " + (opponent.indexOf("vs ") === 0 ? "text-sem-success" : "")}>
                          <TeamLogo abbrev={oppAbbrev} size={10} />
                          {gameDisplay ? gameDisplay + " " + opponent : opponent}
                        </span>
                      )}
                    </div>

                    {/* Stat view: Overview */}
                    {statView === "overview" && (
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                        {p.z_score != null && p.z_score !== 0 && (
                          <span className="font-mono">{"z=" + (typeof p.z_score === "number" ? p.z_score.toFixed(2) : p.z_score)}</span>
                        )}
                        {p.tier && <Badge variant="secondary" className="text-[9px] h-3.5">{p.tier}</Badge>}
                        {(p as any).advanced && (p as any).advanced.babip != null && (
                          <span className="font-mono">{"BABIP " + fmt((p as any).advanced.babip, 3)}</span>
                        )}
                      </div>
                    )}

                    {/* Stat view: Statcast or Process */}
                    {statDefs.length > 0 && (
                      <div className="flex gap-2.5 mt-0.5 text-[11px] text-muted-foreground font-mono flex-wrap">
                        {statDefs.map(function (sd) {
                          var val = dig(p, sd.path);
                          var pctVal = sd.pctPath ? dig(p, sd.pctPath) : null;
                          if (val == null) return null;
                          return (
                            <span key={sd.label}>
                              <span className="opacity-60">{sd.label}</span>
                              {" "}
                              <span className="text-foreground">
                                {fmt(val, sd.decimals)}{sd.suffix || ""}
                              </span>
                              {pctVal != null && <span className="opacity-50">{" (" + pctVal + ")"}</span>}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Stat view: Value */}
                    {statView === "value" && (
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground font-mono">
                        {p.z_score != null && <span>{"raw=" + (typeof p.z_score === "number" ? p.z_score.toFixed(2) : p.z_score)}</span>}
                        {(p as any).adjusted_z != null && <span>{"adj=" + fmt((p as any).adjusted_z, 2)}</span>}
                        {p.tier && <Badge variant="secondary" className="text-[9px] h-3.5">{p.tier}</Badge>}
                      </div>
                    )}
                  </div>

                  {/* Add button */}
                  <Button
                    variant="secondary"
                    size="xs"
                    className="shrink-0"
                    onClick={function () { setAddTarget(p); }}
                  >
                    Add
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center">{players.length + " players"}</p>

      <Dialog open={addTarget !== null} onOpenChange={function (open) { if (!open) setAddTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Player</DialogTitle>
            <DialogDescription>{"Add " + (addTarget ? addTarget.name : "") + " to your roster?"}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={function () { setAddTarget(null); }} disabled={loading}>Cancel</Button>
            <Button variant="default" onClick={handleAdd} disabled={loading}>
              {loading ? <LoadingIndicator size={16} /> : null}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
