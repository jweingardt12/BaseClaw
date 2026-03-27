import { useCallback, useMemo, useState } from "react";
import { ArrowDown, BarChartSquare02, ChevronSelectorVertical, HelpCircle, SearchLg, TrendDown01, TrendUp01 } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { ProgressBarBase } from "@/components/base/progress-indicators/progress-indicators";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge, BadgeWithIcon } from "@/components/base/badges/badges";
import { Input } from "@/components/base/input/input";
import { TabList, Tabs } from "@/components/application/tabs/tabs";
import { useApi } from "@/hooks/use-api";
import {
  getBatTrackingBreakouts,
  getBreakoutCandidates,
  getBustCandidates,
  getCloserMonitor,
  getLeagueIntel,
  getLeaguePulse,
  getPlayerIntel,
  getPlayerTier,
  getPositionalRanks,
  getProjectionDisagreements,
  getRankings,
  getSeasonPace,
  getStandings,
  getStandingsDetailed,
  type DetailedStanding,
  getRegressionCandidates,
  getTrendingPlayers,
  getZscoreShifts,
} from "@/lib/api";
import { cx } from "@/utils/cx";

const mlbHeadshot = (mlbId?: number) =>
  mlbId ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${mlbId}/headshot/67/current` : undefined;

type TopTab = "managers" | "players";
type PlayerView = "rankings" | "movers" | "buysell" | "breakouts" | "busts" | "battracking" | "trending" | "projections" | "closers";
type SortDir = "asc" | "desc";
type SortState = { key: string; dir: SortDir } | null;

function useSort<T>(data: T[], defaultSort?: SortState, getValue?: (item: T, key: string) => unknown) {
  const [sort, setSort] = useState<SortState>(defaultSort ?? null);
  const toggle = useCallback((key: string) => {
    setSort((prev) =>
      prev?.key === key
        ? prev.dir === "desc" ? { key, dir: "asc" } : null
        : { key, dir: "desc" },
    );
  }, []);
  const sorted = useMemo(() => {
    if (!sort) return data;
    return [...data].sort((a, b) => {
      const av = getValue ? getValue(a, sort.key) : (a as Record<string, unknown>)[sort.key];
      const bv = getValue ? getValue(b, sort.key) : (b as Record<string, unknown>)[sort.key];
      const an = typeof av === "number" ? av : parseFloat(String(av)) || 0;
      const bn = typeof bv === "number" ? bv : parseFloat(String(bv)) || 0;
      return sort.dir === "desc" ? bn - an : an - bn;
    });
  }, [data, sort, getValue]);
  return { sorted, sort, toggle };
}

const SortTh = ({
  label, sortKey, sort, onSort, className, tooltip,
}: {
  label: string; sortKey: string; sort: SortState; onSort: (key: string) => void; className?: string; tooltip?: string;
}) => (
  <th
    className={cx("cursor-pointer select-none px-3 py-3 text-center text-xs font-medium text-tertiary transition duration-100 ease-linear hover:text-secondary", className)}
    onClick={() => onSort(sortKey)}
  >
    <span className="inline-flex items-center gap-1">
      {label}
      {tooltip && (
        <Tooltip title={tooltip} placement="top">
          <TooltipTrigger className="text-fg-quaternary hover:text-fg-quaternary_hover"><HelpCircle className="size-3" /></TooltipTrigger>
        </Tooltip>
      )}
      {sort?.key === sortKey ? (
        <ArrowDown className={cx("size-3 stroke-[3px] text-fg-quaternary", sort.dir === "asc" && "rotate-180")} />
      ) : (
        <ChevronSelectorVertical className="size-3 stroke-[3px] text-fg-quaternary opacity-40" />
      )}
    </span>
  </th>
);

// --- Team Rankings Table with all category stats ---

const RATE_STATS = new Set(["AVG", "OBP", "ERA", "WHIP"]);

function formatStat(name: string, value: number): string {
  if (RATE_STATS.has(name)) return value.toFixed(3).replace(/^0/, "");
  if (name === "IP") return value.toFixed(1);
  return String(Math.round(value));
}

const TeamRankingsTable = ({ teams, categories }: { teams: DetailedStanding[]; categories: string[] }) => {
  const { sorted, sort, toggle } = useSort(
    teams,
    { key: "rank", dir: "asc" },
    (item, key) => {
      if (key === "rank") return item.rank;
      if (key === "name") return item.name;
      return item.stats[key] ?? 0;
    },
  );

  // Deduplicate category names (K appears for both B and P)
  const uniqueCats = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const c of categories) {
      if (seen.has(c)) {
        result.push(c + " (P)");
      } else {
        seen.add(c);
        result.push(c);
      }
    }
    return result;
  }, [categories]);

  // Map display names back to stat keys (handle K duplication)
  const catKeys = useMemo(() => {
    const keys: string[] = [];
    const kCount: Record<string, number> = {};
    for (const c of categories) {
      kCount[c] = (kCount[c] || 0) + 1;
      keys.push(c);
    }
    return keys;
  }, [categories]);

  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-secondary bg-secondary">
          <th className="sticky left-0 z-10 bg-secondary px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">#</th>
          <th className="sticky left-10 z-10 bg-secondary px-4 py-3 text-left text-xs font-medium text-tertiary md:left-14">Team</th>
          {uniqueCats.map((cat, i) => (
            <SortTh key={cat} label={cat} sortKey={catKeys[i]} sort={sort} onSort={toggle} />
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((t, idx) => (
          <tr key={t.name} className="border-b border-secondary transition duration-100 ease-linear hover:bg-primary_hover">
            <td className="sticky left-0 z-10 bg-primary px-4 py-3 md:px-6">
              <span className="text-sm font-semibold tabular-nums text-primary">{t.rank || idx + 1}</span>
            </td>
            <td className="sticky left-10 z-10 bg-primary px-4 py-3 md:left-14">
              <div className="flex items-center gap-3">
                <Avatar src={t.team_logo} alt={t.name} size="sm" initials={t.name.slice(0, 2).toUpperCase()} />
                <span className="whitespace-nowrap text-sm font-medium text-primary">{t.name}</span>
              </div>
            </td>
            {catKeys.map((cat, i) => {
              const val = t.stats[cat] ?? 0;
              return (
                <td key={uniqueCats[i]} className="px-3 py-3 text-center">
                  <span className="text-sm tabular-nums text-secondary">{formatStat(cat, val)}</span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// --- Managers Tab ---

const ManagersTab = () => {
  const { data: intelData } = useApi(getLeagueIntel, [], "/league-intel");
  const { data: positional } = useApi(getPositionalRanks, [], "/positional-ranks");
  const { data: pulse, loading: pulseLoading } = useApi(getLeaguePulse, [], "/league-pulse");
  const { data: standings } = useApi(getStandings, [], "/standings");
  const { data: paceData } = useApi(getSeasonPace, [], "/season-pace");
  const { data: detailedData } = useApi(getStandingsDetailed, [], "/standings-detailed");

  const detailedTeams = detailedData?.standings || [];
  const statCategories = detailedData?.categories || [];

  const posTeams = positional?.teams || [];
  const pulseTeams = pulse || [];
  const h2hMatrix = intelData?.h2h_matrix || [];

  const paceTeams = paceData?.teams || [];
  const standingsTeams = standings || [];

  const sortedPulse = useMemo(() => [...pulseTeams].sort((a, b) => b.total - a.total), [pulse]);
  const mostActive = sortedPulse[0] ?? null;

  const activityData = useMemo(() =>
    sortedPulse.map((t) => ({ name: t.name, Moves: t.moves, Trades: t.trades })),
    [sortedPulse],
  );

  const POSITIONS = ["C", "1B", "2B", "3B", "SS", "OF", "SP", "RP"];
  const gradeColor = (grade: string): "success" | "error" | "gray" =>
    grade === "strong" ? "success" : grade === "weak" ? "error" : "gray";

  const leader = standingsTeams[0];

  if (pulseLoading && !pulse) {
    return <div className="flex justify-center py-12"><LoadingIndicator size="md" label="Loading manager analytics..." /></div>;
  }

  return (
    <div className="flex flex-col gap-8">
      {/* KPI Summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary ring-inset">
          <p className="text-sm font-medium text-tertiary">Teams</p>
          <p className="mt-1 text-display-xs font-semibold text-primary">{standingsTeams.length || 12}</p>
        </div>
        <div className="rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary ring-inset">
          <p className="text-sm font-medium text-tertiary">Leader</p>
          <p className="mt-1 text-display-xs font-semibold text-primary">{leader?.team || "—"}</p>
          {leader && <p className="text-xs text-tertiary">{leader.wins}-{leader.losses}</p>}
        </div>
        <div className="rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary ring-inset">
          <p className="text-sm font-medium text-tertiary">Most Active</p>
          <p className="mt-1 text-display-xs font-semibold text-primary">{mostActive?.name || "—"}</p>
          {mostActive && <p className="text-xs text-tertiary">{mostActive.total} moves</p>}
        </div>
        <div className="rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary ring-inset">
          <p className="text-sm font-medium text-tertiary">Ranked Teams</p>
          <p className="mt-1 text-display-xs font-semibold text-primary">{detailedTeams.length || standingsTeams.length || 12}</p>
        </div>
      </div>

      {/* Team Rankings Table */}
      {detailedTeams.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
          <div className="flex items-center justify-between border-b border-secondary px-4 py-4 md:px-6">
            <div className="flex items-center gap-3">
              <h2 className="text-md font-semibold text-primary">Team Rankings</h2>
              <Badge color="brand" size="sm">{detailedTeams.length} teams</Badge>
            </div>
          </div>
          <div className="overflow-x-auto">
            <TeamRankingsTable teams={detailedTeams} categories={statCategories} />
          </div>
        </div>
      )}

      {/* Positional Grades — full width */}
      {posTeams.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
          <div className="border-b border-secondary px-4 py-4 md:px-6">
            <h2 className="text-md font-semibold text-primary">Positional Grades</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-secondary bg-secondary">
                  <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Team</th>
                  {POSITIONS.map((p) => (
                    <th key={p} className="px-2 py-3 text-center text-xs font-medium text-tertiary">{p}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {posTeams.map((t) => (
                  <tr key={t.team_key} className="border-b border-secondary">
                    <td className="px-4 py-2 md:px-6">
                      <div className="flex items-center gap-2">
                        <Avatar src={t.team_logo} alt={t.name} size="xs" initials={t.name.slice(0, 2).toUpperCase()} />
                        <span className="text-xs font-medium text-primary">{t.name}</span>
                      </div>
                    </td>
                    {POSITIONS.map((pos) => {
                      const rank = t.positional_ranks?.find((r) => r.position === pos);
                      return (
                        <td key={pos} className="px-2 py-2 text-center">
                          {rank ? <Badge size="sm" color={gradeColor(rank.grade)}>{rank.rank}</Badge> : <span className="text-xs text-tertiary">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* League Activity — table instead of chart for clarity */}
      {activityData.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
          <div className="border-b border-secondary px-4 py-4 md:px-6">
            <div className="flex items-center gap-3">
              <h2 className="text-md font-semibold text-primary">League Activity</h2>
              <Badge color="brand" size="sm">{activityData.length} teams</Badge>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-secondary bg-secondary">
                  <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Team</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">Moves</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">Trades</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">Total</th>
                  <th className="hidden px-3 py-3 text-left text-xs font-medium text-tertiary md:table-cell">Activity</th>
                </tr>
              </thead>
              <tbody>
                {activityData.map((t) => {
                  const total = t.Moves + t.Trades;
                  const maxTotal = activityData[0]?.Moves + activityData[0]?.Trades || 1;
                  return (
                    <tr key={t.name} className="border-b border-secondary">
                      <td className="px-4 py-3 md:px-6">
                        <span className="text-sm font-medium text-primary">{t.name}</span>
                      </td>
                      <td className="px-3 py-3 text-center"><span className="text-sm tabular-nums text-secondary">{t.Moves}</span></td>
                      <td className="px-3 py-3 text-center"><span className="text-sm tabular-nums text-secondary">{t.Trades}</span></td>
                      <td className="px-3 py-3 text-center"><span className="text-sm font-semibold tabular-nums text-primary">{total}</span></td>
                      <td className="hidden px-3 py-3 md:table-cell">
                        <ProgressBarBase value={total} max={maxTotal} className="h-2 w-32" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Season Pace / Playoff Race */}
      {paceTeams.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
          <div className="border-b border-secondary px-4 py-4 md:px-6">
            <div className="flex items-center gap-3">
              <h2 className="text-md font-semibold text-primary">Playoff Race</h2>
              <Badge color="brand" size="sm">{paceTeams.length} teams</Badge>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-secondary bg-secondary">
                  <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-tertiary">Team</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">Record</th>
                  <th className="hidden px-3 py-3 text-center text-xs font-medium text-tertiary md:table-cell">Proj W-L</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">Status</th>
                  <th className="hidden px-3 py-3 text-center text-xs font-medium text-tertiary lg:table-cell">Magic #</th>
                </tr>
              </thead>
              <tbody>
                {paceTeams.map((t, idx) => (
                  <tr key={t.name} className={cx("border-b border-secondary", idx < 6 && "bg-success-primary/5")}>
                    <td className="px-4 py-3 md:px-6"><span className="text-sm font-semibold text-primary">{t.rank || idx + 1}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar src={t.team_logo} alt={t.name} size="sm" initials={t.name.slice(0, 2).toUpperCase()} />
                        <span className="text-sm font-medium text-primary">{t.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center"><span className="text-sm tabular-nums text-secondary">{t.wins}-{t.losses}{t.ties ? `-${t.ties}` : ""}</span></td>
                    <td className="hidden px-3 py-3 text-center md:table-cell"><span className="text-sm tabular-nums text-secondary">{t.projected_wins ?? "—"}-{t.projected_losses ?? "—"}</span></td>
                    <td className="px-3 py-3 text-center">
                      <Badge size="sm" color={t.playoff_status === "clinched" ? "success" : t.playoff_status === "contending" ? "brand" : t.playoff_status === "eliminated" ? "error" : "gray"}>
                        {t.playoff_status || (idx < 6 ? "In" : "Out")}
                      </Badge>
                    </td>
                    <td className="hidden px-3 py-3 text-center lg:table-cell"><span className="text-sm tabular-nums text-secondary">{t.magic_number ?? "—"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* H2H Matrix */}
      {h2hMatrix.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
          <div className="border-b border-secondary px-4 py-4 md:px-6">
            <h2 className="text-md font-semibold text-primary">Head-to-Head Records</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-secondary bg-secondary">
                  <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Team</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">Opponent</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">Record</th>
                </tr>
              </thead>
              <tbody>
                {h2hMatrix.map((entry, idx) => (
                  <tr key={idx} className="border-b border-secondary">
                    <td className="px-4 py-3 md:px-6"><span className="text-sm font-medium text-primary">{String(entry.team1 || entry.team || "—")}</span></td>
                    <td className="px-3 py-3 text-center"><span className="text-sm text-secondary">{String(entry.team2 || entry.opponent || "—")}</span></td>
                    <td className="px-3 py-3 text-center"><span className="text-sm tabular-nums text-secondary">{String(entry.record || `${entry.wins ?? 0}-${entry.losses ?? 0}-${entry.ties ?? 0}`)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Player Detail Panel ---

const PlayerDetailPanel = ({ playerName, mlbId, onClose }: { playerName: string; mlbId?: number; onClose: () => void }) => {
  const { data: intel, loading: intelLoading } = useApi(
    () => getPlayerIntel(playerName),
    [playerName],
  );
  const { data: tier } = useApi(
    () => getPlayerTier(playerName),
    [playerName],
  );

  const statcast = intel?.statcast;
  const trends = intel?.trends;
  const headlines = intel?.news_context?.headlines;

  const tierColors: Record<string, string> = {
    Untouchable: "success",
    Elite: "brand",
    Strong: "blue",
    Solid: "gray",
    Fringe: "warning",
    Droppable: "error",
  };

  const PercentileBar = ({ label, value, pct }: { label: string; value: string | number; pct: number | null }) => (
    <div className="flex items-center gap-3">
      <span className="w-20 text-xs text-tertiary">{label}</span>
      <div className="flex-1">
        <ProgressBarBase
          value={pct ?? 0}
          className="h-2"
          progressClassName={(pct ?? 0) >= 80 ? "bg-fg-success-primary" : (pct ?? 0) >= 50 ? "bg-fg-brand-primary" : "bg-fg-warning-primary"}
        />
      </div>
      <span className="w-14 text-right text-xs tabular-nums text-secondary">{value}</span>
      {pct != null && <span className="w-10 text-right text-xs tabular-nums text-tertiary">{pct}th</span>}
    </div>
  );

  return (
    <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-secondary px-5 py-4">
        <div className="flex items-center gap-3">
          <Avatar src={mlbHeadshot(mlbId)} alt={playerName} initials={playerName.split(" ").map((n) => n[0]).join("").slice(0, 2)} size="md" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-md font-semibold text-primary">{playerName}</span>
              {tier && (
                <Badge size="sm" color={(tierColors[tier.tier] || "gray") as "success" | "brand" | "gray" | "warning" | "error"}>
                  {tier.tier}
                </Badge>
              )}
              {trends && (
                <Badge size="sm" color={trends.status === "hot" ? "success" : trends.status === "ice" ? "error" : "gray"}>
                  {trends.status}
                </Badge>
              )}
            </div>
            {tier && (
              <p className="mt-0.5 text-xs text-tertiary">
                {tier.team} &middot; {tier.pos || "—"} &middot; Rank #{tier.rank} &middot; Z-Score: {tier.z_final?.toFixed(1)}
              </p>
            )}
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-tertiary transition duration-100 ease-linear hover:bg-secondary hover:text-primary">Close</button>
      </div>

      {intelLoading && <div className="flex justify-center py-8"><LoadingIndicator size="sm" /></div>}

      {/* Body — horizontal layout on desktop */}
      <div className="flex flex-col gap-5 p-5 xl:flex-row xl:gap-8">
        {/* Statcast */}
        {statcast && (
          <div className="flex flex-col gap-3 xl:min-w-64">
            <p className="text-sm font-semibold text-secondary">Statcast</p>
          {statcast.bat_tracking && (
            <>
              <PercentileBar label="Bat Speed" value={`${statcast.bat_tracking.bat_speed ?? "—"} mph`} pct={statcast.bat_tracking.bat_speed_pct} />
              <PercentileBar label="Squared Up" value={`${statcast.bat_tracking.squared_up_pct ?? "—"}%`} pct={statcast.bat_tracking.squared_up_pct} />
            </>
          )}
          {statcast.batted_ball && (
            <>
              <PercentileBar label="Exit Velo" value={`${statcast.batted_ball.avg_exit_velo ?? "—"} mph`} pct={statcast.batted_ball.ev_pct} />
              <PercentileBar label="Barrel%" value={`${statcast.batted_ball.barrel_pct ?? "—"}%`} pct={statcast.batted_ball.barrel_pct_rank} />
            </>
          )}
          {statcast.speed && (
            <PercentileBar label="Sprint" value={`${statcast.speed.sprint_speed ?? "—"} ft/s`} pct={statcast.speed.sprint_pct} />
          )}
        </div>
      )}

      {/* Expected Stats */}
        {/* Expected Stats */}
        {statcast?.expected && (
          <div className="flex flex-col gap-2 xl:min-w-48">
            <p className="text-sm font-semibold text-secondary">Expected vs Actual</p>
            <div className="grid grid-cols-3 gap-2">
              {(["ba", "slg", "woba"] as const).map((stat) => {
                const exp = statcast.expected!;
                const actual = exp[stat];
                const xKey = `x${stat}` as keyof typeof exp;
                const expected = exp[xKey];
                return (
                  <div key={stat} className="rounded-lg bg-secondary p-3 text-center">
                    <p className="text-xs font-medium text-tertiary">{stat.toUpperCase()}</p>
                    <p className="text-sm font-semibold tabular-nums text-primary">{String(actual ?? "—")}</p>
                    <p className="text-xs tabular-nums text-tertiary">x{stat.toUpperCase()}: {String(expected ?? "—")}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Per-category Z-scores */}
        {tier && tier.per_category_zscores && typeof tier.per_category_zscores === "object" && (
          <div className="flex flex-col gap-2 xl:flex-1">
            <p className="text-sm font-semibold text-secondary">Category Z-Scores</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(tier.per_category_zscores).map(([cat, z]) => (
                <div key={cat} className="rounded-md bg-secondary px-2.5 py-1 text-center">
                  <p className="text-xs text-tertiary">{cat}</p>
                  <p className={cx("text-xs font-semibold tabular-nums", z > 0 ? "text-success-primary" : "text-error-primary")}>
                    {typeof z === "number" ? z.toFixed(1) : z}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* News */}
        {headlines && headlines.length > 0 && (
          <div className="flex flex-col gap-2 xl:min-w-48">
            <p className="text-sm font-semibold text-secondary">Recent News</p>
            {headlines.slice(0, 3).map((h, i) => (
              <p key={i} className="text-xs text-tertiary">
                {h.headline || h.title || h.source} <span className="text-quaternary">&middot; {h.source}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// --- Players Tab ---

const PlayersTab = () => {
  const [view, setView] = useState<PlayerView>("rankings");
  const [posType, setPosType] = useState<"B" | "P">("B");
  const [search, setSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<{ name: string; mlbId?: number } | null>(null);

  return (
    <div className="flex flex-col gap-6">
      {/* Sub-tabs */}
      <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <Tabs selectedKey={view} onSelectionChange={(key) => setView(key as PlayerView)} className="items-start">
          <TabList
            size="sm"
            type="button-minimal"
            items={[
              { id: "rankings", label: "Rankings" },
              { id: "movers", label: "Movers" },
              { id: "buysell", label: "Buy/Sell" },
              { id: "breakouts", label: "Breakouts" },
              { id: "busts", label: "Busts" },
              { id: "battracking", label: "Bat Tracking" },
              { id: "trending", label: "Trending" },
              { id: "projections", label: "Projections" },
              { id: "closers", label: "Closers" },
            ]}
          />
        </Tabs>
      </div>

      <div className="flex flex-col gap-8">
        {view === "rankings" && (
          <RankingsView posType={posType} setPosType={setPosType} search={search} setSearch={setSearch} onSelectPlayer={setSelectedPlayer} />
        )}
        {view === "movers" && <MoversView onSelectPlayer={setSelectedPlayer} />}
        {view === "buysell" && <BuySellView />}
        {view === "breakouts" && <BreakoutsView />}
        {view === "busts" && <BustsView />}
        {view === "battracking" && <BatTrackingView />}
        {view === "trending" && <TrendingView />}
        {view === "projections" && <ProjectionsView />}
        {view === "closers" && <ClosersView />}

        {/* Player Detail Card (full-width) */}
        <AnimatePresence>
          {selectedPlayer && (
            <motion.div
              key={selectedPlayer.name}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <PlayerDetailPanel playerName={selectedPlayer.name} mlbId={selectedPlayer.mlbId} onClose={() => setSelectedPlayer(null)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// --- Rankings Sub-view ---

const RankingsView = ({
  posType, setPosType, search, setSearch, onSelectPlayer,
}: {
  posType: "B" | "P";
  setPosType: (v: "B" | "P") => void;
  search: string;
  setSearch: (v: string) => void;
  onSelectPlayer: (player: { name: string; mlbId?: number }) => void;
}) => {
  const { data: rankData, loading } = useApi(
    () => getRankings(posType, 200),
    [posType],
    `/rankings?pos_type=${posType}&count=200`,
  );

  const players = rankData?.players || [];
  const filtered = search
    ? players.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : players;
  const { sorted: sortedPlayers, sort: playerSort, toggle: togglePlayerSort } = useSort(filtered, { key: "z_score", dir: "desc" });

  return (
    <>
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs selectedKey={posType} onSelectionChange={(key) => setPosType(key as "B" | "P")} className="items-start">
          <TabList size="sm" type="button-minimal" items={[{ id: "B", label: "Hitting" }, { id: "P", label: "Pitching" }]} />
        </Tabs>
        <Input size="sm" icon={SearchLg} placeholder="Search players..." aria-label="Search" value={search} onChange={(v) => setSearch(v as string)} className="w-full sm:w-60" />
      </div>

      <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
        <div className="flex items-center justify-between border-b border-secondary px-4 py-4 md:px-6">
          <div className="flex items-center gap-3">
            <h2 className="text-md font-semibold text-primary">{posType === "B" ? "Hitting" : "Pitching"} Rankings</h2>
            <Badge color="brand" size="sm">{filtered.length} players</Badge>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-secondary bg-secondary">
                <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Player</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-tertiary">Team</th>
                <SortTh label="Z-Score" sortKey="z_score" sort={playerSort} onSort={togglePlayerSort} tooltip="Composite value across all stat categories" />
                <SortTh label="Park" sortKey="park_factor" sort={playerSort} onSort={togglePlayerSort} className="hidden md:table-cell" tooltip="Park factor (>1 = hitter friendly)" />
                <th className="hidden px-3 py-3 text-center text-xs font-medium text-tertiary lg:table-cell">
                  <Tooltip title="Average exit velocity (mph)" placement="top"><TooltipTrigger className="text-fg-quaternary hover:text-fg-quaternary_hover">EV</TooltipTrigger></Tooltip>
                </th>
                <th className="hidden px-3 py-3 text-center text-xs font-medium text-tertiary lg:table-cell">
                  <Tooltip title="Barrel rate — optimal launch angle + exit velocity" placement="top"><TooltipTrigger className="text-fg-quaternary hover:text-fg-quaternary_hover">Barrel%</TooltipTrigger></Tooltip>
                </th>
                <th className="hidden px-3 py-3 text-center text-xs font-medium text-tertiary xl:table-cell">
                  <Tooltip title="Average bat speed (mph)" placement="top"><TooltipTrigger className="text-fg-quaternary hover:text-fg-quaternary_hover">Bat Spd</TooltipTrigger></Tooltip>
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">Trend</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-6 py-12"><div className="flex justify-center"><LoadingIndicator size="sm" /></div></td></tr>
              ) : sortedPlayers.length === 0 ? (
                <tr><td colSpan={9} className="px-6 py-12">
                  <EmptyState size="sm">
                    <EmptyState.Header><EmptyState.FeaturedIcon icon={SearchLg} color="gray" /></EmptyState.Header>
                    <EmptyState.Content>
                      <EmptyState.Title>No players found</EmptyState.Title>
                      <EmptyState.Description>Try adjusting your search or filters.</EmptyState.Description>
                    </EmptyState.Content>
                  </EmptyState>
                </td></tr>
              ) : (
                sortedPlayers.slice(0, 100).map((p) => {
                  const sc = p.intel?.statcast;
                  const bb = sc?.batted_ball;
                  const bt = sc?.bat_tracking;
                  const trend = p.intel?.trends?.status;
                  return (
                    <tr
                      key={p.name}
                      className="cursor-pointer border-b border-secondary transition duration-100 ease-linear hover:bg-primary_hover"
                      onClick={() => onSelectPlayer({ name: p.name, mlbId: p.mlb_id })}
                    >
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs font-semibold tabular-nums text-tertiary">{p.rank}</span>
                      </td>
                      <td className="px-4 py-3 md:px-6">
                        <div className="flex items-center gap-3">
                          <Avatar src={mlbHeadshot(p.mlb_id)} alt={p.name} size="sm" initials={p.name.split(" ").map((n) => n[0]).join("").slice(0, 2)} />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-primary">{p.name}</span>
                            <span className="text-xs text-tertiary">{p.pos || "—"}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-sm text-secondary">{p.team}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={cx("text-sm font-semibold tabular-nums", p.z_score > 0 ? "text-success-primary" : "text-error-primary")}>
                          {p.z_score?.toFixed(1)}
                        </span>
                      </td>
                      <td className="hidden px-3 py-3 text-center md:table-cell">
                        <span className="text-sm tabular-nums text-secondary">{p.park_factor?.toFixed(2) ?? "—"}</span>
                      </td>
                      <td className="hidden px-3 py-3 text-center lg:table-cell">
                        <span className="text-sm tabular-nums text-secondary">{bb?.avg_exit_velo ?? "—"}</span>
                      </td>
                      <td className="hidden px-3 py-3 text-center lg:table-cell">
                        <span className="text-sm tabular-nums text-secondary">{bb?.barrel_pct != null ? `${bb.barrel_pct}%` : "—"}</span>
                      </td>
                      <td className="hidden px-3 py-3 text-center xl:table-cell">
                        <span className="text-sm tabular-nums text-secondary">{bt?.bat_speed?.toFixed(1) ?? "—"}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {trend ? (
                          <Badge size="sm" color={trend === "hot" ? "success" : trend === "ice" ? "error" : "gray"}>{trend}</Badge>
                        ) : <span className="text-xs text-tertiary">—</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

// --- Movers Sub-view ---

const MoversView = ({ onSelectPlayer }: { onSelectPlayer: (player: { name: string; mlbId?: number }) => void }) => {
  const { data, loading } = useApi(() => getZscoreShifts(50));
  const shiftsRaw = data?.shifts || [];
  const { sorted: shifts, sort: moverSort, toggle: toggleMoverSort } = useSort(shiftsRaw, { key: "delta", dir: "desc" });

  return (
    <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
      <div className="flex items-center justify-between border-b border-secondary px-4 py-4 md:px-6">
        <div className="flex items-center gap-3">
          <h2 className="text-md font-semibold text-primary">Z-Score Movers</h2>
          <Badge color="brand" size="sm">{shifts.length} players</Badge>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-secondary bg-secondary">
              <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Player</th>
              <SortTh label="Current Z" sortKey="current_z" sort={moverSort} onSort={toggleMoverSort} />
              <SortTh label="Draft Z" sortKey="draft_z" sort={moverSort} onSort={toggleMoverSort} />
              <SortTh label="Delta" sortKey="delta" sort={moverSort} onSort={toggleMoverSort} />
              <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">Direction</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-12"><div className="flex justify-center"><LoadingIndicator size="sm" /></div></td></tr>
            ) : shifts.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-16"><EmptyState size="sm"><EmptyState.Header><EmptyState.FeaturedIcon icon={TrendUp01} color="gray" /></EmptyState.Header><EmptyState.Content><EmptyState.Title>No Z-Score Data</EmptyState.Title><EmptyState.Description>Z-score shifts will appear once the season progresses.</EmptyState.Description></EmptyState.Content></EmptyState></td></tr>
            ) : (
              shifts.map((s) => (
                <tr
                  key={s.name}
                  className="cursor-pointer border-b border-secondary transition duration-100 ease-linear hover:bg-primary_hover"
                  onClick={() => onSelectPlayer({ name: s.name })}
                >
                  <td className="px-4 py-3 md:px-6">
                    <span className="text-sm font-medium text-primary">{s.name}</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="text-sm tabular-nums text-secondary">{s.current_z.toFixed(2)}</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="text-sm tabular-nums text-secondary">{s.draft_z.toFixed(2)}</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={cx("text-sm font-semibold tabular-nums", s.delta > 0 ? "text-success-primary" : "text-error-primary")}>
                      {s.delta > 0 ? "+" : ""}{s.delta.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <BadgeWithIcon
                      iconLeading={s.direction === "rising" ? TrendUp01 : TrendDown01}
                      size="sm"
                      type="modern"
                      color={s.direction === "rising" ? "success" : "error"}
                    >
                      {s.direction}
                    </BadgeWithIcon>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- Buy/Sell Sub-view ---

const BuySellView = () => {
  const { data, loading } = useApi(getRegressionCandidates);

  const buyLow = data?.buy_low_hitters?.slice(0, 25) || [];
  const sellHigh = data?.sell_high_hitters?.slice(0, 25) || [];

  const RegressionTable = ({ title, candidates, color }: { title: string; candidates: typeof buyLow; color: "success" | "error" }) => (
    <div className="flex-1 overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
      <div className="flex items-center justify-between border-b border-secondary px-4 py-4 md:px-6">
        <div className="flex items-center gap-3">
          <h2 className="text-md font-semibold text-primary">{title}</h2>
          <Badge color={color} size="sm">{candidates.length}</Badge>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-secondary bg-secondary">
              <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Player</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">BABIP</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">Diff</th>
              <th className="hidden px-3 py-3 text-center text-xs font-medium text-tertiary md:table-cell">PA</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c, idx) => (
              <tr key={idx} className="border-b border-secondary">
                <td className="px-4 py-3 md:px-6">
                  <span className="text-sm font-medium text-primary">{c.name}</span>
                </td>
                <td className="px-3 py-3 text-center">
                  <span className="text-sm tabular-nums text-secondary">{c.babip?.toFixed(3) ?? "—"}</span>
                </td>
                <td className="px-3 py-3 text-center">
                  <span className={cx("text-sm font-semibold tabular-nums", color === "success" ? "text-success-primary" : "text-error-primary")}>
                    {c.diff > 0 ? "+" : ""}{c.diff?.toFixed(3) ?? "—"}
                  </span>
                </td>
                <td className="hidden px-3 py-3 text-center md:table-cell">
                  <span className="text-sm tabular-nums text-tertiary">{c.pa}</span>
                </td>
              </tr>
            ))}
            {candidates.length === 0 && (
              <tr><td colSpan={4} className="px-6 py-12"><EmptyState size="sm"><EmptyState.Header><EmptyState.FeaturedIcon icon={TrendDown01} color="gray" /></EmptyState.Header><EmptyState.Content><EmptyState.Title>No Data</EmptyState.Title><EmptyState.Description>Regression data not available yet.</EmptyState.Description></EmptyState.Content></EmptyState></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (loading) return <div className="flex justify-center py-12"><LoadingIndicator size="sm" /></div>;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      <RegressionTable title="Buy Low" candidates={buyLow} color="success" />
      <RegressionTable title="Sell High" candidates={sellHigh} color="error" />
    </div>
  );
};

// --- Breakouts Sub-view ---

const BreakoutsView = () => {
  const { data: breakouts, loading: bLoad } = useApi(getBreakoutCandidates);

  if (bLoad) return <div className="flex justify-center py-12"><LoadingIndicator size="sm" /></div>;

  const candidates = breakouts || [];

  return (
    <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
      <div className="flex items-center justify-between border-b border-secondary px-4 py-4 md:px-6">
        <div className="flex items-center gap-3">
          <h2 className="text-md font-semibold text-primary">Statcast Breakouts</h2>
          <Badge color="brand" size="sm">{candidates.length}</Badge>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-secondary bg-secondary">
              <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Player</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">wOBA</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">xwOBA</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">Diff</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c, idx) => (
              <tr key={idx} className="border-b border-secondary">
                <td className="px-4 py-3 md:px-6"><span className="text-sm font-medium text-primary">{c.name || "Unknown"}</span></td>
                <td className="px-3 py-3 text-center"><span className="text-sm tabular-nums text-secondary">{(c.woba as number | undefined)?.toFixed(3) ?? "—"}</span></td>
                <td className="px-3 py-3 text-center"><span className="text-sm tabular-nums text-secondary">{(c.xwoba as number | undefined)?.toFixed(3) ?? "—"}</span></td>
                <td className="px-3 py-3 text-center">
                  <span className="text-sm font-semibold tabular-nums text-success-primary">+{(c.diff as number | undefined)?.toFixed(3) ?? "—"}</span>
                </td>
              </tr>
            ))}
            {candidates.length === 0 && (
              <tr><td colSpan={4} className="px-6 py-12"><EmptyState size="sm"><EmptyState.Header><EmptyState.FeaturedIcon icon={TrendUp01} color="gray" /></EmptyState.Header><EmptyState.Content><EmptyState.Title>No Breakouts</EmptyState.Title><EmptyState.Description>Breakout candidates will appear as Statcast data is collected.</EmptyState.Description></EmptyState.Content></EmptyState></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- Busts Sub-view ---

const BustsView = () => {
  const { data: busts, loading } = useApi(getBustCandidates);
  if (loading) return <div className="flex justify-center py-12"><LoadingIndicator size="sm" /></div>;
  return (
    <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
      <div className="flex items-center justify-between border-b border-secondary px-4 py-4 md:px-6">
        <div className="flex items-center gap-3">
          <h2 className="text-md font-semibold text-primary">Bust Candidates</h2>
          <Badge color="error" size="sm">{busts?.length || 0}</Badge>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-secondary bg-secondary">
              <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Player</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">wOBA</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">xwOBA</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">Diff</th>
              <th className="hidden px-3 py-3 text-center text-xs font-medium text-tertiary md:table-cell">PA</th>
            </tr>
          </thead>
          <tbody>
            {(busts || []).map((b, idx) => (
              <tr key={idx} className="border-b border-secondary">
                <td className="px-4 py-3 md:px-6"><span className="text-sm font-medium text-primary">{b.name}</span></td>
                <td className="px-3 py-3 text-center"><span className="text-sm tabular-nums text-secondary">{b.woba?.toFixed(3) ?? "—"}</span></td>
                <td className="px-3 py-3 text-center"><span className="text-sm tabular-nums text-secondary">{b.xwoba?.toFixed(3) ?? "—"}</span></td>
                <td className="px-3 py-3 text-center">
                  <span className="text-sm font-semibold tabular-nums text-error-primary">-{b.diff?.toFixed(3) ?? "—"}</span>
                </td>
                <td className="hidden px-3 py-3 text-center md:table-cell"><span className="text-sm tabular-nums text-tertiary">{b.pa}</span></td>
              </tr>
            ))}
            {(!busts || busts.length === 0) && (
              <tr><td colSpan={5} className="px-6 py-12"><EmptyState size="sm"><EmptyState.Header><EmptyState.FeaturedIcon icon={TrendDown01} color="gray" /></EmptyState.Header><EmptyState.Content><EmptyState.Title>No Busts</EmptyState.Title><EmptyState.Description>Bust candidates will appear as xwOBA data diverges.</EmptyState.Description></EmptyState.Content></EmptyState></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- Bat Tracking Sub-view ---

const BatTrackingView = () => {
  const { data: breakouts, loading } = useApi(getBatTrackingBreakouts);
  if (loading) return <div className="flex justify-center py-12"><LoadingIndicator size="sm" /></div>;
  return (
    <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
      <div className="flex items-center justify-between border-b border-secondary px-4 py-4 md:px-6">
        <div className="flex items-center gap-3">
          <h2 className="text-md font-semibold text-primary">Bat Tracking Breakouts</h2>
          <Badge color="brand" size="sm">{breakouts?.length || 0}</Badge>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-secondary bg-secondary">
              <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Player</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">Bat Speed</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">Bat Spd %ile</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">Squared Up%</th>
              <th className="hidden px-3 py-3 text-center text-xs font-medium text-tertiary md:table-cell">Fast Swing%</th>
            </tr>
          </thead>
          <tbody>
            {(breakouts || []).map((b, idx) => (
              <tr key={idx} className="border-b border-secondary">
                <td className="px-4 py-3 md:px-6"><span className="text-sm font-medium text-primary">{b.name}</span></td>
                <td className="px-3 py-3 text-center"><span className="text-sm tabular-nums text-secondary">{b.bat_speed?.toFixed(1) ?? "—"}</span></td>
                <td className="px-3 py-3 text-center">
                  <span className={cx("text-sm font-semibold tabular-nums", (b.bat_speed_pct ?? 0) >= 80 ? "text-success-primary" : "text-secondary")}>
                    {b.bat_speed_pct ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-3 text-center"><span className="text-sm tabular-nums text-secondary">{b.squared_up_pct != null ? `${(b.squared_up_pct * 100).toFixed(1)}%` : "—"}</span></td>
                <td className="hidden px-3 py-3 text-center md:table-cell"><span className="text-sm tabular-nums text-secondary">{b.fast_swing_pct != null ? `${(b.fast_swing_pct * 100).toFixed(1)}%` : "—"}</span></td>
              </tr>
            ))}
            {(!breakouts || breakouts.length === 0) && (
              <tr><td colSpan={5} className="px-6 py-12"><EmptyState size="sm"><EmptyState.Header><EmptyState.FeaturedIcon icon={TrendUp01} color="gray" /></EmptyState.Header><EmptyState.Content><EmptyState.Title>No Bat Tracking Data</EmptyState.Title><EmptyState.Description>Bat tracking breakouts will appear as swing data is collected.</EmptyState.Description></EmptyState.Content></EmptyState></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- Trending Sub-view ---

const TrendingView = () => {
  const { data: trending, loading } = useApi(getTrendingPlayers);
  if (loading) return <div className="flex justify-center py-12"><LoadingIndicator size="sm" /></div>;
  return (
    <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
      <div className="flex items-center justify-between border-b border-secondary px-4 py-4 md:px-6">
        <div className="flex items-center gap-3">
          <h2 className="text-md font-semibold text-primary">Trending Players</h2>
          <Badge color="brand" size="sm">{trending?.length || 0}</Badge>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-secondary bg-secondary">
              <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Player</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">Score</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-tertiary">Trend</th>
            </tr>
          </thead>
          <tbody>
            {(trending || []).map((p, idx) => (
              <tr key={idx} className="border-b border-secondary">
                <td className="px-4 py-3 md:px-6"><span className="text-sm font-medium text-primary">{p.name}</span></td>
                <td className="px-3 py-3 text-center">
                  <span className="text-sm font-semibold tabular-nums text-primary">{p.score}</span>
                </td>
                <td className="px-3 py-3">
                  <ProgressBarBase value={Math.min(p.score, 100)} className="h-2 w-24" />
                </td>
              </tr>
            ))}
            {(!trending || trending.length === 0) && (
              <tr><td colSpan={3} className="px-6 py-12"><EmptyState size="sm"><EmptyState.Header><EmptyState.FeaturedIcon icon={TrendUp01} color="gray" /></EmptyState.Header><EmptyState.Content><EmptyState.Title>No Trending Data</EmptyState.Title><EmptyState.Description>Trending players will appear as activity picks up.</EmptyState.Description></EmptyState.Content></EmptyState></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- Projections Sub-view ---

const ProjectionsView = () => {
  const { data: disagreements, loading } = useApi(getProjectionDisagreements);
  if (loading) return <div className="flex justify-center py-12"><LoadingIndicator size="sm" /></div>;
  return (
    <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
      <div className="flex items-center justify-between border-b border-secondary px-4 py-4 md:px-6">
        <div className="flex items-center gap-3">
          <h2 className="text-md font-semibold text-primary">Projection Disagreements</h2>
          <Badge color="brand" size="sm">{disagreements?.length || 0}</Badge>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-secondary bg-secondary">
              <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Player</th>
              {Object.keys((disagreements || [])[0] || {}).filter((k) => k !== "name" && k !== "player").slice(0, 5).map((k) => (
                <th key={k} className="px-3 py-3 text-center text-xs font-medium text-tertiary">{k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(disagreements || []).map((d, idx) => {
              const cols = Object.entries(d).filter(([k]) => k !== "name" && k !== "player").slice(0, 5);
              return (
                <tr key={idx} className="border-b border-secondary">
                  <td className="px-4 py-3 md:px-6"><span className="text-sm font-medium text-primary">{String(d.name || "—")}</span></td>
                  {cols.map(([k, v]) => (
                    <td key={k} className="px-3 py-3 text-center">
                      <span className="text-sm tabular-nums text-secondary">{typeof v === "number" ? v.toFixed(2) : String(v ?? "—")}</span>
                    </td>
                  ))}
                </tr>
              );
            })}
            {(!disagreements || disagreements.length === 0) && (
              <tr><td colSpan={6} className="px-6 py-12"><EmptyState size="sm"><EmptyState.Header><EmptyState.FeaturedIcon icon={BarChartSquare02} color="gray" /></EmptyState.Header><EmptyState.Content><EmptyState.Title>No Disagreements</EmptyState.Title><EmptyState.Description>Projection disagreements will appear as season data accumulates.</EmptyState.Description></EmptyState.Content></EmptyState></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- Closers Sub-view ---

const ClosersView = () => {
  const { data: closers, loading } = useApi(getCloserMonitor);

  if (loading) return <div className="flex justify-center py-12"><LoadingIndicator size="sm" /></div>;

  return (
    <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
      <div className="flex items-center justify-between border-b border-secondary px-4 py-4 md:px-6">
        <div className="flex items-center gap-3">
          <h2 className="text-md font-semibold text-primary">Closer Monitor</h2>
          <Badge color="brand" size="sm">{closers?.length || 0} teams</Badge>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-secondary bg-secondary">
              <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Team</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-tertiary">Closer</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-tertiary">Status</th>
              <th className="hidden px-4 py-3 text-left text-xs font-medium text-tertiary md:table-cell">Handcuff</th>
              <th className="hidden px-4 py-3 text-center text-xs font-medium text-tertiary md:table-cell">Saves</th>
            </tr>
          </thead>
          <tbody>
            {(closers || []).map((c, idx) => (
              <tr key={idx} className="border-b border-secondary">
                <td className="px-4 py-3 md:px-6"><span className="text-sm font-medium text-primary">{c.team}</span></td>
                <td className="px-4 py-3"><span className="text-sm text-secondary">{c.closer || "—"}</span></td>
                <td className="px-4 py-3 text-center">
                  <Badge size="sm" color={c.status === "locked" ? "success" : c.status === "committee" ? "warning" : "error"}>{c.status}</Badge>
                </td>
                <td className="hidden px-4 py-3 md:table-cell"><span className="text-sm text-tertiary">{c.handcuff || "—"}</span></td>
                <td className="hidden px-4 py-3 text-center md:table-cell"><span className="text-sm tabular-nums text-secondary">{c.saves ?? "—"}</span></td>
              </tr>
            ))}
            {(!closers || closers.length === 0) && (
              <tr><td colSpan={5} className="px-6 py-12"><EmptyState size="sm"><EmptyState.Header><EmptyState.FeaturedIcon icon={BarChartSquare02} color="gray" /></EmptyState.Header><EmptyState.Content><EmptyState.Title>No Closer Data</EmptyState.Title><EmptyState.Description>Closer information will be available during the season.</EmptyState.Description></EmptyState.Content></EmptyState></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- Main Stats Page ---

export const StatsPage = () => {
  const [topTab, setTopTab] = useState<TopTab>("managers");

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex flex-col gap-8 px-4 lg:px-8">
      <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <Tabs selectedKey={topTab} onSelectionChange={(key) => setTopTab(key as TopTab)} className="items-start">
          <TabList
            size="sm"
            type="button-minimal"
            items={[
              { id: "managers", label: "Managers" },
              { id: "players", label: "Players" },
            ]}
          />
        </Tabs>
      </div>

      {topTab === "managers" && <ManagersTab />}
      {topTab === "players" && <PlayersTab />}
    </motion.div>
  );
};
