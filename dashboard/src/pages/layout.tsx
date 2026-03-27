import type { ReactNode } from "react";
import {
  BarChartSquare02,
  Calendar,
  CheckDone01,
  ClockRewind,
  HomeLine,
  PieChart03,
  Rows01,
  Trophy01,
} from "@untitledui/icons";
import { SidebarNavigationSlim } from "@/components/application/app-navigation/sidebar-navigation/sidebar-slim";
import { useLeague } from "@/hooks/use-league";

interface LayoutProps {
  children: ReactNode;
  activeUrl?: string;
}

export const Layout = ({ children, activeUrl }: LayoutProps) => {
  const league = useLeague();

  return (
    <div className="flex flex-col bg-primary lg:flex-row">
      <SidebarNavigationSlim
        hideBorder
        activeUrl={activeUrl}
        items={[
          {
            label: "Standings",
            href: "/",
            icon: HomeLine,
          },
          {
            label: "Matchups",
            href: "/matchups",
            icon: Rows01,
          },
          {
            label: "Stats",
            href: "/stats",
            icon: BarChartSquare02,
          },
          {
            label: "Power Rankings",
            href: "/power-rankings",
            icon: Trophy01,
          },
          {
            label: "Transactions",
            href: "/transactions",
            icon: CheckDone01,
          },
          {
            label: "History",
            href: "/history",
            icon: ClockRewind,
          },
          {
            label: "Playoffs",
            href: "/playoffs",
            icon: PieChart03,
          },
          {
            label: "Game Day",
            href: "/game-day",
            icon: Calendar,
          },
        ]}
        footerItems={[]}
      />
      <main className="min-w-0 flex-1 lg:pt-2 lg:pl-1">
        <div className="flex h-full min-h-dvh flex-col gap-8 border-secondary pt-8 pb-12 lg:rounded-tl-[24px] lg:border-t lg:border-l">
          {/* Page header with league name */}
          <div className="flex flex-col gap-1 px-4 lg:px-8">
            <p className="text-xl font-semibold text-primary">
              {league?.league_name || "Fantasy Baseball"}
            </p>
            {league?.current_week && (
              <p className="text-sm text-tertiary">
                Week {league.current_week} &middot; {league.scoring_type === "head" ? "Head-to-Head Categories" : league.scoring_type || "Head-to-Head Categories"}
              </p>
            )}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
};
