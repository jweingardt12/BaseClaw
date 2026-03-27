import { TrendDown01, TrendUp01, Trophy01 } from "@untitledui/icons";
import { motion } from "motion/react";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartLegendContent, ChartTooltipContent } from "@/components/application/charts/charts-base";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge, BadgeWithIcon } from "@/components/base/badges/badges";
import { useApi } from "@/hooks/use-api";
import { getLeagueIntel, getPowerRankings, getStandings } from "@/lib/api";
import { cx } from "@/utils/cx";

export const PowerRankingsPage = () => {
  const { data: rankings, loading, error, refetch } = useApi(getPowerRankings, [], "/power-rankings");
  const { data: standings } = useApi(getStandings, [], "/standings");
  const { data: intel } = useApi(getLeagueIntel, [], "/league-intel");

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <LoadingIndicator size="md" label="Loading power rankings..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
        <p className="text-sm text-error-primary">Failed to load power rankings</p>
        <button onClick={refetch} className="text-sm font-semibold text-brand-secondary underline">Retry</button>
      </div>
    );
  }

  if (!rankings || rankings.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <EmptyState size="md">
          <EmptyState.Header><EmptyState.FeaturedIcon icon={Trophy01} color="gray" /></EmptyState.Header>
          <EmptyState.Content>
            <EmptyState.Title>Power Rankings</EmptyState.Title>
            <EmptyState.Description>Rankings will be available once the season starts.</EmptyState.Description>
          </EmptyState.Content>
        </EmptyState>
      </div>
    );
  }

  // Create a lookup from standings for extra data
  const standingsMap = new Map(
    (standings || []).map((s) => [s.team, s]),
  );

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex flex-col gap-8 px-4 lg:px-8">
      {/* Top 3 Podium */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {rankings.slice(0, 3).map((entry, idx) => {
          const standing = standingsMap.get(entry.team);
          const medalColors = ["text-utility-warning-500", "text-utility-neutral-400", "text-utility-orange-500"];
          return (
            <div
              key={entry.team}
              className={cx(
                "rounded-xl bg-primary p-5 shadow-xs ring-1 ring-inset",
                idx === 0 ? "ring-2 ring-border-brand" : "ring-secondary",
              )}
            >
              <div className="flex items-center gap-3">
                <span className={cx("text-display-xs font-bold", medalColors[idx])}>
                  #{entry.rank}
                </span>
                <Avatar src={entry.team_logo} alt={entry.team} size="md" initials={entry.team.slice(0, 2).toUpperCase()} />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-primary">{entry.team}</span>
                  <span className="text-xs text-tertiary">
                    {entry.record || (standing ? `${standing.wins}-${standing.losses}` : "—")}
                  </span>
                </div>
              </div>
              {entry.score !== undefined && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-tertiary">Score:</span>
                  <span className="text-sm font-semibold text-brand-secondary">{entry.score}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Full Rankings Table */}
      <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
        <div className="flex items-center justify-between border-b border-secondary px-4 py-4 md:px-6">
          <div className="flex items-center gap-3">
            <h2 className="text-md font-semibold text-primary">Full Rankings</h2>
            <Badge color="brand" size="sm">{rankings.length} teams</Badge>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-secondary bg-secondary">
                <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Rank</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Team</th>
                <th className="hidden px-4 py-3 text-center text-xs font-medium text-tertiary md:table-cell">Record</th>
                <th className="hidden px-4 py-3 text-center text-xs font-medium text-tertiary lg:table-cell">Score</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-tertiary">Change</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((entry, idx) => {
                const standing = standingsMap.get(entry.team);
                const standingsRank = standing?.rank || 0;
                const diff = standingsRank > 0 ? standingsRank - entry.rank : 0;

                return (
                  <tr
                    key={entry.team}
                    className={cx(
                      "border-b border-secondary transition duration-100 ease-linear hover:bg-primary_hover",
                      idx === 0 && "bg-brand-primary/30",
                    )}
                  >
                    <td className="px-4 py-3 md:px-6">
                      <span className={cx(
                        "text-sm font-semibold",
                        idx < 3 ? "text-brand-secondary" : "text-primary",
                      )}>
                        {entry.rank}
                      </span>
                    </td>
                    <td className="px-4 py-3 md:px-6">
                      <div className="flex items-center gap-3">
                        <Avatar
                          src={entry.team_logo}
                          alt={entry.team}
                          size="sm"
                          initials={entry.team.slice(0, 2).toUpperCase()}
                        />
                        <span className="text-sm font-medium text-primary">{entry.team}</span>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-center md:table-cell">
                      <span className="text-sm text-secondary">
                        {entry.record || (standing ? `${standing.wins}-${standing.losses}` : "—")}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-center lg:table-cell">
                      <span className="text-sm font-medium tabular-nums text-secondary">
                        {entry.score ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {diff !== 0 ? (
                        <BadgeWithIcon
                          iconLeading={diff > 0 ? TrendUp01 : TrendDown01}
                          type="modern"
                          size="sm"
                          color={diff > 0 ? "success" : "error"}
                        >
                          {Math.abs(diff)}
                        </BadgeWithIcon>
                      ) : (
                        <span className="text-xs text-tertiary">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Z-Score Breakdown Chart */}
      {intel && intel.rankings?.length > 0 && (
        <div className="flex flex-col gap-5">
          <div className="border-b border-secondary pb-5">
            <p className="text-md font-semibold text-primary">Roster Strength (Adjusted Z-Score)</p>
            <p className="mt-1 text-xs text-tertiary">Hitting + pitching z-score breakdown by team</p>
          </div>
          <div className="h-72 lg:h-96">
            <ResponsiveContainer initialDimension={{ width: 1, height: 1 }} className="h-full">
              <BarChart
                data={[...intel.rankings].sort((a, b) => (b.score || 0) - (a.score || 0)).map((t) => ({
                  name: t.name?.length > 15 ? t.name.slice(0, 14) + "…" : t.name,
                  Hitting: t.hitting_z ?? t.adj_zscore ?? 0,
                  Pitching: t.pitching_z ?? 0,
                }))}
                className="text-tertiary [&_.recharts-text]:text-xs"
                margin={{ left: 0, right: 0 }}
              >
                <CartesianGrid vertical={false} stroke="currentColor" className="text-utility-neutral-100" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tickMargin={10} tick={{ fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} width={40} />
                <RechartsTooltip content={<ChartTooltipContent />} />
                <Legend content={<ChartLegendContent />} verticalAlign="top" align="right" />
                <Bar
                  isAnimationActive={false}
                  className="text-utility-brand-600"
                  dataKey="Hitting"
                  name="Hitting Z"
                  stackId="z"
                  fill="currentColor"
                  maxBarSize={28}
                />
                <Bar
                  isAnimationActive={false}
                  className="text-utility-sky-500"
                  dataKey="Pitching"
                  name="Pitching Z"
                  stackId="z"
                  fill="currentColor"
                  maxBarSize={28}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </motion.div>
  );
};
