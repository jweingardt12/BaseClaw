import { Calendar } from "@untitledui/icons";
import { motion } from "motion/react";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Badge } from "@/components/base/badges/badges";
import { useApi } from "@/hooks/use-api";
import {
  getMLBInjuries,
  getMLBSchedule,
  getMLBStandings,
  getMLBWeather,
  getParkFactors,
  getProbablePitchers,
} from "@/lib/api";
import { cx } from "@/utils/cx";

export const GameDayPage = () => {
  const { data: schedule, loading, error, refetch } = useApi(getMLBSchedule);
  const { data: pitchers } = useApi(getProbablePitchers);
  const { data: weather } = useApi(getMLBWeather);
  const { data: parkData } = useApi(getParkFactors);
  const { data: standingsData } = useApi(getMLBStandings);
  const { data: injuryData } = useApi(getMLBInjuries);

  const games = schedule?.games || [];
  const probables = pitchers?.pitchers || [];
  const weatherGames = weather?.games || [];
  const parks = parkData?.park_factors || [];
  const divisions = standingsData?.divisions || [];
  const injuries = injuryData?.injuries || [];

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <LoadingIndicator size="md" label="Loading game day data..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
        <p className="text-sm text-error-primary">Failed to load game day data</p>
        <button onClick={refetch} className="text-sm font-semibold text-brand-secondary underline">Retry</button>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex flex-col gap-8 px-4 lg:px-8">

      {/* Today's Schedule + Weather */}
      {weatherGames.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
          <div className="flex items-center justify-between border-b border-secondary px-4 py-4 md:px-6">
            <div className="flex items-center gap-3">
              <h2 className="text-md font-semibold text-primary">Today&apos;s Games</h2>
              <Badge color="brand" size="sm">{weatherGames.length} games</Badge>
              {weather && (
                <span className="text-xs text-tertiary">{weather.outdoor_count} outdoor &middot; {weather.dome_count} dome</span>
              )}
            </div>
            {schedule && <span className="text-xs text-tertiary">{schedule.date}</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-secondary bg-secondary">
                  <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Matchup</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">Temp</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">Wind</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">Dome</th>
                  <th className="hidden px-3 py-3 text-left text-xs font-medium text-tertiary md:table-cell">Conditions</th>
                </tr>
              </thead>
              <tbody>
                {weatherGames.map((g, idx) => (
                  <tr key={idx} className="border-b border-secondary">
                    <td className="px-4 py-3 md:px-6">
                      <span className="text-sm font-medium text-primary">{g.away} @ {g.home}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-sm tabular-nums text-secondary">{g.temp != null ? `${g.temp}°F` : "—"}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-xs text-secondary">{g.wind || "—"}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {g.dome ? <Badge size="sm" color="brand">Dome</Badge> : <span className="text-xs text-tertiary">Open</span>}
                    </td>
                    <td className="hidden px-3 py-3 md:table-cell">
                      <span className="text-xs text-tertiary">{g.weather || "—"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Probable Pitchers */}
      {probables.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
          <div className="flex items-center justify-between border-b border-secondary px-4 py-4 md:px-6">
            <div className="flex items-center gap-3">
              <h2 className="text-md font-semibold text-primary">Probable Pitchers</h2>
              <Badge color="brand" size="sm">{probables.length}</Badge>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-secondary bg-secondary">
                  <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Pitcher</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-tertiary">Team</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-tertiary">Opponent</th>
                  {Object.keys(probables[0] || {}).filter((k) => !["name", "team", "opponent", "mlb_id", "player_id"].includes(k)).slice(0, 4).map((k) => (
                    <th key={k} className="hidden px-3 py-3 text-center text-xs font-medium text-tertiary lg:table-cell">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {probables.slice(0, 30).map((p, idx) => {
                  const extraCols = Object.entries(p).filter(([k]) => !["name", "team", "opponent", "mlb_id", "player_id"].includes(k)).slice(0, 4);
                  return (
                    <tr key={idx} className="border-b border-secondary">
                      <td className="px-4 py-3 md:px-6"><span className="text-sm font-medium text-primary">{p.name}</span></td>
                      <td className="px-3 py-3"><span className="text-sm text-secondary">{p.team}</span></td>
                      <td className="px-3 py-3"><span className="text-sm text-secondary">{p.opponent || "—"}</span></td>
                      {extraCols.map(([k, v]) => (
                        <td key={k} className="hidden px-3 py-3 text-center lg:table-cell">
                          <span className="text-sm tabular-nums text-secondary">{typeof v === "number" ? v.toFixed(2) : String(v ?? "—")}</span>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Park Factors */}
      {parks.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
          <div className="flex items-center justify-between border-b border-secondary px-4 py-4 md:px-6">
            <div className="flex items-center gap-3">
              <h2 className="text-md font-semibold text-primary">Park Factors</h2>
              <Badge color="brand" size="sm">{parks.length} parks</Badge>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-secondary bg-secondary">
                  <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Park</th>
                  {Object.keys(parks[0] || {}).filter((k) => k !== "park" && k !== "team").slice(0, 6).map((k) => (
                    <th key={k} className="px-3 py-3 text-center text-xs font-medium text-tertiary">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parks.map((p, idx) => {
                  const cols = Object.entries(p).filter(([k]) => k !== "park" && k !== "team").slice(0, 6);
                  return (
                    <tr key={idx} className="border-b border-secondary">
                      <td className="px-4 py-3 md:px-6">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-primary">{String(p.park)}</span>
                          {p.team && <span className="text-xs text-tertiary">{String(p.team)}</span>}
                        </div>
                      </td>
                      {cols.map(([k, v]) => (
                        <td key={k} className="px-3 py-3 text-center">
                          <span className={cx("text-sm tabular-nums", typeof v === "number" && v > 1.05 ? "font-semibold text-success-primary" : typeof v === "number" && v < 0.95 ? "font-semibold text-error-primary" : "text-secondary")}>
                            {typeof v === "number" ? v.toFixed(2) : String(v ?? "—")}
                          </span>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MLB Standings */}
      {divisions.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {divisions.map((div) => (
            <div key={div.name} className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
              <div className="border-b border-secondary px-4 py-3 md:px-6">
                <h3 className="text-sm font-semibold text-primary">{div.name}</h3>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-secondary bg-secondary">
                    <th className="px-4 py-2 text-left text-xs font-medium text-tertiary md:px-6">Team</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-tertiary">W</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-tertiary">L</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-tertiary">GB</th>
                  </tr>
                </thead>
                <tbody>
                  {(div.teams || []).map((t, idx) => (
                    <tr key={idx} className={cx("border-b border-secondary", idx === 0 && "bg-brand-primary/10")}>
                      <td className="px-4 py-2 md:px-6"><span className="text-sm font-medium text-primary">{t.name}</span></td>
                      <td className="px-2 py-2 text-center"><span className="text-sm tabular-nums text-secondary">{t.wins}</span></td>
                      <td className="px-2 py-2 text-center"><span className="text-sm tabular-nums text-secondary">{t.losses}</span></td>
                      <td className="px-2 py-2 text-center"><span className="text-sm tabular-nums text-tertiary">{t.gb}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* Injuries */}
      {injuries.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
          <div className="flex items-center justify-between border-b border-secondary px-4 py-4 md:px-6">
            <div className="flex items-center gap-3">
              <h2 className="text-md font-semibold text-primary">Injuries</h2>
              <Badge color="error" size="sm">{injuries.length}</Badge>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-secondary bg-secondary">
                  <th className="px-4 py-3 text-left text-xs font-medium text-tertiary md:px-6">Player</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-tertiary">Team</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-tertiary">Status</th>
                </tr>
              </thead>
              <tbody>
                {injuries.map((inj, idx) => (
                  <tr key={idx} className="border-b border-secondary">
                    <td className="px-4 py-3 md:px-6"><span className="text-sm font-medium text-primary">{inj.player}</span></td>
                    <td className="px-3 py-3"><span className="text-sm text-secondary">{inj.team}</span></td>
                    <td className="px-3 py-3 text-center"><Badge size="sm" color="error">{inj.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {games.length === 0 && weatherGames.length === 0 && !loading && (
        <EmptyState size="md">
          <EmptyState.Header><EmptyState.FeaturedIcon icon={Calendar} color="gray" /></EmptyState.Header>
          <EmptyState.Content>
            <EmptyState.Title>No Games Today</EmptyState.Title>
            <EmptyState.Description>Check back on a game day for schedules, weather, and probable pitchers.</EmptyState.Description>
          </EmptyState.Content>
        </EmptyState>
      )}
    </motion.div>
  );
};
