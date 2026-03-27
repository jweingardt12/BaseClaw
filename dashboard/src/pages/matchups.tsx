import { useState } from "react";
import { ChevronLeft, ChevronRight, Rows01 } from "@untitledui/icons";
import { motion } from "motion/react";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { MatchupCard } from "@/components/application/matchup-card/matchup-card";
import { StatBar } from "@/components/application/stat-bar/stat-bar";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { useApi } from "@/hooks/use-api";
import { useLeague } from "@/hooks/use-league";
import { getMatchupDetail, getScoreboard } from "@/lib/api";

export const MatchupsPage = () => {
  const league = useLeague();
  const currentWeek = league?.current_week || 1;
  const [selectedMatchup, setSelectedMatchup] = useState<number>(0);

  const { data: scoreboard, loading, error, refetch } = useApi(getScoreboard);
  const { data: myMatchup } = useApi(getMatchupDetail);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <LoadingIndicator size="md" label="Loading matchups..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
        <p className="text-sm text-error-primary">Failed to load matchups</p>
        <button onClick={refetch} className="text-sm font-semibold text-brand-secondary underline">Retry</button>
      </div>
    );
  }

  const matchups = scoreboard?.matchups || [];
  const week = (scoreboard as unknown as Record<string, unknown>)?.week || currentWeek;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex flex-col gap-8 px-4 lg:px-8">
      {/* Week Navigation */}
      <div className="flex items-center gap-3">
        <Button size="sm" color="secondary" iconLeading={ChevronLeft} aria-label="Previous week" />
        <div className="flex items-center gap-2">
          <span className="text-md font-semibold text-primary">Week {String(week)}</span>
          <Badge size="sm" color="brand">{matchups.length} matchups</Badge>
        </div>
        <Button size="sm" color="secondary" iconLeading={ChevronRight} aria-label="Next week" />
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
        {/* Matchup Cards Grid */}
        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {matchups.map((m, idx) => (
            <MatchupCard
              key={`${m.team1}-${m.team2}`}
              team1={m.team1}
              team2={m.team2}
              team1Logo={m.team1_logo}
              team2Logo={m.team2_logo}
              status={m.status}
              isSelected={selectedMatchup === idx}
              onClick={() => setSelectedMatchup(idx)}
            />
          ))}
          {matchups.length === 0 && (
            <div className="col-span-full py-12">
              <EmptyState size="sm">
                <EmptyState.Header><EmptyState.FeaturedIcon icon={Rows01} color="gray" /></EmptyState.Header>
                <EmptyState.Content>
                  <EmptyState.Title>No Matchups</EmptyState.Title>
                  <EmptyState.Description>There are no matchups scheduled for this week.</EmptyState.Description>
                </EmptyState.Content>
              </EmptyState>
            </div>
          )}
        </div>

        {/* Category Breakdown — Featured Matchup */}
        {myMatchup && (
          <div className="flex w-full flex-col gap-5 lg:max-w-md lg:min-w-md">
            <div className="flex items-start justify-between border-b border-secondary pb-4">
              <div>
                <p className="text-md font-semibold text-primary">Category Breakdown</p>
                <p className="mt-1 text-sm text-tertiary">
                  {myMatchup.score.wins}-{myMatchup.score.losses}-{myMatchup.score.ties}
                </p>
              </div>
              <Badge
                size="sm"
                color={
                  myMatchup.score.wins > myMatchup.score.losses
                    ? "success"
                    : myMatchup.score.wins < myMatchup.score.losses
                      ? "error"
                      : "gray"
                }
              >
                {myMatchup.score.wins > myMatchup.score.losses
                  ? "Winning"
                  : myMatchup.score.wins < myMatchup.score.losses
                    ? "Losing"
                    : "Tied"}
              </Badge>
            </div>

            {/* Team Headers */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Avatar src={myMatchup.my_team_logo} alt={myMatchup.my_team} size="xs" />
                <span className="text-xs font-medium text-secondary">{myMatchup.my_team}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-secondary">{myMatchup.opponent}</span>
                <Avatar src={myMatchup.opp_team_logo} alt={myMatchup.opponent} size="xs" />
              </div>
            </div>

            {/* Category Bars */}
            <div className="flex flex-col gap-2">
              {myMatchup.categories.map((cat) => (
                <StatBar
                  key={cat.name}
                  label={cat.name}
                  leftValue={cat.my_value}
                  rightValue={cat.opp_value}
                  result={cat.result}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};
