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
import { qualityColor, hotColdIcon } from "../shared/intel-badge";
import { TrendIndicator } from "../shared/trend-indicator";

function getPositions(p: PlayerRowData): string {
  if (p.eligible_positions) return Array.isArray(p.eligible_positions) ? p.eligible_positions.join(", ") : String(p.eligible_positions);
  if (p.positions) return Array.isArray(p.positions) ? p.positions.join(", ") : String(p.positions);
  return "";
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
              var zScore = p.z_score != null ? p.z_score : null;
              var pct = p.percent_owned != null ? p.percent_owned : p.pct;

              return (
                <div key={p.player_id || p.name} className="flex items-center gap-3 py-2.5 px-3">
                  {/* Player info (tappable) */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={function () { handlePlayerTap(p); }}
                  >
                    {/* Name + indicators */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      {p.team && <TeamLogo abbrev={p.team} size={18} />}
                      <span className="font-medium truncate text-sm">{p.name}</span>
                      {tier && <span className={"w-2 h-2 rounded-full shrink-0 " + qualityColor(tier)} title={tier} />}
                      {showHotCold && <span className="text-xs shrink-0" title={hotCold || ""}>{hotColdIcon(hotCold)}</span>}
                      {hasStatus && <Badge variant="destructive" className="text-[10px] shrink-0 ml-0.5">{p.status}</Badge>}
                    </div>

                    {/* Position + ownership + z-score */}
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                      {positions && <span>{positions}</span>}
                      {pct != null && (
                        <span className="inline-flex items-center gap-1">
                          {pct + "% owned"}
                          {p.trend && <TrendIndicator trend={p.trend} />}
                        </span>
                      )}
                      {zScore != null && zScore !== 0 && (
                        <span className="font-mono">{"z=" + (typeof zScore === "number" ? zScore.toFixed(2) : zScore)}</span>
                      )}
                      {p.tier && <Badge variant="secondary" className="text-[9px] h-3.5">{p.tier}</Badge>}
                    </div>
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
