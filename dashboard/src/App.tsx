import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/app-shell";
import { HomePage } from "@/pages/home";
import { RosterPage } from "@/pages/roster";
import { FreeAgentsPage } from "@/pages/free-agents";
import { StandingsPage } from "@/pages/standings";
import { TradeCenterPage } from "@/pages/trade-center";
import { IntelligencePage } from "@/pages/intelligence";
import { WeekPlannerPage } from "@/pages/week-planner";
import { LeagueHistoryPage } from "@/pages/league-history";
import { SettingsPage } from "@/pages/settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

export default function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="baseclaw-ui-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>
          <BrowserRouter>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<HomePage />} />
                <Route path="roster" element={<RosterPage />} />
                <Route path="free-agents" element={<FreeAgentsPage />} />
                <Route path="standings" element={<StandingsPage />} />
                <Route path="trade-center" element={<TradeCenterPage />} />
                <Route path="intelligence" element={<IntelligencePage />} />
                <Route path="week-planner" element={<WeekPlannerPage />} />
                <Route path="league-history" element={<LeagueHistoryPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Routes>
            <Toaster richColors closeButton position="top-right" />
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
