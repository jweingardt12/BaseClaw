import { StrictMode, Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { LeagueCtx } from "@/hooks/use-league";
import { getLeagueContext } from "@/lib/api";
import { Layout } from "@/pages/layout";
import { RouteProvider } from "@/providers/router-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import type { LeagueContext } from "@/types/fantasy";
import "@/styles/globals.css";

const StandingsPage = lazy(() => import("@/pages/standings").then((m) => ({ default: m.StandingsPage })));
const MatchupsPage = lazy(() => import("@/pages/matchups").then((m) => ({ default: m.MatchupsPage })));
const StatsPage = lazy(() => import("@/pages/stats").then((m) => ({ default: m.StatsPage })));
const PowerRankingsPage = lazy(() => import("@/pages/power-rankings").then((m) => ({ default: m.PowerRankingsPage })));
const TransactionsPage = lazy(() => import("@/pages/transactions").then((m) => ({ default: m.TransactionsPage })));
const HistoryPage = lazy(() => import("@/pages/history").then((m) => ({ default: m.HistoryPage })));
const PlayoffsPage = lazy(() => import("@/pages/playoffs").then((m) => ({ default: m.PlayoffsPage })));
const GameDayPage = lazy(() => import("@/pages/game-day").then((m) => ({ default: m.GameDayPage })));
const TeamDetailPage = lazy(() => import("@/pages/team-detail").then((m) => ({ default: m.TeamDetailPage })));
const NotFound = lazy(() => import("@/pages/not-found").then((m) => ({ default: m.NotFound })));

const PageFallback = () => (
    <div className="flex flex-1 items-center justify-center py-16">
        <LoadingIndicator size="md" />
    </div>
);

const AppRoutes = () => {
    const location = useLocation();
    const activeUrl = "/" + location.pathname.split("/")[1];

    return (
        <Layout activeUrl={activeUrl === "/" ? "/" : activeUrl}>
            <Suspense fallback={<PageFallback />}>
                <Routes>
                    <Route path="/" element={<StandingsPage />} />
                    <Route path="/matchups" element={<MatchupsPage />} />
                    <Route path="/matchups/:week" element={<MatchupsPage />} />
                    <Route path="/stats" element={<StatsPage />} />
                    <Route path="/power-rankings" element={<PowerRankingsPage />} />
                    <Route path="/teams/:teamId" element={<TeamDetailPage />} />
                    <Route path="/teams" element={<StandingsPage />} />
                    <Route path="/transactions" element={<TransactionsPage />} />
                    <Route path="/history" element={<HistoryPage />} />
                    <Route path="/playoffs" element={<PlayoffsPage />} />
                    <Route path="/game-day" element={<GameDayPage />} />
                    <Route path="*" element={<NotFound />} />
                </Routes>
            </Suspense>
        </Layout>
    );
};

const App = () => {
    const [league, setLeague] = useState<LeagueContext | null>(null);

    useEffect(() => {
        getLeagueContext().then(setLeague).catch(() => {});
    }, []);

    return (
        <LeagueCtx.Provider value={league}>
            <BrowserRouter basename="/dashboard">
                <RouteProvider>
                    <AppRoutes />
                </RouteProvider>
            </BrowserRouter>
        </LeagueCtx.Provider>
    );
};

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ThemeProvider>
            <App />
        </ThemeProvider>
    </StrictMode>,
);
