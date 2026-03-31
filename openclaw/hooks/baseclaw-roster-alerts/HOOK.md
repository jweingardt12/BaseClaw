---
name: baseclaw-roster-alerts
description: "Detects real roster state changes via /api/roster-monitor and surfaces alerts"
metadata:
  openclaw:
    emoji: "!"
    events: ["message:sent"]
    requires:
      bins: ["node"]
---

# BaseClaw Roster Alerts

Monitors roster state via BaseClaw's /api/roster-monitor endpoint on each
outbound message. Surfaces only NEW alerts that haven't been reported before.

Unlike keyword-matching, this detects actual events:
- Player placed on IL or activated
- Player DFA'd, released, or optioned to minors
- Trending free agents with ownership spikes
- Roster composition changes (trades, waiver claims)

Critical alerts are delivered immediately. Warnings are batched.
