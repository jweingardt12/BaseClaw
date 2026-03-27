import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { motion } from "motion/react";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { ChartTooltipContent } from "@/components/application/charts/charts-base";
import { Badge } from "@/components/base/badges/badges";
import { Avatar } from "@/components/base/avatar/avatar";
import { Select } from "@/components/base/select/select";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { PieChart03 } from "@untitledui/icons";
import { useApi } from "@/hooks/use-api";
import { getScheduleAnalysis, getStandings } from "@/lib/api";
import { cx } from "@/utils/cx";

export const PlayoffsPage = () => {
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const { data: standings, loading, error, refetch } = useApi(getStandings, [], "/standings");

  useEffect(() => {
    if (standings?.length && !selectedTeam) {
      setSelectedTeam(standings[0].team);
    }
  }, [standings, selectedTeam]);

  const { data: schedule } = useApi(
    () => getScheduleAnalysis(selectedTeam || undefined),
    [selectedTeam],
  );

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <LoadingIndicator size="md" label="Loading playoff picture..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
        <p className="text-sm text-error-primary">Failed to load playoff data</p>
        <button onClick={refetch} className="text-sm font-semibold text-brand-secondary underline">Retry</button>
      </div>
    );
  }

  const teams = standings || [];
  const bubbleTeams = teams.slice(4, 8);
  const hasSeasonData = teams.some((t) => t.wins > 0 || t.losses > 0);

  if (!hasSeasonData) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex flex-col gap-8 px-4 lg:px-8">
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <FeaturedIcon icon={PieChart03} color="brand" theme="light" size="xl" />
          <h2 className="text-lg font-semibold text-primary">Playoff Picture</h2>
          <p className="text-sm text-tertiary">
            Playoff projections will be available once the season starts
          </p>
        </div>

        {/* Projected Seedings */}
        <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
          <div className="flex items-center justify-between border-b border-secondary px-4 py-4 md:px-6">
            <div className="flex items-center gap-3">
              <h2 className="text-md font-semibold text-primary">Projected Seedings</h2>
              <Badge color="brand" size="sm">Top 6 qualify</Badge>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-secondary bg-secondary">
                  <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Seed</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Team</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-tertiary">Record</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-tertiary">Status</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team, idx) => (
                  <tr
                    key={team.team}
                    className={cx(
                      "border-b border-secondary",
                      idx < 6 ? "bg-success-primary/5" : "",
                    )}
                  >
                    <td className="px-4 py-3 md:px-6">
                      <span className="text-sm font-semibold text-primary">#{idx + 1}</span>
                    </td>
                    <td className="px-4 py-3 md:px-6">
                      <div className="flex items-center gap-3">
                        <Avatar src={team.team_logo} alt={team.team} size="sm" initials={team.team.slice(0, 2).toUpperCase()} />
                        <span className="text-sm font-medium text-primary">{team.team}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm text-secondary">
                        {team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        size="sm"
                        color={idx < 6 ? "success" : idx < 8 ? "warning" : "gray"}
                      >
                        {idx < 6 ? "Playoff" : idx < 8 ? "Bubble" : "Out"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    );
  }

  // Once season starts, show the full playoff picture
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex flex-col gap-8 px-4 lg:px-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <div className="rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary ring-inset">
          <p className="text-sm font-medium text-tertiary">Playoff Teams</p>
          <p className="mt-1 text-display-xs font-semibold text-primary">6</p>
        </div>
        <div className="rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary ring-inset">
          <p className="text-sm font-medium text-tertiary">Games Back (6th)</p>
          <p className="mt-1 text-display-xs font-semibold text-primary">
            {teams[5]?.gb ?? "—"}
          </p>
        </div>
        <div className="rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary ring-inset">
          <p className="text-sm font-medium text-tertiary">Bubble Teams</p>
          <p className="mt-1 text-display-xs font-semibold text-primary">
            {bubbleTeams.map((t) => t.team).join(", ") || "—"}
          </p>
        </div>
      </div>

      {/* Same seedings table as above */}
      <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
        <div className="flex items-center justify-between border-b border-secondary px-4 py-4 md:px-6">
          <div className="flex items-center gap-3">
            <h2 className="text-md font-semibold text-primary">Current Seedings</h2>
            <Badge color="brand" size="sm">Top 6 qualify</Badge>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-secondary bg-secondary">
                <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Seed</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Team</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-tertiary">Record</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-tertiary">GB</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-tertiary">Status</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team, idx) => (
                <tr key={team.team} className={cx("border-b border-secondary", idx < 6 && "bg-success-primary/5")}>
                  <td className="px-4 py-3 md:px-6"><span className="text-sm font-semibold text-primary">#{idx + 1}</span></td>
                  <td className="px-4 py-3 md:px-6">
                    <div className="flex items-center gap-3">
                      <Avatar src={team.team_logo} alt={team.team} size="sm" initials={team.team.slice(0, 2).toUpperCase()} />
                      <span className="text-sm font-medium text-primary">{team.team}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center"><span className="text-sm text-secondary">{team.wins}-{team.losses}</span></td>
                  <td className="px-4 py-3 text-center"><span className="text-sm text-secondary">{team.gb || "—"}</span></td>
                  <td className="px-4 py-3 text-center">
                    <Badge size="sm" color={idx < 6 ? "success" : idx < 8 ? "warning" : "error"}>
                      {idx < 6 ? "In" : idx < 8 ? "Bubble" : "Out"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Schedule Strength Chart */}
      {teams.length > 0 && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 border-b border-secondary pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-md font-semibold text-primary">Schedule Strength</p>
              <p className="mt-1 text-xs text-tertiary">Difficulty rating per remaining week</p>
            </div>
            <Select
              size="sm"
              aria-label="Select team"
              placeholder="Select team"
              selectedKey={selectedTeam}
              onSelectionChange={(key) => setSelectedTeam(String(key))}
              items={teams.map((t) => ({ id: t.team }))}
              className="w-full sm:w-64"
            >
              {(item) => (
                <Select.Item id={item.id} textValue={String(item.id)}>
                  {String(item.id)}
                </Select.Item>
              )}
            </Select>
          </div>
          {schedule?.weeks && schedule.weeks.length > 0 ? (
          <div className="h-48 lg:h-64">
            <ResponsiveContainer initialDimension={{ width: 1, height: 1 }} className="h-full">
              <BarChart
                data={schedule.weeks.map((w) => ({
                  week: `Wk ${w.week}`,
                  Difficulty: w.difficulty === "hard" ? 3 : w.difficulty === "medium" ? 2 : 1,
                  opponent: w.opponent,
                }))}
                className="text-tertiary [&_.recharts-text]:text-xs"
                margin={{ left: 0, right: 0 }}
              >
                <CartesianGrid vertical={false} stroke="currentColor" className="text-utility-neutral-100" />
                <XAxis dataKey="week" axisLine={false} tickLine={false} tickMargin={10} />
                <YAxis axisLine={false} tickLine={false} width={30} domain={[0, 4]} tick={false} />
                <RechartsTooltip content={<ChartTooltipContent />} />
                <Bar
                  isAnimationActive={false}
                  dataKey="Difficulty"
                  fill="currentColor"
                  maxBarSize={24}
                  radius={[4, 4, 0, 0]}
                >
                  {schedule.weeks.map((w, i) => (
                    <Cell
                      key={i}
                      className={
                        w.difficulty === "hard"
                          ? "text-utility-error-500"
                          : w.difficulty === "medium"
                            ? "text-utility-warning-500"
                            : "text-utility-success-500"
                      }
                      fill="currentColor"
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          ) : (
            <div className="py-8">
              <EmptyState size="sm">
                <EmptyState.Header><EmptyState.FeaturedIcon icon={PieChart03} color="gray" /></EmptyState.Header>
                <EmptyState.Content>
                  <EmptyState.Title>{selectedTeam ? "No Schedule Data" : "Select a Team"}</EmptyState.Title>
                  <EmptyState.Description>{selectedTeam ? "Schedule data is not available for this team." : "Select a team above to view schedule strength."}</EmptyState.Description>
                </EmptyState.Content>
              </EmptyState>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};
