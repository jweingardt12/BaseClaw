import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "../components/card";
import { Subheading } from "../components/heading";
import { Text } from "../components/text";
import { KpiTile } from "../shared/kpi-tile";
import { formatFixed } from "../shared/number-format";
import { mlbHeadshotUrl } from "../shared/mlb-images";
import { PlayerName } from "../shared/player-name";
import { useCallTool } from "../shared/use-call-tool";
import { Loader2 } from "@/shared/icons";

interface PlayerInfo {
  name: string;
  z_final: number;
  tier: string;
  pos: string;
  team: string;
  mlb_id?: number;
  player_id?: string;
}

interface CategoryImpact {
  add_z: number;
  drop_z: number;
  delta: number;
  direction: string;
}

interface FaabRecommendData {
  player: PlayerInfo;
  recommended_bid: number;
  bid_range: { low: number; high: number };
  faab_remaining: number;
  faab_after: number;
  pct_of_budget: number;
  reasoning: string[];
  category_impact: Record<string, CategoryImpact>;
  improving_categories: string[];
}

function tierBadgeVariant(tier: string): "default" | "secondary" | "destructive" {
  if (tier === "Elite") return "default";
  if (tier === "Strong") return "default";
  if (tier === "Solid") return "secondary";
  return "destructive";
}

function directionArrow(direction: string): string {
  if (direction === "up") return "\u2191";
  if (direction === "down") return "\u2193";
  return "\u2192";
}

function directionColor(direction: string): string {
  if (direction === "up") return "text-sem-success";
  if (direction === "down") return "text-sem-risk";
  return "text-muted-foreground";
}

export function FaabRecommendView({ data, app, navigate }: { data: FaabRecommendData; app?: any; navigate?: (data: any) => void }) {
  var { callTool, loading } = useCallTool(app);
  var [confirmBid, setConfirmBid] = useState(false);
  var player = data.player || ({} as PlayerInfo);
  var impact = data.category_impact || {};
  var improving = data.improving_categories || [];
  var reasons = data.reasoning || [];

  var handleBid = async function () {
    if (!player.player_id) return;
    var result = await callTool("yahoo_waiver_claim", {
      player_id: player.player_id,
      faab: data.recommended_bid,
    });
    setConfirmBid(false);
    if (result && result.structuredContent && navigate) {
      navigate(result.structuredContent);
    }
  };

  return (
    <div className="space-y-2">
      <div className="kpi-grid">
        <KpiTile value={"$" + data.recommended_bid} label="Recommended Bid" color="primary" />
        <KpiTile value={data.bid_range ? "$" + data.bid_range.low + "-$" + data.bid_range.high : "N/A"} label="Bid Range" color="neutral" />
        <KpiTile value={formatFixed(data.pct_of_budget, 1, "0") + "%"} label="% of Budget" color={data.pct_of_budget > 25 ? "risk" : "info"} />
      </div>

      {/* Player info card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <Subheading><PlayerName name={player.name} mlbId={player.mlb_id} showHeadshot /></Subheading>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary">{player.pos}</Badge>
                  <span className="text-sm text-muted-foreground">{player.team}</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <Badge variant={tierBadgeVariant(player.tier)} className="mb-1">{player.tier}</Badge>
              <p className="font-mono text-sm text-muted-foreground">z={formatFixed(player.z_final, 2, "0.00")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bid display */}
      <Card>
        <CardContent className="p-3 text-center">
          <Text>Recommended FAAB Bid</Text>
          <p className="text-3xl font-bold font-mono text-primary">${data.recommended_bid}</p>
          {data.bid_range && (
            <p className="text-xs text-muted-foreground mt-1">
              Range: ${data.bid_range.low} - ${data.bid_range.high}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Place FAAB Bid action */}
      {player.player_id && (
        <Button className="w-full" onClick={function () { setConfirmBid(true); }} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Place FAAB Bid — ${data.recommended_bid}
        </Button>
      )}

      {/* Budget summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">FAAB Remaining</p>
            <p className="text-lg font-bold font-mono">${data.faab_remaining}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">After Bid</p>
            <p className="text-lg font-bold font-mono">${data.faab_after}</p>
          </CardContent>
        </Card>
      </div>

      {/* Reasoning */}
      {reasons.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium mb-2">Reasoning</p>
            <ul className="space-y-1">
              {reasons.map(function (reason, i) {
                return (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2">
                    <span className="text-primary mt-0.5">&#8226;</span>
                    <span>{reason}</span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Improving categories */}
      {improving.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Improves:</span>
          {improving.map(function (cat) {
            return <Badge key={cat}>{cat}</Badge>;
          })}
        </div>
      )}

      {/* Category impact table */}
      {Object.keys(impact).length > 0 && (
        <div className="w-full overflow-x-auto mcp-app-scroll-x">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead className="text-right hidden sm:table-cell">Add Z</TableHead>
              <TableHead className="text-right hidden sm:table-cell">Drop Z</TableHead>
              <TableHead className="text-right">Delta</TableHead>
              <TableHead className="text-center">Dir</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.keys(impact).map(function (cat) {
              var row = impact[cat];
              return (
                <TableRow key={cat}>
                  <TableCell className="font-medium">{cat}</TableCell>
                  <TableCell className="text-right font-mono text-xs hidden sm:table-cell">{formatFixed(row.add_z, 2, "0.00")}</TableCell>
                  <TableCell className="text-right font-mono text-xs hidden sm:table-cell">{formatFixed(row.drop_z, 2, "0.00")}</TableCell>
                  <TableCell className={"text-right font-mono text-xs font-semibold " + directionColor(row.direction)}>
                    {row.delta >= 0 ? "+" : ""}{formatFixed(row.delta, 2, "0.00")}
                  </TableCell>
                  <TableCell className={"text-center text-lg " + directionColor(row.direction)}>
                    {directionArrow(row.direction)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      )}

      {/* Confirmation dialog */}
      <Dialog open={confirmBid} onOpenChange={function (open) { if (!open) setConfirmBid(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Place FAAB Bid?</DialogTitle>
            <DialogDescription>
              Submit a ${data.recommended_bid} FAAB bid for {player.name}?
              Your remaining budget will be ${data.faab_after}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={function () { setConfirmBid(false); }}>Cancel</Button>
            <Button onClick={handleBid} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Place ${data.recommended_bid} Bid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
