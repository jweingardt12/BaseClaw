# BaseClaw Heartbeat

Heartbeat checks run every 30 minutes during active hours (8 AM - midnight).
Uses the `/api/roster-monitor` endpoint which tracks state between checks
and only surfaces changes.

## Every heartbeat (30 min)
- Poll `/api/roster-monitor` for alerts
- If any `critical` severity alerts: deliver immediately
- If only `warning` or `info`: batch for next scheduled briefing

## Alert types detected by roster-monitor
- **injury**: Player status changed to IL/DTD (critical if IL60)
- **activation**: Player cleared from IL — needs lineup slot
- **dealbreaker**: Rostered player DFA'd, released, or season-ending injury
- **sent_down**: Rostered player optioned to minors — dead roster spot
- **roster_add/drop**: Roster composition changed (trade processed, claim cleared)
- **trending_fa**: Top-10 most-added free agent not on our roster — pickup window closing

## Daily checks (9 AM via morning-briefing cron)
- Full morning briefing with context-aware intelligence
- Auto-lineup optimization with hot/cold + BvP + weather adjustments
- Surface matchup highlights for today's games

## Weekly checks (Monday 8 AM via matchup-plan cron)
- Matchup strategy with category targets and streaming plan
- Opponent vulnerability analysis using their roster context flags
- Category trajectory alerts (improving/declining trends)

## Monthly checks (1st of month via season-checkpoint cron)
- Strategic assessment with playoff probability
- Trade market opportunities (sell-high/buy-low from regression signals)
- Roster composition vs. depth chart role changes
