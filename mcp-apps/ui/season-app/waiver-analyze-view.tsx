import React, { useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { AlertDialog } from "../components/ui/alert-dialog";
import { useCallTool } from "../shared/use-call-tool";

import { IntelBadge } from "../shared/intel-badge";
import { IntelPanel } from "../shared/intel-panel";
import { PlayerName } from "../shared/player-name";
import { TrendIndicator } from "../shared/trend-indicator";
import { AiInsight } from "../shared/ai-insight";
import { KpiTile } from "../shared/kpi-tile";
import { UserPlus, ArrowRightLeft, Loader2, TrendingUp } from "@/shared/icons";
import { formatFixed } from "../shared/number-format";

interface WaiverPlayer {
  name: string;
  pid?: string;
  player_id?: string;
  pct?: number;
  percent_owned?: number;
  positions: string;
  status: string;
  score: number;
  mlb_id?: number;
  intel?: any;
  trend?: any;
}

interface WeakCategory {
  name: string;
  rank: number;
  total: number;
}

interface WaiverData {
  pos_type: string;
  weak_categories: (WeakCategory | string)[];
  recommendations?: WaiverPlayer[];
  players?: WaiverPlayer[];
  ai_recommendation?: string | null;
}

function scoreBarColor(pct: number): string {
  if (pct >= 80) return "bg-green-500";
  if (pct >= 50) return "bg-blue-500";
  return "bg-muted-foreground/40";
}

function ScoreBar({ score, maxScore }: { score: number; maxScore: number }) {
  const pct = maxScore > 0 ? Math.min(100, (score / maxScore) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-2 w-16 rounded-full overflow-hidden bg-muted">
        <div className={"rounded-full " + scoreBarColor(pct)} style={{ width: pct + "%" }} />
      </div>
      <span className="font-mono text-xs font-medium w-8">{formatFixed(score, 1, "0.0")}</span>
    </div>
  );
}

export function WaiverAnalyzeView({ data, app, navigate }: { data: WaiverData; app: any; navigate: (data: any) => void }) {
  const { callTool, loading } = useCallTool(app);
  const [swapTarget, setSwapTarget] = useState<WaiverPlayer | null>(null);
  const label = data.pos_type === "P" ? "Pitchers" : "Batters";
  const players = data.recommendations || data.players || [];
  const maxScore = players.length > 0 ? Math.max(...players.map((p) => p.score)) : 1;

  const handleTabChange = async (value: string) => {
    const result = await callTool("yahoo_waiver_analyze", { pos_type: value, count: 15 });
    if (result) {
      navigate(result.structuredContent);
    }
  };

  const handleAdd = async (playerId: string) => {
    const result = await callTool("yahoo_add", { player_id: playerId });
    if (result) {
      navigate(result.structuredContent);
    }
  };

  const handleSwapConfirm = async () => {
    if (!swapTarget) return;
    const playerId = swapTarget.pid || swapTarget.player_id || "";
    setSwapTarget(null);
    const result = await callTool("yahoo_add", { player_id: playerId });
    if (result) {
      navigate(result.structuredContent);
    }
  };

  var weakCatsCount = (data.weak_categories || []).length;
  var topScore = players.length > 0 ? players[0].score : 0;
  var avgOwn = players.length > 0
    ? Math.round(players.reduce(function (sum, p) { return sum + (p.pct != null ? p.pct : (p.percent_owned || 0)); }, 0) / players.length)
    : 0;

  return (
    <div className="space-y-2">
      <AiInsight recommendation={data.ai_recommendation} />

      <div className="kpi-grid">
        <KpiTile value={weakCatsCount} label="Weak Cats" color="risk" />
        <KpiTile value={formatFixed(topScore, 1, "0.0")} label="Top Score" color="success" />
        <KpiTile value={avgOwn + "%"} label="Avg Own%" color="neutral" />
      </div>

      <h2 className="text-lg font-semibold flex items-center gap-2">
        <TrendingUp size={18} />
        Waiver Wire Analysis - {label}
      </h2>

      <Tabs defaultValue={data.pos_type || "B"} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="B">Batters</TabsTrigger>
          <TabsTrigger value="P">Pitchers</TabsTrigger>
        </TabsList>
      </Tabs>

      {(data.weak_categories || []).length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Weak categories:</span>
          {(data.weak_categories || []).map((c, i) => {
            const name = typeof c === "string" ? c : c.name;
            const detail = typeof c === "string" ? "" : " (" + c.rank + "/" + c.total + ")";
            return <Badge key={i} variant="destructive" className="text-xs">{name}{detail}</Badge>;
          })}
        </div>
      )}

      <div className="relative">
        {loading && (
          <div className="loading-overlay">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Player</TableHead>
              <TableHead>Positions</TableHead>
              <TableHead className="text-right">Own%</TableHead>
              <TableHead className="text-right">Rec</TableHead>
              <TableHead className="hidden sm:table-cell w-20">Status</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {players.map((p, i) => {
              const playerId = p.pid || p.player_id || "";
              const ownPct = p.pct != null ? p.pct : p.percent_owned;
              return (
                <React.Fragment key={playerId || i}>
                <TableRow className={i < 3 ? "bg-sem-success-subtle" : ""}>
                  <TableCell className="font-medium">
                    <span className="flex items-center" style={{ gap: "4px" }}>
                      {i === 0 && <span className="text-green-600 mr-0.5">&#9733;</span>}
                      <PlayerName name={p.name} playerId={p.pid || p.player_id} mlbId={p.mlb_id} app={app} navigate={navigate} context="waivers" />
                      {p.intel && <IntelBadge intel={p.intel} size="sm" />}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {p.positions.split(",").map((pos) => (
                        <Badge key={pos.trim()} variant="outline" className="text-xs">{pos.trim()}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    <span className="inline-flex items-center gap-1 justify-end">
                      {ownPct != null ? ownPct + "%" : "-"}
                      <TrendIndicator trend={p.trend} />
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <ScoreBar score={p.score} maxScore={maxScore} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {p.status && p.status !== "Healthy" && (
                      <Badge variant="destructive" className="text-xs">{p.status}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => handleAdd(playerId)} disabled={loading} title="Add player">
                        <UserPlus size={14} />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setSwapTarget(p)} disabled={loading} title="Swap for roster player">
                        <ArrowRightLeft size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {p.intel && (
                  <TableRow>
                    <TableCell colSpan={6} className="p-0">
                      <IntelPanel intel={p.intel} />
                    </TableCell>
                  </TableRow>
                )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={swapTarget !== null}
        onClose={() => setSwapTarget(null)}
        onConfirm={handleSwapConfirm}
        title={"Swap: Add " + (swapTarget ? swapTarget.name : "")}
        description={"This will add " + (swapTarget ? swapTarget.name : "") + " to your roster. Yahoo will prompt you to drop a player if your roster is full."}
        confirmLabel="Add Player"
      />
    </div>
  );
}
