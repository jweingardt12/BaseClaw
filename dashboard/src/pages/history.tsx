import { useMemo, useState } from "react";
import { Trophy01 } from "@untitledui/icons";
import { motion } from "motion/react";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { ProgressBarBase } from "@/components/base/progress-indicators/progress-indicators";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartLegendContent, ChartTooltipContent } from "@/components/application/charts/charts-base";
import { Badge } from "@/components/base/badges/badges";
import { Select } from "@/components/base/select/select";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { useApi } from "@/hooks/use-api";
import {
  getLeagueHistoryRaw,
  getPastStandings,
  getRecordBook,
} from "@/lib/api";
import { cx } from "@/utils/cx";

const PIE_FILLS = [
  "#3B82F6", "#60A5FA", "#EC4899", "#38BDF8",
  "#F97316", "#BFDBFE", "#EAB308", "#22C55E",
  "#A78BFA", "#F472B6", "#94A3B8", "#FB923C",
];

export const HistoryPage = () => {
  const { data: seasons, loading, error, refetch } = useApi(getLeagueHistoryRaw, [], "/league-history");
  const { data: recordBook } = useApi(getRecordBook, [], "/record-book");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const { data: pastStandings } = useApi(
    () => (selectedYear ? getPastStandings(selectedYear) : Promise.resolve([])),
    [selectedYear],
  );

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <LoadingIndicator size="md" label="Loading league history..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
        <p className="text-sm text-error-primary">Failed to load league history</p>
        <button onClick={refetch} className="text-sm font-semibold text-brand-secondary underline">Retry</button>
      </div>
    );
  }

  const sortedSeasons = useMemo(() => [...(seasons || [])].sort((a, b) => a.year - b.year), [seasons]);
  const careers = recordBook?.careers || [];
  const champions = recordBook?.champions || [];
  const seasonRecords = recordBook?.season_records;
  const activityRecords = recordBook?.activity_records;
  const playoffAppearances = recordBook?.playoff_appearances || [];
  const firstPicks = recordBook?.first_picks || [];
  const yearItems = useMemo(() => sortedSeasons.map((s) => ({ id: String(s.year), label: String(s.year) })), [sortedSeasons]);

  const { pieData, titlesBarData } = useMemo(() => {
    const counts: Record<string, number> = {};
    sortedSeasons.forEach((s) => {
      const c = s.champion || "Unknown";
      counts[c] = (counts[c] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return {
      pieData: sorted.map(([name, value]) => ({ name, value })),
      titlesBarData: sorted.map(([manager, titles]) => ({ manager, Titles: titles })),
    };
  }, [sortedSeasons]);

  const careerBarData = useMemo(() =>
    [...careers]
      .sort((a, b) => b.win_pct - a.win_pct)
      .slice(0, 12)
      .map((c) => ({ manager: c.manager, "Win%": c.win_pct, Wins: c.wins, Losses: c.losses })),
    [careers],
  );

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex flex-col gap-8 px-4 lg:px-8">
      {/* Header KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary ring-inset">
          <p className="text-sm font-medium text-tertiary">Seasons</p>
          <p className="mt-1 text-display-xs font-semibold text-primary">{sortedSeasons.length}</p>
        </div>
        <div className="rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary ring-inset">
          <p className="text-sm font-medium text-tertiary">Unique Champions</p>
          <p className="mt-1 text-display-xs font-semibold text-primary">{pieData.length}</p>
        </div>
        <div className="rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary ring-inset">
          <p className="text-sm font-medium text-tertiary">Most Titles</p>
          <p className="mt-1 text-display-xs font-semibold text-primary">{pieData[0]?.name || "—"}</p>
          <p className="text-xs text-tertiary">{pieData[0]?.value || 0} championships</p>
        </div>
        <div className="rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary ring-inset">
          <p className="text-sm font-medium text-tertiary">Active Managers</p>
          <p className="mt-1 text-display-xs font-semibold text-primary">{careers.length}</p>
        </div>
      </div>

      {/* Row 1: Championship Pie + Titles Bar */}
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
        {/* Championship Distribution */}
        <div className="flex flex-col gap-5 lg:w-md lg:shrink-0">
          <div className="border-b border-secondary pb-5">
            <p className="text-md font-semibold text-primary">Championship Distribution</p>
          </div>
          <div className="h-80">
            <ResponsiveContainer initialDimension={{ width: 1, height: 1 }} className="h-full">
              <PieChart>
                <Legend verticalAlign="bottom" content={<ChartLegendContent />} />
                <RechartsTooltip content={<ChartTooltipContent isPieChart />} />
                <Pie
                  isAnimationActive={false}
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={100}
                  stroke="none"
                  startAngle={-270}
                  endAngle={-630}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_FILLS[i % PIE_FILLS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Titles per Manager */}
        {titlesBarData.length > 0 && (
          <div className="flex w-full flex-col gap-5">
            <div className="border-b border-secondary pb-5">
              <p className="text-md font-semibold text-primary">Titles by Manager</p>
            </div>
            <div className="h-60 lg:h-72">
              <ResponsiveContainer initialDimension={{ width: 1, height: 1 }} className="h-full">
                <BarChart
                  data={titlesBarData}
                  className="text-tertiary [&_.recharts-text]:text-xs"
                  margin={{ left: 0, right: 0 }}
                >
                  <CartesianGrid vertical={false} stroke="currentColor" className="text-utility-neutral-100" />
                  <XAxis dataKey="manager" axisLine={false} tickLine={false} tickMargin={10} interval={0} tick={{ fontSize: 10 }} />
                  <YAxis axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                  <RechartsTooltip content={<ChartTooltipContent />} />
                  <Bar
                    isAnimationActive={false}
                    className="text-utility-brand-600"
                    dataKey="Titles"
                    fill="currentColor"
                    maxBarSize={32}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Season Records */}
      {seasonRecords && (Object.keys(seasonRecords).length > 0 || (activityRecords && Object.keys(activityRecords).length > 0)) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {seasonRecords.best_win_pct && (
            <div className="rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary ring-inset">
              <div className="flex items-center gap-3">
                <FeaturedIcon icon={Trophy01} color="success" theme="light" size="md" />
                <div>
                  <p className="text-sm font-medium text-tertiary">Best Season Win%</p>
                  <p className="text-lg font-semibold text-primary">{seasonRecords.best_win_pct.manager}</p>
                  <p className="text-xs text-tertiary">
                    {seasonRecords.best_win_pct.win_pct}% — {seasonRecords.best_win_pct.wins}-{seasonRecords.best_win_pct.losses}-{seasonRecords.best_win_pct.ties} ({seasonRecords.best_win_pct.year})
                  </p>
                </div>
              </div>
            </div>
          )}
          {seasonRecords.most_wins && (
            <div className="rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary ring-inset">
              <div className="flex items-center gap-3">
                <FeaturedIcon icon={Trophy01} color="brand" theme="light" size="md" />
                <div>
                  <p className="text-sm font-medium text-tertiary">Most Wins in a Season</p>
                  <p className="text-lg font-semibold text-primary">{seasonRecords.most_wins.manager}</p>
                  <p className="text-xs text-tertiary">
                    {seasonRecords.most_wins.wins} wins — {seasonRecords.most_wins.wins}-{seasonRecords.most_wins.losses}-{seasonRecords.most_wins.ties} ({seasonRecords.most_wins.year})
                  </p>
                </div>
              </div>
            </div>
          )}
          {seasonRecords.worst_win_pct && (
            <div className="rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary ring-inset">
              <div className="flex items-center gap-3">
                <FeaturedIcon icon={Trophy01} color="error" theme="light" size="md" />
                <div>
                  <p className="text-sm font-medium text-tertiary">Worst Season Win%</p>
                  <p className="text-lg font-semibold text-primary">{seasonRecords.worst_win_pct.manager}</p>
                  <p className="text-xs text-tertiary">
                    {seasonRecords.worst_win_pct.win_pct}% — {seasonRecords.worst_win_pct.wins}-{seasonRecords.worst_win_pct.losses}-{seasonRecords.worst_win_pct.ties} ({seasonRecords.worst_win_pct.year})
                  </p>
                </div>
              </div>
            </div>
          )}
          {activityRecords?.most_moves && (
            <div className="rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary ring-inset">
              <div className="flex items-center gap-3">
                <FeaturedIcon icon={Trophy01} color="warning" theme="light" size="md" />
                <div>
                  <p className="text-sm font-medium text-tertiary">Most Moves in a Season</p>
                  <p className="text-lg font-semibold text-primary">{activityRecords.most_moves.manager}</p>
                  <p className="text-xs text-tertiary">{activityRecords.most_moves.moves} moves ({activityRecords.most_moves.year})</p>
                </div>
              </div>
            </div>
          )}
          {activityRecords?.most_trades && (
            <div className="rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary ring-inset">
              <div className="flex items-center gap-3">
                <FeaturedIcon icon={Trophy01} color="warning" theme="light" size="md" />
                <div>
                  <p className="text-sm font-medium text-tertiary">Most Trades in a Season</p>
                  <p className="text-lg font-semibold text-primary">{activityRecords.most_trades.manager}</p>
                  <p className="text-xs text-tertiary">{activityRecords.most_trades.trades} trades ({activityRecords.most_trades.year})</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Row 2: Career Win% + Career Leaderboard */}
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
        {/* Career Win% Chart */}
        {careerBarData.length > 0 && (
          <div className="flex flex-col gap-5 lg:w-md lg:shrink-0">
            <div className="border-b border-secondary pb-5">
              <p className="text-md font-semibold text-primary">Career Win%</p>
            </div>
            <div className="h-80">
              <ResponsiveContainer initialDimension={{ width: 1, height: 1 }} className="h-full">
                <BarChart
                  data={careerBarData}
                  layout="vertical"
                  className="text-tertiary [&_.recharts-text]:text-xs"
                  margin={{ left: 0, right: 10 }}
                >
                  <CartesianGrid horizontal={false} stroke="currentColor" className="text-utility-neutral-100" />
                  <XAxis type="number" axisLine={false} tickLine={false} domain={[40, 55]} />
                  <YAxis type="category" dataKey="manager" axisLine={false} tickLine={false} width={80} tick={{ fontSize: 11 }} />
                  <RechartsTooltip content={<ChartTooltipContent />} />
                  <Bar
                    isAnimationActive={false}
                    className="text-utility-brand-600"
                    dataKey="Win%"
                    fill="currentColor"
                    maxBarSize={16}
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Career Leaderboard Table */}
        {careers.length > 0 && (
          <div className="flex-1 overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
            <div className="flex items-center justify-between border-b border-secondary px-4 py-4 md:px-6">
              <div className="flex items-center gap-3">
                <h2 className="text-md font-semibold text-primary">Career Leaderboard</h2>
                <Badge color="brand" size="sm">{careers.length} managers</Badge>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-secondary bg-secondary">
                    <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Manager</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">Seasons</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">W-L-T</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">Win%</th>
                    <th className="hidden px-3 py-3 text-center text-xs font-medium text-tertiary md:table-cell">Playoffs</th>
                    <th className="hidden px-3 py-3 text-center text-xs font-medium text-tertiary lg:table-cell">Best</th>
                  </tr>
                </thead>
                <tbody>
                  {[...careers].sort((a, b) => b.win_pct - a.win_pct).map((c, idx) => (
                    <tr key={c.manager} className={cx("border-b border-secondary", idx === 0 && "bg-brand-primary/30")}>
                      <td className="px-4 py-3 md:px-6">
                        <span className="text-sm font-medium text-primary">{c.manager}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-sm tabular-nums text-secondary">{c.seasons}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-sm tabular-nums text-secondary">{c.wins}-{c.losses}-{c.ties}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={cx("text-sm font-semibold tabular-nums", c.win_pct >= 50 ? "text-success-primary" : "text-secondary")}>
                          {c.win_pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="hidden px-3 py-3 text-center md:table-cell">
                        <span className="text-sm tabular-nums text-secondary">{c.playoffs}</span>
                      </td>
                      <td className="hidden px-3 py-3 text-center lg:table-cell">
                        <Badge size="sm" color={c.best_finish === 1 ? "success" : c.best_finish <= 3 ? "brand" : "gray"}>
                          #{c.best_finish} ({c.best_year})
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Playoff Appearances + First Draft Picks */}
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
        {/* Playoff Appearances */}
        {playoffAppearances.length > 0 && (
          <div className="flex-1 overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
            <div className="flex items-center justify-between border-b border-secondary px-4 py-4 md:px-6">
              <h2 className="text-md font-semibold text-primary">Playoff Appearances</h2>
            </div>
            <div className="divide-y divide-secondary">
              {playoffAppearances.map((p) => (
                <div key={p.manager} className="flex items-center justify-between px-4 py-3 md:px-6">
                  <span className="text-sm font-medium text-primary">{p.manager}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm tabular-nums text-secondary">{p.appearances}</span>
                    <ProgressBarBase value={p.appearances} max={sortedSeasons.length} className="h-2 w-24" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* First Overall Draft Picks */}
        {firstPicks.length > 0 && (
          <div className="flex-1 overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
            <div className="flex items-center justify-between border-b border-secondary px-4 py-4 md:px-6">
              <h2 className="text-md font-semibold text-primary">#1 Overall Draft Picks</h2>
            </div>
            <div className="divide-y divide-secondary">
              {[...firstPicks].reverse().map((p) => (
                <div key={p.year} className="flex items-center gap-4 px-4 py-3 md:px-6">
                  <span className="w-12 text-sm font-semibold tabular-nums text-brand-secondary">{p.year}</span>
                  <span className="text-sm font-medium text-primary">{p.player}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Champions Timeline */}
      <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
        <div className="flex items-center justify-between border-b border-secondary px-4 py-4 md:px-6">
          <h2 className="text-md font-semibold text-primary">Champions Timeline</h2>
        </div>
        <div className="divide-y divide-secondary">
          {champions.length > 0
            ? [...champions].reverse().map((c) => (
                <div key={c.year} className="flex items-center gap-4 px-4 py-3 md:px-6">
                  <span className="w-12 text-sm font-semibold tabular-nums text-brand-secondary">{c.year}</span>
                  <Badge size="sm" color="success">🏆</Badge>
                  <span className="flex-1 text-sm font-medium text-primary">{c.team_name}</span>
                  <span className="text-xs text-tertiary">{c.manager}</span>
                  <span className="text-xs tabular-nums text-tertiary">{c.record}</span>
                </div>
              ))
            : [...sortedSeasons].reverse().map((s) => (
                <div key={s.year} className="flex items-center gap-4 px-4 py-3 md:px-6">
                  <span className="w-12 text-sm font-semibold tabular-nums text-brand-secondary">{s.year}</span>
                  <Badge size="sm" color="success">🏆</Badge>
                  <span className="flex-1 text-sm font-medium text-primary">{s.champion}</span>
                </div>
              ))
          }
        </div>
      </div>

      {/* Past Standings Browser */}
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-4 border-b border-secondary pb-5">
          <p className="text-md font-semibold text-primary">Past Standings</p>
          <Select
            placeholder="Select year"
            aria-label="Year"
            items={yearItems}
            onSelectionChange={(key) => setSelectedYear(key ? Number(key) : null)}
          >
            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
          </Select>
        </div>

        {pastStandings && pastStandings.length > 0 && (
          <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-secondary bg-secondary">
                    <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Rank</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Team</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-tertiary">Manager</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-tertiary">Record</th>
                  </tr>
                </thead>
                <tbody>
                  {pastStandings.map((entry, idx) => (
                    <tr key={idx} className={cx("border-b border-secondary", idx === 0 && "bg-brand-primary/30")}>
                      <td className="px-4 py-3 md:px-6">
                        <span className={cx("text-sm font-semibold", idx < 3 ? "text-brand-secondary" : "text-primary")}>
                          {entry.rank}
                        </span>
                      </td>
                      <td className="px-4 py-3 md:px-6">
                        <span className="text-sm font-medium text-primary">{entry.team_name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-secondary">{entry.manager}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm tabular-nums text-secondary">{entry.record}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};
