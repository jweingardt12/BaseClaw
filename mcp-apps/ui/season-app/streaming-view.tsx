import { Button } from "../components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/ui/table";
import { useCallTool } from "../shared/use-call-tool";
import { teamLogoFromAbbrev } from "../shared/mlb-images";
import { IntelBadge } from "../shared/intel-badge";
import { PlayerName } from "../shared/player-name";
import { TrendIndicator } from "../shared/trend-indicator";
import { AiInsight } from "../shared/ai-insight";
import { KpiTile } from "../shared/kpi-tile";
import { UserPlus, Loader2, Zap } from "@/shared/icons";
import { formatFixed } from "../shared/number-format";

interface StreamingPitcher {
  name: string;
  player_id: string;
  team: string;
  games: number;
  percent_owned: number;
  score: number;
  two_start: boolean;
  mlb_id?: number;
  intel?: any;
  trend?: any;
}

interface StreamingData {
  week: number;
  team_games: Record<string, number>;
  pitchers: StreamingPitcher[];
  ai_recommendation?: string | null;
}

export function StreamingView({ data, app, navigate }: { data: StreamingData; app: any; navigate: (data: any) => void }) {
  const { callTool, loading } = useCallTool(app);

  const handleAdd = async (playerId: string) => {
    const result = await callTool("yahoo_add", { player_id: playerId });
    if (result) {
      navigate(result.structuredContent);
    }
  };

  var twoStartCount = (data.pitchers || []).filter(function (p) { return p.two_start; }).length;
  var bestGrade = (data.pitchers || []).length > 0 ? formatFixed((data.pitchers || [])[0].score, 1, "0.0") : "-";

  return (
    <div className="space-y-2">
      <AiInsight recommendation={data.ai_recommendation} />

      <div className="kpi-grid">
        <KpiTile value={twoStartCount} label="2-Start" color={twoStartCount > 0 ? "success" : "neutral"} />
        <KpiTile value={bestGrade} label="Best Score" color="primary" />
      </div>

      <h2 className="text-lg font-semibold">Streaming Pitchers - Week {data.week}</h2>

      <div className="relative">
        {loading && (
          <div className="loading-overlay">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pitcher</TableHead>
              <TableHead>Team</TableHead>
              <TableHead className="text-center">Games</TableHead>
              <TableHead className="text-right">Own%</TableHead>
              <TableHead className="text-right">Rec</TableHead>
              <TableHead className="w-16">2-Start</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data.pitchers || []).map((p, i) => (
              <TableRow key={p.player_id} className={i === 0 ? "bg-primary/5" : ""}>
                <TableCell className="font-medium">
                  <span className="flex items-center" style={{ gap: "4px" }}>
                    <PlayerName name={p.name} playerId={p.player_id} mlbId={p.mlb_id} app={app} navigate={navigate} context="free-agents" />
                    {p.intel && <IntelBadge intel={p.intel} size="sm" />}
                  </span>
                </TableCell>
                <TableCell className="text-sm">
                  <span className="flex items-center" style={{ gap: "4px" }}>
                    <img src={teamLogoFromAbbrev(p.team)} alt={p.team} width={16} height={16} style={{ display: "inline", flexShrink: 0 }} />
                    {p.team}
                  </span>
                </TableCell>
                <TableCell className="text-center font-mono">{p.games}</TableCell>
                <TableCell className="text-right font-mono text-xs">
                  <span className="inline-flex items-center gap-1 justify-end">
                    {p.percent_owned}%
                    <TrendIndicator trend={p.trend} />
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono font-medium">{formatFixed(p.score, 1, "0.0")}</TableCell>
                <TableCell>
                  {p.two_start && <Zap size={14} className="text-amber-500" />}
                </TableCell>
                <TableCell>
                  <Button size="sm" onClick={() => handleAdd(p.player_id)}>
                    <UserPlus size={14} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
