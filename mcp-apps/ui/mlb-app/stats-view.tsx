import { Badge } from "../components/ui/badge";
import { StatusBanner } from "../shared/status-banner";

interface MlbStatsData {
  player_id: string;
  season: string;
  stats: Record<string, string | number>;
}

export function StatsView({ data }: { data: MlbStatsData }) {
  var entries = Object.entries(data.stats || {});

  return (
    <div className="space-y-3">
      <StatusBanner text="Player Stats" subtitle={"Season " + data.season} variant="info" />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {entries.map(function (pair) {
          var key = pair[0];
          var val = pair[1];
          return (
            <div key={key} className="glass-card p-3 text-center">
              <p className="text-xl font-bold font-mono">{String(val)}</p>
              <p className="text-xs text-muted-foreground font-semibold">{key}</p>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground font-semibold">{"Player ID: " + data.player_id}</p>
    </div>
  );
}
