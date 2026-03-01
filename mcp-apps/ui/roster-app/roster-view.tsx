import React, { useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/ui/table";
import { AlertDialog } from "../components/ui/alert-dialog";
import { useCallTool } from "../shared/use-call-tool";
import { teamLogoFromAbbrev } from "../shared/mlb-images";
import { IntelBadge } from "../shared/intel-badge";
import { IntelPanel } from "../shared/intel-panel";
import { PlayerName } from "../shared/player-name";
import { AiInsight } from "../shared/ai-insight";
import { KpiTile } from "../shared/kpi-tile";
import { Users, UserMinus, Loader2 } from "@/shared/icons";

interface Player {
  name: string;
  player_id: string;
  position?: string;
  eligible_positions?: string[];
  status?: string;
  team?: string;
  mlb_id?: number;
  intel?: any;
}

export function RosterView({ data, app, navigate }: { data: { players: Player[]; ai_recommendation?: string | null }; app: any; navigate: (data: any) => void }) {
  const { callTool, loading } = useCallTool(app);
  const [dropTarget, setDropTarget] = useState<Player | null>(null);

  var players = data.players || [];
  var injuredCount = players.filter(function (p) { return p.status && p.status !== "Healthy"; }).length;
  var ilSlots = players.filter(function (p) { return p.position === "IL" || p.position === "IL+"; }).length;

  const handleDrop = async () => {
    if (!dropTarget) return;
    const result = await callTool("yahoo_drop", { player_id: dropTarget.player_id });
    setDropTarget(null);
    if (result) {
      navigate(result.structuredContent);
    }
  };

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Users className="h-5 w-5" />
        Current Roster
      </h2>

      <AiInsight recommendation={data.ai_recommendation} />

      <div className="kpi-grid">
        <KpiTile value={players.length} label="Total Players" color="primary" />
        <KpiTile value={injuredCount} label="Injured" color={injuredCount > 0 ? "risk" : "success"} />
        <KpiTile value={ilSlots} label="IL Slots Used" color="info" />
      </div>

      <div className="relative">
        {loading && (
          <div className="loading-overlay">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Pos</TableHead>
              <TableHead>Player</TableHead>
              <TableHead className="hidden sm:table-cell">Eligibility</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {players.map((p) => {
              const logoUrl = p.team ? teamLogoFromAbbrev(p.team) : null;
              return (
                <React.Fragment key={p.player_id}>
                <TableRow>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono text-xs font-bold">{p.position || "?"}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    <span className="flex items-center" style={{ gap: "4px" }}>
                      {logoUrl && <img src={logoUrl} alt={p.team || ""} width={16} height={16} style={{ display: "inline", flexShrink: 0 }} />}
                      <PlayerName name={p.name} playerId={p.player_id} mlbId={p.mlb_id} app={app} navigate={navigate} context="roster" />
                      {p.intel && <IntelBadge intel={p.intel} size="sm" />}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex gap-1 flex-wrap">
                      {(p.eligible_positions || []).map((pos) => (
                        <Badge key={pos} variant="outline" className="text-xs font-bold">{pos}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {p.status && p.status !== "Healthy" && (
                      <Badge variant="destructive" className="text-xs">{p.status}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.player_id && (
                      <Button variant="destructive" size="sm" onClick={() => setDropTarget(p)}>
                        <UserMinus size={14} />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
                {p.intel && (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
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
      <p className="text-xs text-muted-foreground mt-2">{players.length + " players"}</p>
      <AlertDialog
        open={dropTarget !== null}
        onClose={() => setDropTarget(null)}
        onConfirm={handleDrop}
        title="Drop Player"
        description={"Are you sure you want to drop " + (dropTarget ? dropTarget.name : "") + "?"}
        variant="destructive"
        confirmLabel="Drop"
        loading={loading}
      />
    </div>
  );
}
