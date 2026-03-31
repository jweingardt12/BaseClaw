---
name: baseclaw
description: Autonomous fantasy baseball GM — 130 MCP tools, unified intelligence layer, rich inline UIs, workflow automation, and agent scheduling for Yahoo Fantasy Baseball
---

# BaseClaw

Autonomous fantasy baseball GM for Yahoo Fantasy Baseball. Connects Claude to your league via 130 MCP tools, a unified intelligence layer that fuses 10+ data sources into every recommendation, rich inline UI apps, and scheduled workflow automation.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/jweingardt12/baseclaw/main/scripts/install.sh | bash
```

Or tell your agent: **"install github.com/jweingardt12/baseclaw"**

The installer clones the repo, builds the Docker image, prompts for Yahoo OAuth credentials and league/team IDs, and writes your `.env` file.

## What You Get

- **130 MCP tools** — roster management, trades, waivers, analytics, prospects, league intelligence
- **Unified intelligence layer** — every recommendation fuses z-score projections, Statcast quality, news context, injury severity, depth charts, BvP matchup history, regression signals, and Reddit sentiment
- **9 inline UI apps** with 62 views — standings, matchups, rosters, trades, draft board, player search, season overview, history, and morning briefing
- **Real-time data** — Yahoo Fantasy API, MLB Stats API, Statcast, FanGraphs, 16 RSS news sources
- **Proactive monitoring** — roster state change detection with critical alerts for injuries, DFAs, and trending pickups
- **Workflow automation** — multi-step pipelines with approval gates for waiver claims, trades, and roster cleanup
- **Agent scheduling** — 9 cron jobs that keep your team optimized around the clock

## Intelligence Layer

Every tool output is backed by a unified pipeline that automatically incorporates:

| Signal | Source | How It's Used |
|--------|--------|---------------|
| Z-score projections | 6 projection systems (Steamer, ZiPS, FanGraphs DC, ATC, TheBatX) | Base player valuation across all scoring categories |
| Statcast quality | Baseball Savant (exit velo, barrel%, xwOBA) | Elite/strong/average/below/poor tier adjustments |
| News context | 16 RSS sources + MLB transactions API | DEALBREAKER/WARNING/INFO flags — auto-filters unavailable players |
| Injury severity | News headlines + MLB API | MINOR/MODERATE/SEVERE with proportional score penalties |
| Availability | MLB transactions (DFA, optioned, released) | Auto-excludes players in minors or released from recommendations |
| Regression signals | FanGraphs career data vs current stats | Buy-low and sell-high candidates identified automatically |
| Hot/cold streaks | Recent game logs (14-day window) | Lineup day-score multipliers and waiver scoring adjustments |
| Depth charts | MLB Stats API (30 teams) | Starter/backup/bench role informs playing time expectations |
| BvP matchups | MLB Stats API career batter-vs-pitcher | Lineup optimizer uses career history + platoon advantage |
| Reddit sentiment | r/fantasybaseball (buzz, mentions, sentiment) | Bullish/bearish community signal factored into scoring |
| Probable pitchers | MLB schedule API | Streaming confirms actual starters, lineup optimizer uses opposing SP |
| Weather risks | MLB weather data | Lineup optimizer discounts players in PPD-risk games |

Players with DEALBREAKER flags (DFA'd, released, season-ending injury) are automatically excluded from all recommendations. You will never be told to pick up a player who's been sent to the minors.

## OpenClaw Setup

After installing BaseClaw, run the OpenClaw setup script:

```bash
~/.baseclaw/scripts/setup-openclaw.sh
```

This registers the MCP server, installs the skill, and optionally sets up scheduled cron jobs for autonomous team management.

### Smart Hooks

| Hook | Event | What It Does |
|------|-------|-------------|
| `baseclaw-context-inject` | Session start | Injects live standings, matchup score, roster alerts, and season-phase strategy into every conversation |
| `baseclaw-player-enrich` | Inbound message | Detects player names and pre-fetches Statcast/injury/news intel before the agent processes your message |
| `baseclaw-roster-alerts` | Outbound message | Polls roster monitor for real state changes (IL movements, DFAs, trending pickups) |
| `baseclaw-memory-flush` | Before compaction | Persists structured session notes (roster moves, strategy decisions, alerts) |
| `baseclaw-health` | Gateway startup | Verifies BaseClaw container is reachable |

### Season-Phase Skills

The bootstrap hook automatically loads phase-specific strategy based on the calendar:

- **Draft** — Z-score rankings, positional scarcity, ADP value
- **Early season** — Trust projections, patience on slumps, aggressive on breakouts
- **Midseason** — Regression trades, prospect call-ups, closer volatility
- **Stretch run** — Win-now moves, aggressive streaming, FAAB spend-down
- **Playoffs** — Daily optimization, no bench bats, every slot matters

## Workflow Tools

| Tool | Description |
|------|-------------|
| `yahoo_morning_briefing` | Daily situational awareness — injuries, lineup, matchup, waivers, roster context |
| `yahoo_league_landscape` | Weekly league intelligence — standings, rivals, trades, power rankings |
| `yahoo_roster_health_check` | Roster audit — injuries, IL waste, bust candidates with Statcast context |
| `yahoo_waiver_recommendations` | Decision-ready add/drop pairs with category impact and intelligence context |
| `yahoo_auto_lineup` | Safe daily lineup optimization using hot/cold + BvP + weather (idempotent) |
| `yahoo_trade_analysis` | Trade evaluation by player names with positional and category impact |
| `yahoo_game_day_manager` | Game-day pipeline: schedule + weather + injuries + lineup + streaming |
| `yahoo_waiver_deadline_prep` | Pre-deadline waiver analysis with FAAB bids and simulation |
| `yahoo_trade_pipeline` | End-to-end trade search, evaluation, and proposal prep |
| `yahoo_weekly_digest` | End-of-week summary with narrative and key performers |
| `yahoo_season_checkpoint` | Monthly strategic assessment with playoff path |

## Cron Schedule

Nine scheduled jobs keep your team managed automatically (all times Eastern):

| Schedule | Job | What It Does |
|----------|-----|--------------|
| Every 15 min | Roster pulse | Polls for critical roster changes, delivers alerts immediately |
| Daily 9:00 AM | Morning briefing + auto lineup | Situational check with intelligence synthesis, sets optimal lineup |
| Daily 10:30 AM | Pre-lock check | Catches weather risks, late scratches, depth chart changes |
| Monday 8:00 AM | Matchup plan | Analyzes opponent with vulnerability detection, sets category targets |
| Tuesday 8:00 PM | Waiver deadline prep | Ranks waiver claims with FAAB bids, explains WHY using intelligence signals |
| Thursday 9:00 AM | Streaming check | Finds confirmed probable starters with favorable matchups and Stuff+ |
| Saturday 9:00 AM | Roster audit | Scans for IL waste, bust candidates, DFA'd players, role changes |
| Sunday 9:00 PM | Weekly digest | Narrative recap with hot/cold performers and standings impact |
| 1st of month 10:00 AM | Season checkpoint | Strategic assessment with regression-based trade recommendations |

## Agent Persona

`AGENTS.md` provides the agent with strategy rules, decision tiers, and season-phase awareness:

- **Auto-execute** — routine, low-risk actions (set lineup, activate from IL)
- **Execute + report** — moderate actions with clear upside (top waiver claim, streaming add)
- **Report + wait** — high-impact decisions requiring owner approval (trades, FAAB > 20%)

The intelligence layer automatically handles qualitative checks — players who are DFA'd, injured, or in the minors are filtered from all recommendations without manual verification.
