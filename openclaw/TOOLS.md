# BaseClaw Tool Reference

## Tool Naming Conventions

All tools follow a prefix-based naming scheme:

- `yahoo_*` -- Yahoo Fantasy league operations. Direct interaction with the Yahoo Fantasy API for roster management, standings, matchups, trades, and waivers.
- `fantasy_*` -- Cross-source intelligence. Aggregates data from news feeds, prospect databases, Statcast, and analytics platforms.
- `mlb_*` -- MLB reference data. Team rosters, schedules, standings, and game results from the MLB Stats API.

## Toolset Profiles

BaseClaw loads different tool subsets depending on context. Set via `MCP_TOOLSET` environment variable or the `discover_capabilities` meta-tool.

| Profile      | Tools | Use Case                                      |
|------------- |-------|-----------------------------------------------|
| `default`    | ~26   | Everyday management: roster, matchups, news   |
| `full`       | ~50+  | All tools loaded, no filtering                |
| `draft-day`  | ~20   | Draft-specific: rankings, z-scores, picks     |
| `analysis`   | ~30   | Deep dives: Statcast, trends, projections     |
| `automation` | ~15   | Cron/workflow: briefings, alerts, batch ops   |
| `all`        | All   | Everything, including experimental tools      |

## Write-Gated Tools

The following tools modify league state and require `ENABLE_WRITE_OPS=true` in the environment. They will return an error if write operations are disabled.

- `yahoo_add` -- Add a free agent to the roster
- `yahoo_drop` -- Drop a player from the roster
- `yahoo_swap` -- Add one player and drop another in a single transaction
- `yahoo_waiver_claim` -- Submit a waiver claim with optional FAAB bid
- `yahoo_propose_trade` -- Send a trade proposal to another team
- `yahoo_accept_trade` -- Accept an incoming trade proposal
- `yahoo_reject_trade` -- Reject an incoming trade proposal
- `yahoo_set_lineup` -- Set the starting lineup for a given date

Even when write ops are enabled, these tools require explicit user confirmation before execution (unless full-auto autonomy is active AND the move is classified as safe).

## Tool Discovery

Two meta-tools help navigate the full tool surface:

### discover_capabilities

Browse available tool categories and see which tools are loaded in the current profile.

```
discover_capabilities
  category: "roster" | "analysis" | "trades" | "waivers" | "matchups" | "news" | "prospects" | "mlb" | ...
```

Returns a list of tools in that category with brief descriptions.

### get_tool_details

Get full parameter documentation for a specific tool.

```
get_tool_details
  tool_name: "yahoo_add" | "fantasy_prospect_rankings" | ...
```

Returns parameter names, types, required/optional flags, and usage examples.

## Workflow Tools

These higher-level tools orchestrate multi-step operations:

- `yahoo_morning_briefing` -- Start-of-day summary. Pulls overnight news, checks today's schedule, reviews lineup for off-day players, highlights waiver wire pickups, and previews the current matchup. Best called first thing in the morning or at the start of a session.
- `yahoo_game_day_manager` -- Pre-game preparation. Checks probable pitchers, weather delays, late scratches, and optimizes the lineup for the day's slate. Call this 1-2 hours before first pitch.
- `yahoo_waiver_deadline_prep` -- Waiver night preparation. Scans available free agents, compares to roster needs, ranks targets by impact, and suggests FAAB bid amounts. Call this before the waiver processing window.

## Key Patterns

### Always start with league context

At the beginning of any new session, call `yahoo_league_context` to load:

- League ID and team ID
- Scoring categories (batting and pitching)
- League format (H2H, roto, points)
- Roster positions and limits
- Current standings and matchup

This ensures all subsequent advice accounts for league-specific rules. For example, a league with K (negative) for batters penalizes strikeouts, which changes player valuations significantly compared to a league without that category.

### Chain analysis before action

Before calling any write-gated tool, always run the relevant analysis first:

1. `yahoo_roster` to see current roster state
2. `fantasy_player_news` or `fantasy_statcast` to evaluate the target player
3. `yahoo_free_agents` or `yahoo_trade_block` to compare alternatives
4. Only then call `yahoo_add`, `yahoo_swap`, or `yahoo_propose_trade`

### Use Statcast for buy-low/sell-high

`fantasy_statcast` provides underlying metrics (barrel rate, exit velocity, xwOBA, stuff+) that often diverge from surface stats early in the season. Use these to identify:

- **Buy-low targets**: poor traditional stats but strong Statcast metrics (due for positive regression)
- **Sell-high candidates**: strong traditional stats but weak underlying metrics (due for negative regression)
