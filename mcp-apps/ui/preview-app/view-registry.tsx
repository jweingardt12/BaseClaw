import { lazy } from "react";

// Lazy-load all view components
// Standings
const StandingsView = lazy(() => import("../standings-app/standings-view").then(m => ({ default: m.StandingsView })));
const MatchupsView = lazy(() => import("../standings-app/matchups-view").then(m => ({ default: m.MatchupsView })));
const MatchupDetailView = lazy(() => import("../standings-app/matchup-detail-view").then(m => ({ default: m.MatchupDetailView })));
const TransactionsView = lazy(() => import("../standings-app/transactions-view").then(m => ({ default: m.TransactionsView })));
const InfoView = lazy(() => import("../standings-app/info-view").then(m => ({ default: m.InfoView })));
const StatCategoriesView = lazy(() => import("../standings-app/stat-categories-view").then(m => ({ default: m.StatCategoriesView })));
const TransactionTrendsView = lazy(() => import("../standings-app/transaction-trends-view").then(m => ({ default: m.TransactionTrendsView })));
const LeaguePulseView = lazy(() => import("../standings-app/league-pulse-view").then(m => ({ default: m.LeaguePulseView })));
const PowerRankingsView = lazy(() => import("../standings-app/power-rankings-view").then(m => ({ default: m.PowerRankingsView })));
const SeasonPaceView = lazy(() => import("../standings-app/season-pace-view").then(m => ({ default: m.SeasonPaceView })));
// Season
const CategoryCheckView = lazy(() => import("../season-app/category-check-view").then(m => ({ default: m.CategoryCheckView })));
const InjuryReportView = lazy(() => import("../season-app/injury-report-view").then(m => ({ default: m.InjuryReportView })));
const WaiverAnalyzeView = lazy(() => import("../season-app/waiver-analyze-view").then(m => ({ default: m.WaiverAnalyzeView })));
const TradeEvalView = lazy(() => import("../season-app/trade-eval-view").then(m => ({ default: m.TradeEvalView })));
const LineupOptimizeView = lazy(() => import("../season-app/lineup-optimize-view").then(m => ({ default: m.LineupOptimizeView })));
const StreamingView = lazy(() => import("../season-app/streaming-view").then(m => ({ default: m.StreamingView })));
const DailyUpdateView = lazy(() => import("../season-app/daily-update-view").then(m => ({ default: m.DailyUpdateView })));
const TradeBuilderView = lazy(() => import("../season-app/trade-builder-view").then(m => ({ default: m.TradeBuilderView })));
const SimulateView = lazy(() => import("../season-app/simulate-view").then(m => ({ default: m.SimulateView })));
const ScoutView = lazy(() => import("../season-app/scout-view").then(m => ({ default: m.ScoutView })));
const MatchupStrategyView = lazy(() => import("../season-app/matchup-strategy-view").then(m => ({ default: m.MatchupStrategyView })));
const SetLineupView = lazy(() => import("../season-app/set-lineup-view").then(m => ({ default: m.SetLineupView })));
const PendingTradesView = lazy(() => import("../season-app/pending-trades-view").then(m => ({ default: m.PendingTradesView })));
const TradeActionView = lazy(() => import("../season-app/trade-action-view").then(m => ({ default: m.TradeActionView })));
const WhatsNewView = lazy(() => import("../season-app/whats-new-view").then(m => ({ default: m.WhatsNewView })));
const TradeFinderView = lazy(() => import("../season-app/trade-finder-view").then(m => ({ default: m.TradeFinderView })));
const WeekPlannerView = lazy(() => import("../season-app/week-planner-view").then(m => ({ default: m.WeekPlannerView })));
const CloserMonitorView = lazy(() => import("../season-app/closer-monitor-view").then(m => ({ default: m.CloserMonitorView })));
const PitcherMatchupView = lazy(() => import("../season-app/pitcher-matchup-view").then(m => ({ default: m.PitcherMatchupView })));
const CategoryTrendView = lazy(() => import("../season-app/category-trend-view").then(m => ({ default: m.CategoryTrendView })));
// Draft
const DraftStatusView = lazy(() => import("../draft-app/draft-status-view").then(m => ({ default: m.DraftStatusView })));
const DraftRecommendView = lazy(() => import("../draft-app/draft-recommend-view").then(m => ({ default: m.DraftRecommendView })));
const CheatsheetView = lazy(() => import("../draft-app/cheatsheet-view").then(m => ({ default: m.CheatsheetView })));
const BestAvailableView = lazy(() => import("../draft-app/best-available-view").then(m => ({ default: m.BestAvailableView })));
// Roster
const RosterView = lazy(() => import("../roster-app/roster-view").then(m => ({ default: m.RosterView })));
const FreeAgentsView = lazy(() => import("../roster-app/free-agents-view").then(m => ({ default: m.FreeAgentsView })));
const ActionView = lazy(() => import("../roster-app/action-view").then(m => ({ default: m.ActionView })));
const WhoOwnsView = lazy(() => import("../roster-app/who-owns-view").then(m => ({ default: m.WhoOwnsView })));
// Valuations
const RankingsView = lazy(() => import("../valuations-app/rankings-view").then(m => ({ default: m.RankingsView })));
const CompareView = lazy(() => import("../valuations-app/compare-view").then(m => ({ default: m.CompareView })));
const ValueView = lazy(() => import("../valuations-app/value-view").then(m => ({ default: m.ValueView })));
// MLB
const MlbTeamsView = lazy(() => import("../mlb-app/teams-view").then(m => ({ default: m.TeamsView })));
const MlbRosterView = lazy(() => import("../mlb-app/roster-view").then(m => ({ default: m.RosterView })));
const MlbPlayerView = lazy(() => import("../mlb-app/player-view").then(m => ({ default: m.PlayerView })));
const MlbStatsView = lazy(() => import("../mlb-app/stats-view").then(m => ({ default: m.StatsView })));
const MlbInjuriesView = lazy(() => import("../mlb-app/injuries-view").then(m => ({ default: m.InjuriesView })));
const MlbStandingsView = lazy(() => import("../mlb-app/standings-view").then(m => ({ default: m.StandingsView })));
const MlbScheduleView = lazy(() => import("../mlb-app/schedule-view").then(m => ({ default: m.ScheduleView })));
// History
const LeagueHistoryView = lazy(() => import("../history-app/league-history-view").then(m => ({ default: m.LeagueHistoryView })));
const RecordBookView = lazy(() => import("../history-app/record-book-view").then(m => ({ default: m.RecordBookView })));
const PastStandingsView = lazy(() => import("../history-app/past-standings-view").then(m => ({ default: m.PastStandingsView })));
const PastDraftView = lazy(() => import("../history-app/past-draft-view").then(m => ({ default: m.PastDraftView })));
const PastTeamsView = lazy(() => import("../history-app/past-teams-view").then(m => ({ default: m.PastTeamsView })));
const PastTradesView = lazy(() => import("../history-app/past-trades-view").then(m => ({ default: m.PastTradesView })));
const PastMatchupView = lazy(() => import("../history-app/past-matchup-view").then(m => ({ default: m.PastMatchupView })));
// Intel
const PlayerReportView = lazy(() => import("../intel-app/player-report-view").then(m => ({ default: m.PlayerReportView })));
const BreakoutsView = lazy(() => import("../intel-app/breakouts-view").then(m => ({ default: m.BreakoutsView })));
const RedditView = lazy(() => import("../intel-app/reddit-view").then(m => ({ default: m.RedditView })));
const ProspectsView = lazy(() => import("../intel-app/prospects-view").then(m => ({ default: m.ProspectsView })));
const IntelTransactionsView = lazy(() => import("../intel-app/transactions-view").then(m => ({ default: m.TransactionsView })));

export interface ViewDef {
  id: string;
  label: string;
  component: any;
  props?: Record<string, any>;
}

export interface ViewGroup {
  name: string;
  views: ViewDef[];
}

function noop() {}

export const VIEW_GROUPS: ViewGroup[] = [
  {
    name: "Standings",
    views: [
      { id: "standings", label: "Standings", component: StandingsView },
      { id: "matchups", label: "Matchups", component: MatchupsView },
      { id: "matchup-detail", label: "My Matchup", component: MatchupDetailView },
      { id: "scoreboard", label: "Scoreboard", component: MatchupsView },
      { id: "info", label: "Info", component: InfoView },
      { id: "stat-categories", label: "Stat Categories", component: StatCategoriesView },
      { id: "transactions", label: "Transactions", component: TransactionsView },
      { id: "transaction-trends", label: "Transaction Trends", component: TransactionTrendsView },
      { id: "league-pulse", label: "League Pulse", component: LeaguePulseView },
      { id: "power-rankings", label: "Power Rankings", component: PowerRankingsView },
      { id: "season-pace", label: "Season Pace", component: SeasonPaceView },
    ],
  },
  {
    name: "Season",
    views: [
      { id: "category-check", label: "Category Check", component: CategoryCheckView },
      { id: "injury-report", label: "Injury Report", component: InjuryReportView, props: { app: null, navigate: noop } },
      { id: "waiver-analyze", label: "Waiver Analysis", component: WaiverAnalyzeView, props: { app: null, navigate: noop } },
      { id: "trade-eval", label: "Trade Eval", component: TradeEvalView, props: { app: null, navigate: noop } },
      { id: "lineup-optimize", label: "Lineup Optimize", component: LineupOptimizeView, props: { app: null, navigate: noop } },
      { id: "streaming", label: "Streaming", component: StreamingView, props: { app: null, navigate: noop } },
      { id: "daily-update", label: "Daily Update", component: DailyUpdateView, props: { app: null, navigate: noop } },
      { id: "trade-builder", label: "Trade Builder", component: TradeBuilderView, props: { app: null, navigate: noop } },
      { id: "category-simulate", label: "Category Simulate", component: SimulateView, props: { app: null, navigate: noop } },
      { id: "scout-opponent", label: "Scout Opponent", component: ScoutView, props: { app: null, navigate: noop } },
      { id: "matchup-strategy", label: "Matchup Strategy", component: MatchupStrategyView, props: { app: null, navigate: noop } },
      { id: "set-lineup", label: "Set Lineup", component: SetLineupView, props: { app: null, navigate: noop } },
      { id: "pending-trades", label: "Pending Trades", component: PendingTradesView, props: { app: null, navigate: noop } },
      { id: "trade-action", label: "Trade Action", component: TradeActionView, props: { app: null, navigate: noop } },
      { id: "whats-new", label: "What's New", component: WhatsNewView, props: { app: null, navigate: noop } },
      { id: "trade-finder", label: "Trade Finder", component: TradeFinderView, props: { app: null, navigate: noop } },
      { id: "week-planner", label: "Week Planner", component: WeekPlannerView },
      { id: "closer-monitor", label: "Closer Monitor", component: CloserMonitorView, props: { app: null, navigate: noop } },
      { id: "pitcher-matchup", label: "Pitcher Matchup", component: PitcherMatchupView },
      { id: "category-trends", label: "Category Trends", component: CategoryTrendView },
    ],
  },
  {
    name: "Draft",
    views: [
      { id: "draft-status", label: "Draft Status", component: DraftStatusView },
      { id: "draft-recommend", label: "Recommendation", component: DraftRecommendView, props: { app: null, navigate: noop } },
      { id: "best-available", label: "Best Available", component: BestAvailableView, props: { app: null, navigate: noop } },
      { id: "draft-cheatsheet", label: "Cheat Sheet", component: CheatsheetView, props: { app: null, navigate: noop } },
    ],
  },
  {
    name: "Roster",
    views: [
      { id: "roster", label: "My Roster", component: RosterView, props: { app: null, navigate: noop } },
      { id: "free-agents", label: "Free Agents", component: FreeAgentsView, props: { app: null, navigate: noop } },
      { id: "action-add", label: "Action Result", component: ActionView, props: { app: null, navigate: noop } },
      { id: "who-owns", label: "Who Owns", component: WhoOwnsView, props: { app: null, navigate: noop } },
    ],
  },
  {
    name: "Valuations",
    views: [
      { id: "rankings", label: "Rankings", component: RankingsView, props: { app: null, navigate: noop } },
      { id: "compare", label: "Compare", component: CompareView, props: { app: null, navigate: noop } },
      { id: "value", label: "Value", component: ValueView, props: { app: null, navigate: noop } },
    ],
  },
  {
    name: "MLB",
    views: [
      { id: "mlb-teams", label: "Teams", component: MlbTeamsView },
      { id: "mlb-roster", label: "Roster", component: MlbRosterView, props: { app: null, navigate: noop } },
      { id: "mlb-player", label: "Player", component: MlbPlayerView, props: { app: null, navigate: noop } },
      { id: "mlb-stats", label: "Stats", component: MlbStatsView },
      { id: "mlb-injuries", label: "Injuries", component: MlbInjuriesView },
      { id: "mlb-standings", label: "Standings", component: MlbStandingsView },
      { id: "mlb-schedule", label: "Schedule", component: MlbScheduleView },
    ],
  },
  {
    name: "History",
    views: [
      { id: "league-history", label: "League History", component: LeagueHistoryView },
      { id: "record-book", label: "Record Book", component: RecordBookView },
      { id: "past-standings", label: "Past Standings", component: PastStandingsView, props: { app: null, navigate: noop } },
      { id: "past-draft", label: "Past Draft", component: PastDraftView, props: { app: null, navigate: noop } },
      { id: "past-teams", label: "Past Teams", component: PastTeamsView, props: { app: null, navigate: noop } },
      { id: "past-trades", label: "Past Trades", component: PastTradesView, props: { app: null, navigate: noop } },
      { id: "past-matchup", label: "Past Matchup", component: PastMatchupView, props: { app: null, navigate: noop } },
    ],
  },
  {
    name: "Intel",
    views: [
      { id: "intel-player", label: "Player Report", component: PlayerReportView, props: { app: null, navigate: noop } },
      { id: "intel-breakouts", label: "Breakouts", component: BreakoutsView, props: { app: null, navigate: noop } },
      { id: "intel-busts", label: "Busts", component: BreakoutsView, props: { app: null, navigate: noop } },
      { id: "intel-reddit", label: "Reddit Buzz", component: RedditView, props: { app: null, navigate: noop } },
      { id: "intel-trending", label: "Trending", component: RedditView, props: { app: null, navigate: noop } },
      { id: "intel-prospects", label: "Prospects", component: ProspectsView, props: { app: null, navigate: noop } },
      { id: "intel-transactions", label: "Transactions", component: IntelTransactionsView, props: { app: null, navigate: noop } },
    ],
  },
];
