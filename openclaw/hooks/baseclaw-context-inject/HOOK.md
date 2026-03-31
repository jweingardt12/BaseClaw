---
name: baseclaw-context-inject
description: "Injects live league state and roster alerts into every agent session at bootstrap"
metadata:
  openclaw:
    emoji: ">"
    events: ["agent:bootstrap"]
    requires:
      bins: ["node"]
---

# BaseClaw Context Injection

On every agent bootstrap, fetches live league state from BaseClaw's API
and injects a dynamically-generated CONTEXT.md into the session. This means
every conversation starts with full awareness of:

- Current standings position and record
- Active matchup score and opponent
- Critical roster alerts (injuries, DFAs, players in minors)
- Season phase (pre-season, early, midseason, stretch, playoffs)
- Trending free agents worth grabbing
- Next lineup edit date

No more cold starts. No more needing to call yahoo_league_context manually.
