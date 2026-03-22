---
name: baseclaw-memory-flush
description: "Persists fantasy context before session compaction"
metadata:
  openclaw:
    emoji: "*"
    events: ["session:compact:before"]
    requires:
      bins: ["node"]
---

# BaseClaw Memory Flush

Before session compaction, scans the transcript for fantasy-relevant
observations and appends them to the daily memory log. This preserves
standings changes, player performance notes, and strategy adjustments
that would otherwise be lost during context compaction.

Writes to: memory/YYYY-MM-DD.md
