---
name: baseclaw-health
description: "Verifies BaseClaw MCP server is reachable on gateway startup"
metadata:
  openclaw:
    emoji: "+"
    events: ["gateway:startup"]
    requires:
      bins: ["node"]
---

# BaseClaw Health Check

On OpenClaw Gateway startup, pings BaseClaw's /health endpoint
to verify the Docker container is running and the MCP server is
reachable. Logs a warning if unreachable -- non-blocking diagnostic.

Configure the BaseClaw URL via BASECLAW_URL environment variable
(defaults to http://localhost:4951).
