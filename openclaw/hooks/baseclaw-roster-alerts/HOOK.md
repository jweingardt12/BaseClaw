---
name: baseclaw-roster-alerts
description: "Delivers urgent fantasy alerts (injuries, trades) as push notifications"
metadata:
  openclaw:
    emoji: "!"
    events: ["message:sent"]
    requires:
      bins: ["node"]
---

# BaseClaw Roster Alerts

Monitors outbound agent messages for injury and trade keywords.
When detected, pushes the alert text to the event messages array
so it surfaces as a notification rather than being buried in chat.

## Tracked keywords

- Injury: "placed on IL", "day-to-day", "injured", "DTD", "out for"
- Trades: "trade proposed", "trade accepted", "new trade"
- Urgent: "lineup lock", "empty slot", "waiver claim processed"
