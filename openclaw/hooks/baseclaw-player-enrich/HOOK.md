---
name: baseclaw-player-enrich
description: "Detects player names in inbound messages and pre-fetches intelligence context"
metadata:
  openclaw:
    emoji: "@"
    events: ["message:received"]
    requires:
      bins: ["node"]
---

# BaseClaw Player Enrichment

When a user mentions a player name in a message, this hook pre-fetches
their intelligence profile from BaseClaw and appends it as context.
The agent sees the player's Statcast quality, injury status, news flags,
and availability before processing the message — enabling instant,
informed responses without requiring explicit tool calls.

Detects patterns like:
- "Should I pick up Juan Soto?"
- "What do you think about Corbin Burnes?"
- "Trade Soto for Judge?"
- "Is Ohtani droppable?"
