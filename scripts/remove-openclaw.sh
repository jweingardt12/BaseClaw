#!/usr/bin/env bash
set -euo pipefail

# Remove BaseClaw from OpenClaw
# Removes mcporter entry, skill directory, and cron jobs.

OC_HOME="$HOME/.openclaw"
MCPORTER_CFG="$OC_HOME/workspace/config/mcporter.json"
SKILL_DIR="$OC_HOME/workspace/skills/baseclaw"
GATEWAY="http://localhost:18789"

# Colors
if [ -t 1 ]; then
  GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; NC='\033[0m'
else
  GREEN=''; YELLOW=''; RED=''; NC=''
fi

info()  { printf "${GREEN}>${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}!${NC} %s\n" "$*"; }
ok()    { printf "${GREEN}ok${NC} %s\n" "$*"; }

# Require python3
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required but not found"; exit 1
fi

if [ ! -d "$OC_HOME" ]; then
  echo "OpenClaw not found. Nothing to remove."
  exit 0
fi

# ---------------------------------------------------------------------------
# Remove MCP server from mcporter
# ---------------------------------------------------------------------------
if [ -f "$MCPORTER_CFG" ]; then
  python3 - "$MCPORTER_CFG" <<'PYEOF'
import json, sys

cfg_path = sys.argv[1]
try:
    with open(cfg_path) as f:
        cfg = json.load(f)
except (json.JSONDecodeError, FileNotFoundError, OSError):
    sys.exit(0)

servers = cfg.get("mcpServers", {})
if "baseclaw" in servers:
    del servers["baseclaw"]
    with open(cfg_path, "w") as f:
        json.dump(cfg, f, indent=2)
        f.write("\n")
    print("Removed baseclaw from " + cfg_path)
else:
    print("baseclaw not found in " + cfg_path)
PYEOF
  ok "MCP server removed from mcporter"
fi

# ---------------------------------------------------------------------------
# Remove skill directory
# ---------------------------------------------------------------------------
if [ -d "$SKILL_DIR" ]; then
  rm -rf "$SKILL_DIR"
  ok "Skill removed from $SKILL_DIR"
else
  info "Skill directory not found (already removed)"
fi

# ---------------------------------------------------------------------------
# Remove cron jobs via gateway API
# ---------------------------------------------------------------------------
GATEWAY_UP=false
if curl -sf "$GATEWAY/health" >/dev/null 2>&1; then
  GATEWAY_UP=true
fi

if [ "$GATEWAY_UP" = true ]; then
  # Read gateway auth token
  GW_TOKEN=""
  OC_CFG="$OC_HOME/openclaw.json"
  if [ -f "$OC_CFG" ]; then
    GW_TOKEN=$(python3 -c "
import json, sys
try:
    with open(sys.argv[1]) as f:
        c = json.load(f)
    print(c.get('gateway', {}).get('auth', {}).get('token', ''))
except Exception:
    pass
" "$OC_CFG" 2>/dev/null) || true
  fi

  if [ -n "$GW_TOKEN" ]; then
    REMOVED=$(python3 - "$GATEWAY" "$GW_TOKEN" <<'PYEOF'
import json, sys, urllib.request, urllib.error

gateway, token = sys.argv[1], sys.argv[2]

# Known BaseClaw cron job names
BASECLAW_JOBS = {
    "Daily morning briefing + auto lineup",
    "Daily pre-lock lineup check",
    "Monday matchup plan",
    "Tuesday waiver deadline prep",
    "Thursday streaming check",
    "Saturday roster audit",
    "Sunday weekly digest",
    "Monthly season checkpoint",
}

# List all cron jobs
req = urllib.request.Request(
    gateway + "/api/cron/jobs",
    headers={"Authorization": "Bearer " + token},
)
try:
    resp = urllib.request.urlopen(req, timeout=10)
    jobs = json.loads(resp.read())
except Exception as e:
    print(0)
    sys.exit(0)

# Handle both list and dict responses
if isinstance(jobs, dict):
    jobs = jobs.get("jobs", jobs.get("data", []))

removed = 0
for job in jobs:
    name = job.get("name", "")
    job_id = job.get("id", "")
    if name in BASECLAW_JOBS and job_id:
        del_req = urllib.request.Request(
            gateway + "/api/cron/jobs/" + str(job_id),
            headers={"Authorization": "Bearer " + token},
            method="DELETE",
        )
        try:
            urllib.request.urlopen(del_req, timeout=10)
            removed += 1
        except Exception:
            pass

print(removed)
PYEOF
    )
    if [ "$REMOVED" -gt 0 ] 2>/dev/null; then
      ok "$REMOVED cron jobs removed"
    else
      info "No BaseClaw cron jobs found"
    fi
  else
    warn "Could not read gateway token — skipping cron job removal"
    echo "  Remove cron jobs manually through your OpenClaw agent."
  fi
else
  warn "OpenClaw gateway not running — skipping cron job removal"
  echo "  Start OpenClaw and run this script again to remove cron jobs."
fi

ok "BaseClaw removed from OpenClaw"
