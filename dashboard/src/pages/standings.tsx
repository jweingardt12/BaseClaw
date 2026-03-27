import { TrendDown01, TrendUp01 } from "@untitledui/icons";
import { motion } from "motion/react";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import {
  Area,
  AreaChart,
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
import { Sparkline } from "@/components/application/sparkline/sparkline";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge, BadgeWithIcon } from "@/components/base/badges/badges";
import { useApi } from "@/hooks/use-api";
import { useLeague } from "@/hooks/use-league";
import { getLeaguePulse, getStandings } from "@/lib/api";
import { cx } from "@/utils/cx";

export const StandingsPage = () => {
  const league = useLeague();
  const { data: standings, loading, error, refetch } = useApi(getStandings, [], "/standings");
  const { data: leaguePulse } = useApi(getLeaguePulse, [], "/league-pulse");

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <LoadingIndicator size="md" label="Loading standings..." />
      </div>
    );
  }

  if (error || !standings) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
        <p className="text-sm text-error-primary">{error || "Failed to load standings"}</p>
        <button onClick={refetch} className="text-sm font-semibold text-brand-secondary underline">Retry</button>
      </div>
    );
  }

  const topTeam = standings[0];
  const hasSeasonData = standings.some((s) => s.wins > 0 || s.losses > 0);

  // Build trend data for chart
  const maxWeeks = Math.max(0, ...standings.map((s) => s.trend?.length || 0));
  const trendChartData = maxWeeks > 0
    ? Array.from({ length: maxWeeks }, (_, weekIdx) => {
        const entry: Record<string, unknown> = { week: `Week ${weekIdx + 1}` };
        standings.slice(0, 6).forEach((s) => {
          const weekData = s.trend?.[weekIdx];
          if (weekData) {
            entry[s.team] = weekData.wins;
          }
        });
        return entry;
      })
    : [];

  const chartColors = [
    "text-utility-brand-600",
    "text-utility-brand-400",
    "text-utility-brand-200",
    "text-utility-pink-500",
    "text-utility-sky-500",
    "text-utility-orange-500",
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex flex-col gap-8 px-4 lg:px-8">
      {/* KPI Summary Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Teams", value: String(standings.length) },
          { label: "Top Team", value: topTeam?.team || "—" },
          { label: "Best Record", value: hasSeasonData ? `${topTeam.wins}-${topTeam.losses}` : "Pre-season" },
          { label: "Week", value: league?.current_week ? `Week ${league.current_week}` : "—" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary ring-inset">
            <p className="text-sm font-medium text-tertiary">{kpi.label}</p>
            <p className="mt-1 text-display-xs font-semibold text-primary">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Standings Table */}
      <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
        <div className="flex items-center justify-between border-b border-secondary px-4 py-4 md:px-6">
          <div className="flex items-center gap-3">
            <h2 className="text-md font-semibold text-primary">League Standings</h2>
            <Badge color="brand" size="sm">{standings.length} teams</Badge>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-secondary bg-secondary">
                <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Rank</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Team</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-tertiary">Record</th>
                {hasSeasonData && (
                  <>
                    <th className="hidden px-4 py-3 text-center text-xs font-medium text-tertiary md:table-cell">Win%</th>
                    <th className="hidden px-4 py-3 text-center text-xs font-medium text-tertiary md:table-cell">GB</th>
                    <th className="hidden px-4 py-3 text-center text-xs font-medium text-tertiary lg:table-cell">Streak</th>
                    <th className="hidden px-4 py-3 text-center text-xs font-medium text-tertiary lg:table-cell">Power Rank</th>
                    <th className="hidden px-4 py-3 text-right text-xs font-medium text-tertiary lg:table-cell">Trend</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {standings.map((team, idx) => {
                const totalGames = team.wins + team.losses + team.ties;
                const winPct = totalGames > 0 ? (team.wins / totalGames).toFixed(3) : ".000";
                const trendData = team.trend?.map((t) => t.wins) || [];
                const isWinning = team.wins >= team.losses;

                return (
                  <tr
                    key={team.team}
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
                        {team.rank}
                      </span>
                    </td>
                    <td className="px-4 py-3 md:px-6">
                      <div className="flex items-center gap-3">
                        <Avatar
                          src={team.team_logo}
                          alt={team.team}
                          size="sm"
                          initials={team.team.slice(0, 2).toUpperCase()}
                        />
                        <a
                          href={`/teams/${encodeURIComponent(team.team)}`}
                          className="text-sm font-medium text-primary hover:text-brand-secondary"
                        >
                          {team.team}
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-medium text-primary">
                        {team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ""}
                      </span>
                    </td>
                    {hasSeasonData && (
                      <>
                        <td className="hidden px-4 py-3 text-center md:table-cell">
                          <span className="text-sm text-secondary">{winPct}</span>
                        </td>
                        <td className="hidden px-4 py-3 text-center md:table-cell">
                          <span className="text-sm text-secondary">
                            {team.gb === 0 ? "—" : team.gb}
                          </span>
                        </td>
                        <td className="hidden px-4 py-3 text-center lg:table-cell">
                          <BadgeWithIcon
                            iconLeading={isWinning ? TrendUp01 : TrendDown01}
                            type="modern"
                            size="sm"
                            color={isWinning ? "success" : "error"}
                          >
                            {isWinning ? "W" : "L"}
                          </BadgeWithIcon>
                        </td>
                        <td className="hidden px-4 py-3 text-center lg:table-cell">
                          <span className="text-sm font-medium text-secondary">
                            {team.powerRank ? `#${team.powerRank}` : "—"}
                          </span>
                        </td>
                        <td className="hidden px-4 py-3 text-right lg:table-cell">
                          {trendData.length > 1 && (
                            <Sparkline
                              data={trendData}
                              color={isWinning ? "success" : "error"}
                              className="ml-auto"
                            />
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Wins Over Time Chart (only if season has started) */}
      {trendChartData.length > 0 && (
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between border-b border-secondary pb-5">
            <p className="text-md font-semibold text-primary">Wins Over Time</p>
          </div>
          <div className="h-60 lg:h-72">
            <ResponsiveContainer initialDimension={{ width: 1, height: 1 }} className="h-full">
              <AreaChart
                data={trendChartData}
                className="text-tertiary [&_.recharts-text]:text-xs"
                margin={{ left: 5, right: 5 }}
              >
                <CartesianGrid vertical={false} stroke="currentColor" className="text-utility-neutral-100" />
                <XAxis
                  fill="currentColor"
                  axisLine={false}
                  tickLine={false}
                  tickMargin={10}
                  dataKey="week"
                />
                <RechartsTooltip content={<ChartTooltipContent />} />
                {standings.slice(0, 6).map((s, i) => (
                  <Area
                    key={s.team}
                    isAnimationActive={false}
                    className={chartColors[i]}
                    dataKey={s.team}
                    name={s.team}
                    type="monotone"
                    stroke="currentColor"
                    strokeWidth={2}
                    fill="none"
                    activeDot={{
                      className: "fill-bg-primary stroke-utility-brand-600 stroke-2",
                    }}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* League Activity / Manager Pulse */}
      {leaguePulse && leaguePulse.length > 0 && (
        <div className="flex flex-col gap-5">
          <div className="border-b border-secondary pb-5">
            <p className="text-md font-semibold text-primary">Manager Activity</p>
            <p className="mt-1 text-xs text-tertiary">Total roster moves this season</p>
          </div>
          <div className="h-64 lg:h-80">
            <ResponsiveContainer initialDimension={{ width: 1, height: 1 }} className="h-full">
              <BarChart
                data={[...leaguePulse].sort((a, b) => b.total - a.total)}
                layout="vertical"
                className="text-tertiary [&_.recharts-text]:text-xs"
                margin={{ left: 0, right: 10 }}
              >
                <CartesianGrid horizontal={false} stroke="currentColor" className="text-utility-neutral-100" />
                <XAxis type="number" axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} width={100} tick={{ fontSize: 11 }} />
                <RechartsTooltip content={<ChartTooltipContent />} />
                <Legend content={<ChartLegendContent />} verticalAlign="top" align="right" />
                <Bar
                  isAnimationActive={false}
                  className="text-utility-brand-600"
                  dataKey="moves"
                  name="Moves"
                  fill="currentColor"
                  maxBarSize={14}
                  stackId="a"
                />
                <Bar
                  isAnimationActive={false}
                  className="text-utility-pink-500"
                  dataKey="trades"
                  name="Trades"
                  fill="currentColor"
                  maxBarSize={14}
                  stackId="a"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </motion.div>
  );
};
