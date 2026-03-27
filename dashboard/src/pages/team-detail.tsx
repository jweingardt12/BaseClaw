import { useParams } from "react-router";
import { motion } from "motion/react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";
import { ChartTooltipContent } from "@/components/application/charts/charts-base";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge } from "@/components/base/badges/badges";
import { useApi } from "@/hooks/use-api";
import { getPositionalRanks, getStandings } from "@/lib/api";


export const TeamDetailPage = () => {
  const { teamId } = useParams();
  const teamName = teamId ? decodeURIComponent(teamId) : "";

  const { data: standings } = useApi(getStandings, [], "/standings");
  const { data: posRanks } = useApi(getPositionalRanks, [], "/positional-ranks");

  const team = standings?.find((s) => s.team === teamName);
  const teamRanks = posRanks?.teams?.find((t) => t.name === teamName);

  if (!teamName) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <p className="text-sm text-tertiary">Select a team from standings</p>
      </div>
    );
  }

  // Build radar chart data from categories
  const catEntries = team?.categories ? Object.entries(team.categories) : [];
  const radarData = catEntries.map(([cat, data]) => ({
    category: cat,
    Rank: 13 - data.rank, // Invert so higher = better
    Value: data.value,
  }));

  const gradeColors = {
    strong: "success",
    neutral: "gray",
    weak: "error",
  } as const;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex flex-col gap-8 px-4 lg:px-8">
      {/* Team Header */}
      <div className="flex items-center gap-4">
        <Avatar
          src={team?.team_logo || teamRanks?.team_logo}
          alt={teamName}
          size="xl"
          initials={teamName.slice(0, 2).toUpperCase()}
        />
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold text-primary">{teamName}</h2>
          <div className="flex items-center gap-3">
            {team && (
              <>
                <span className="text-sm text-secondary">
                  {team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ""} (Rank #{team.rank})
                </span>
                {team.powerRank > 0 && (
                  <Badge size="sm" color="brand">Power #{team.powerRank}</Badge>
                )}
              </>
            )}
            {teamRanks?.manager && (
              <span className="text-sm text-tertiary">Mgr: {teamRanks.manager}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
        {/* Positional Ranks */}
        {teamRanks && (
          <div className="flex-1 overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
            <div className="flex items-center justify-between border-b border-secondary px-4 py-4 md:px-6">
              <h3 className="text-md font-semibold text-primary">Positional Strength</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-secondary bg-secondary">
                    <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Position</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-tertiary">Rank</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-tertiary">Grade</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-medium text-tertiary lg:table-cell">Starters</th>
                  </tr>
                </thead>
                <tbody>
                  {teamRanks.positional_ranks.map((pos) => (
                    <tr key={pos.position} className="border-b border-secondary">
                      <td className="px-4 py-3 md:px-6">
                        <span className="text-sm font-medium text-primary">{pos.position}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm tabular-nums text-secondary">#{pos.rank}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge size="sm" color={gradeColors[pos.grade]}>
                          {pos.grade}
                        </Badge>
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        <span className="text-xs text-tertiary">
                          {pos.starters.map((s) => s.name).join(", ") || "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Category Radar */}
        {radarData.length > 0 && (
          <div className="flex flex-col gap-5 lg:max-w-sm lg:min-w-sm">
            <div className="flex items-start justify-between border-b border-secondary pb-5">
              <p className="text-md font-semibold text-primary">Category Rankings</p>
            </div>
            <ResponsiveContainer initialDimension={{ width: 1, height: 1 }} className="min-h-[320px]">
              <RadarChart
                data={radarData}
                className="font-medium text-tertiary [&_.recharts-polar-grid]:text-utility-neutral-100 [&_.recharts-text]:text-xs"
              >
                <PolarGrid stroke="currentColor" className="text-utility-neutral-100" />
                <PolarAngleAxis
                  dataKey="category"
                  stroke="currentColor"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: "currentColor" }}
                />
                <PolarRadiusAxis axisLine={false} tick={false} domain={[0, 12]} />
                <RechartsTooltip content={<ChartTooltipContent />} />
                <Radar
                  isAnimationActive={false}
                  className="text-utility-brand-600"
                  dataKey="Rank"
                  name="Rank (inverted)"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  fill="currentColor"
                  fillOpacity={0.2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Fallback if no data */}
        {!teamRanks && radarData.length === 0 && (
          <div className="flex flex-1 items-center justify-center py-12">
            <p className="text-sm text-tertiary">
              Detailed team data will be available once the season starts
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
};
