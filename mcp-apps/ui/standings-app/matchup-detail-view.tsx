import { Card, CardContent } from "../components/card";
import { Subheading } from "../components/heading";
import { AiInsight } from "../shared/ai-insight";
import { RefreshButton } from "../shared/refresh-button";
import { CategoryTable } from "../shared/comparison-bar";

interface MatchupCategory {
  name: string;
  my_value: string;
  opp_value: string;
  result: "win" | "loss" | "tie";
}

interface MatchupDetailData {
  week: string | number;
  my_team: string;
  opponent: string;
  my_team_logo?: string;
  opp_team_logo?: string;
  score: { wins: number; losses: number; ties: number };
  categories: MatchupCategory[];
  ai_recommendation?: string | null;
}

export function MatchupDetailView({ data, app, navigate }: { data: MatchupDetailData; app?: any; navigate?: (data: any) => void }) {
  var score = data.score || { wins: 0, losses: 0, ties: 0 };
  var total = score.wins + score.losses + score.ties;
  var categories = data.categories || [];

  var winPct = total > 0 ? (score.wins / total) * 100 : 0;
  var tiePct = total > 0 ? (score.ties / total) * 100 : 0;
  var lossPct = total > 0 ? (score.losses / total) * 100 : 0;

  var statusLabel = score.wins > score.losses ? "Winning" : score.losses > score.wins ? "Losing" : "Tied";
  var statusColor = score.wins > score.losses ? "text-sem-success" : score.losses > score.wins ? "text-sem-risk" : "text-sem-warning";

  return (
    <div className="space-y-3 animate-stagger">
      <div className="flex items-center justify-between">
        <Subheading>Week {String(data.week)} Matchup</Subheading>
        {app && navigate && (
          <RefreshButton app={app} toolName="yahoo_my_matchup" navigate={navigate} />
        )}
      </div>

      <AiInsight recommendation={data.ai_recommendation} />

      {/* Scoreboard */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {data.my_team_logo && <img src={data.my_team_logo} alt="" width={32} height={32} className="rounded-sm shrink-0" />}
              <p className="font-semibold text-sm truncate">{data.my_team}</p>
            </div>
            <div className="text-center px-2">
              <div className="flex items-baseline justify-center gap-1 font-mono font-bold">
                <span className="text-2xl text-sem-success">{score.wins}</span>
                <span className="text-lg text-muted-foreground">-</span>
                <span className="text-2xl text-sem-risk">{score.losses}</span>
                {score.ties > 0 && (
                  <>
                    <span className="text-lg text-muted-foreground">-</span>
                    <span className="text-2xl text-sem-warning">{score.ties}</span>
                  </>
                )}
              </div>
              <p className={"text-xs font-medium " + statusColor}>{statusLabel}</p>
            </div>
            <div className="flex items-center gap-2 min-w-0 justify-end">
              <p className="font-semibold text-sm truncate text-right">{data.opponent}</p>
              {data.opp_team_logo && <img src={data.opp_team_logo} alt="" width={32} height={32} className="rounded-sm shrink-0" />}
            </div>
          </div>

          {total > 0 && (
            <div className="flex h-1.5 rounded-full overflow-hidden mt-3 bg-muted">
              <div className="bg-[var(--sem-success)] transition-all" style={{ width: winPct + "%" }} />
              {score.ties > 0 && <div className="bg-[var(--sem-warning)] transition-all" style={{ width: tiePct + "%" }} />}
              <div className="bg-[var(--sem-risk)] opacity-40 transition-all" style={{ width: lossPct + "%" }} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category comparison bars */}
      {categories.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <CategoryTable
              categories={categories}
              myTeam={data.my_team}
              opponent={data.opponent}
              myLogo={data.my_team_logo}
              oppLogo={data.opp_team_logo}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
