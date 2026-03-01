import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { StatusBanner } from "../shared/status-banner";
import { TeamLogo } from "../shared/team-logo";

interface MlbInjury {
  player: string;
  team: string;
  description: string;
}

export function InjuriesView({ data }: { data: { injuries: MlbInjury[] } }) {
  if ((data.injuries || []).length === 0) {
    return (
      <div className="space-y-3">
        <StatusBanner text="MLB Injuries" variant="neutral" />
        <div className="glass-card p-4 text-center">
          <p className="text-muted-foreground font-semibold">No injuries reported (may be offseason).</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <StatusBanner text="MLB Injuries" subtitle={data.injuries.length + " players injured"} variant="alert" />
      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-bold">Player</TableHead>
              <TableHead className="font-bold">Team</TableHead>
              <TableHead className="font-bold">Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data.injuries || []).map(function (inj, i) {
              return (
                <TableRow key={i}>
                  <TableCell className="font-semibold">{inj.player}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1">
                      <TeamLogo name={inj.team} />
                      <Badge variant="secondary" className="text-xs font-bold">{inj.team}</Badge>
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{inj.description}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
