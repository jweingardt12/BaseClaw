#!/usr/bin/env bash
set -e

# ---------------------------------------------------------------------------
# BaseClaw OpenClaw Installer
# Installs the OpenClaw workspace, hooks, cron jobs, and configuration
# for the BaseClaw Yahoo Fantasy Baseball MCP server.
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OPENCLAW_HOME="${HOME}/.openclaw"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

print_banner() {
  printf "\n"
  printf "  ============================================================\n"
  printf "    BaseClaw  --  OpenClaw Installer\n"
  printf "    Yahoo Fantasy Baseball MCP Server\n"
  printf "  ============================================================\n"
  printf "\n"
}

info() {
  printf "  [INFO]  %s\n" "$1"
}

warn() {
  printf "  [WARN]  %s\n" "$1"
}

fail() {
  printf "  [ERROR] %s\n" "$1" >&2
  exit 1
}

ok() {
  printf "  [OK]    %s\n" "$1"
}

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------

check_prerequisites() {
  info "Checking prerequisites..."

  # Node.js >= 18
  if ! command -v node >/dev/null 2>&1; then
    fail "node is not installed. Please install Node.js >= 18 and try again."
  fi

  NODE_VERSION="$(node -v | sed 's/^v//' | cut -d. -f1)"
  if [ "$NODE_VERSION" -lt 18 ] 2>/dev/null; then
    fail "Node.js >= 18 is required (found v${NODE_VERSION}). Please upgrade."
  fi
  ok "Node.js v$(node -v | sed 's/^v//') found"

  # OpenClaw CLI
  if ! command -v openclaw >/dev/null 2>&1; then
    warn "openclaw CLI not found in PATH."
    warn "Hook registration will be skipped. Install openclaw and run:"
    warn "  openclaw hooks enable baseclaw-roster-alerts baseclaw-memory-flush baseclaw-health"
    OPENCLAW_CLI_AVAILABLE=0
  else
    ok "openclaw CLI found at $(command -v openclaw)"
    OPENCLAW_CLI_AVAILABLE=1
  fi

  # ~/.openclaw directory
  if [ ! -d "$OPENCLAW_HOME" ]; then
    warn "~/.openclaw/ directory does not exist."
    printf "\n"
    printf "  It looks like OpenClaw has not been set up yet.\n"
    printf "  Run:  openclaw setup\n"
    printf "  Then re-run this installer.\n"
    printf "\n"
    read -p "  Continue anyway and create ~/.openclaw/? [y/N] " CONTINUE_ANSWER
    if [ "$CONTINUE_ANSWER" != "y" ] && [ "$CONTINUE_ANSWER" != "Y" ]; then
      info "Aborted. Run 'openclaw setup' first, then re-run this script."
      exit 0
    fi
    mkdir -p "$OPENCLAW_HOME"
    ok "Created ~/.openclaw/"
  else
    ok "~/.openclaw/ exists"
  fi

  printf "\n"
}

# ---------------------------------------------------------------------------
# Configuration prompts
# ---------------------------------------------------------------------------

gather_config() {
  info "Configuration (press Enter to accept defaults)"
  printf "\n"

  read -p "  BaseClaw MCP URL [http://localhost:4951]: " BASECLAW_URL
  BASECLAW_URL="${BASECLAW_URL:-http://localhost:4951}"

  read -p "  Webhook token (32-char hex) [auto-generate]: " WEBHOOK_TOKEN
  if [ -z "$WEBHOOK_TOKEN" ]; then
    if command -v openssl >/dev/null 2>&1; then
      WEBHOOK_TOKEN="$(openssl rand -hex 16)"
    else
      WEBHOOK_TOKEN="$(head -c 16 /dev/urandom | xxd -p | head -c 32)"
    fi
    info "Generated webhook token: ${WEBHOOK_TOKEN}"
  fi

  read -p "  Timezone [America/New_York]: " TIMEZONE
  TIMEZONE="${TIMEZONE:-America/New_York}"

  read -p "  Delivery channel (telegram/discord/slack/none) [none]: " DELIVERY_CHANNEL
  DELIVERY_CHANNEL="${DELIVERY_CHANNEL:-none}"

  DELIVERY_TO=""
  if [ "$DELIVERY_CHANNEL" != "none" ]; then
    read -p "  Delivery destination (chat/channel ID): " DELIVERY_TO
    if [ -z "$DELIVERY_TO" ]; then
      warn "No delivery destination provided. Notifications will not be delivered."
      DELIVERY_CHANNEL="none"
    fi
  fi

  read -p "  Default model [anthropic/claude-sonnet-4-20250514]: " MODEL
  MODEL="${MODEL:-anthropic/claude-sonnet-4-20250514}"

  # Auth token for MCP server (reuse webhook token if not set)
  read -p "  BaseClaw auth token [same as webhook token]: " BASECLAW_AUTH_TOKEN
  BASECLAW_AUTH_TOKEN="${BASECLAW_AUTH_TOKEN:-$WEBHOOK_TOKEN}"

  printf "\n"
  info "Configuration summary:"
  printf "    BaseClaw URL:      %s\n" "$BASECLAW_URL"
  printf "    Webhook token:     %s\n" "$WEBHOOK_TOKEN"
  printf "    Auth token:        %s\n" "$BASECLAW_AUTH_TOKEN"
  printf "    Timezone:          %s\n" "$TIMEZONE"
  printf "    Delivery channel:  %s\n" "$DELIVERY_CHANNEL"
  if [ "$DELIVERY_CHANNEL" != "none" ]; then
    printf "    Delivery to:       %s\n" "$DELIVERY_TO"
  fi
  printf "    Model:             %s\n" "$MODEL"
  printf "\n"

  read -p "  Proceed with installation? [Y/n] " PROCEED
  if [ "$PROCEED" = "n" ] || [ "$PROCEED" = "N" ]; then
    info "Aborted."
    exit 0
  fi
  printf "\n"
}

# ---------------------------------------------------------------------------
# Install workspace files
# ---------------------------------------------------------------------------

install_workspace() {
  info "Installing workspace files..."

  WORKSPACE_DIR="$OPENCLAW_HOME/workspace"
  mkdir -p "$WORKSPACE_DIR"

  # Copy top-level workspace markdown files
  for FILE in AGENTS.md SOUL.md TOOLS.md HEARTBEAT.md MEMORY.md USER.md; do
    SRC="$SCRIPT_DIR/$FILE"
    if [ -f "$SRC" ]; then
      cp "$SRC" "$WORKSPACE_DIR/$FILE"
      ok "Copied $FILE"
    else
      warn "Source file not found: $SRC (skipping)"
    fi
  done

  # Copy workflows directory
  if [ -d "$SCRIPT_DIR/workflows" ]; then
    mkdir -p "$WORKSPACE_DIR/workflows"
    if [ "$(ls -A "$SCRIPT_DIR/workflows/" 2>/dev/null)" ]; then
      cp -r "$SCRIPT_DIR/workflows/"* "$WORKSPACE_DIR/workflows/"
      ok "Copied workflows/"
    else
      ok "workflows/ directory is empty (created placeholder)"
    fi
  else
    warn "No workflows/ directory found in source"
  fi
}

# ---------------------------------------------------------------------------
# Install MCP porter config
# ---------------------------------------------------------------------------

install_mcporter() {
  info "Installing mcporter.json..."

  CONFIG_DIR="$OPENCLAW_HOME/workspace/config"
  mkdir -p "$CONFIG_DIR"

  SRC="$SCRIPT_DIR/config/mcporter.json"
  if [ ! -f "$SRC" ]; then
    fail "mcporter.json template not found at $SRC"
  fi

  sed \
    -e "s|{{BASECLAW_URL}}|${BASECLAW_URL}|g" \
    -e "s|{{BASECLAW_AUTH_TOKEN}}|${BASECLAW_AUTH_TOKEN}|g" \
    "$SRC" > "$CONFIG_DIR/mcporter.json"

  ok "Generated workspace/config/mcporter.json"
}

# ---------------------------------------------------------------------------
# Install openclaw.json
# ---------------------------------------------------------------------------

install_openclaw_config() {
  info "Installing openclaw.json..."

  SRC="$SCRIPT_DIR/config/openclaw.json"
  if [ ! -f "$SRC" ]; then
    fail "openclaw.json template not found at $SRC"
  fi

  # Strip JSON comments before sed replacement (lines starting with //)
  grep -v '^\s*//' "$SRC" \
    | sed \
      -e "s|{{TIMEZONE}}|${TIMEZONE}|g" \
      -e "s|{{WEBHOOK_TOKEN}}|${WEBHOOK_TOKEN}|g" \
    > "$OPENCLAW_HOME/openclaw.json"

  ok "Generated ~/.openclaw/openclaw.json"
}

# ---------------------------------------------------------------------------
# Install cron jobs
# ---------------------------------------------------------------------------

install_cron() {
  info "Installing cron jobs..."

  CRON_DIR="$OPENCLAW_HOME/cron"
  mkdir -p "$CRON_DIR"

  SRC="$SCRIPT_DIR/cron/jobs.json"
  if [ ! -f "$SRC" ]; then
    warn "cron/jobs.json not found at $SRC (skipping cron installation)"
    return
  fi

  sed \
    -e "s|{{DELIVERY_CHANNEL}}|${DELIVERY_CHANNEL}|g" \
    -e "s|{{DELIVERY_TO}}|${DELIVERY_TO}|g" \
    "$SRC" > "$CRON_DIR/jobs.json"

  ok "Generated ~/.openclaw/cron/jobs.json"
}

# ---------------------------------------------------------------------------
# Install hooks
# ---------------------------------------------------------------------------

install_hooks() {
  info "Installing event hooks..."

  HOOKS_DIR="$OPENCLAW_HOME/hooks"
  mkdir -p "$HOOKS_DIR"

  for HOOK_NAME in baseclaw-roster-alerts baseclaw-memory-flush baseclaw-health; do
    HOOK_SRC="$SCRIPT_DIR/hooks/$HOOK_NAME"
    HOOK_DEST="$HOOKS_DIR/$HOOK_NAME"

    if [ ! -d "$HOOK_SRC" ]; then
      warn "Hook source not found: $HOOK_SRC (skipping)"
      continue
    fi

    mkdir -p "$HOOK_DEST"
    cp "$HOOK_SRC/HOOK.md" "$HOOK_DEST/HOOK.md"
    cp "$HOOK_SRC/handler.ts" "$HOOK_DEST/handler.ts"
    ok "Installed hook: $HOOK_NAME"
  done

  # Enable hooks via CLI if available
  if [ "$OPENCLAW_CLI_AVAILABLE" -eq 1 ]; then
    info "Enabling hooks via openclaw CLI..."
    openclaw hooks enable baseclaw-roster-alerts baseclaw-memory-flush baseclaw-health \
      && ok "Hooks enabled" \
      || warn "Hook enable command failed (hooks may need manual activation)"
  else
    warn "Skipping hook registration (openclaw CLI not available)"
    warn "Run manually: openclaw hooks enable baseclaw-roster-alerts baseclaw-memory-flush baseclaw-health"
  fi
}

# ---------------------------------------------------------------------------
# Validate BaseClaw connectivity
# ---------------------------------------------------------------------------

validate_health() {
  info "Validating BaseClaw connectivity..."

  HEALTH_URL="${BASECLAW_URL}/health"

  if ! command -v curl >/dev/null 2>&1; then
    warn "curl not found, skipping health check"
    return
  fi

  HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 "$HEALTH_URL" 2>/dev/null || true)"

  if [ "$HTTP_CODE" = "200" ]; then
    ok "BaseClaw is reachable at $HEALTH_URL (HTTP 200)"
  elif [ -z "$HTTP_CODE" ] || [ "$HTTP_CODE" = "000" ]; then
    warn "BaseClaw is not reachable at $HEALTH_URL"
    warn "Make sure the Docker container is running: docker compose up -d"
  else
    warn "BaseClaw returned HTTP $HTTP_CODE from $HEALTH_URL"
  fi
}

# ---------------------------------------------------------------------------
# Print summary
# ---------------------------------------------------------------------------

print_summary() {
  printf "\n"
  printf "  ============================================================\n"
  printf "    Installation Complete\n"
  printf "  ============================================================\n"
  printf "\n"
  printf "  Installed:\n"
  printf "    - Workspace files    -> ~/.openclaw/workspace/\n"
  printf "    - MCP porter config  -> ~/.openclaw/workspace/config/mcporter.json\n"
  printf "    - OpenClaw config    -> ~/.openclaw/openclaw.json\n"
  printf "    - Cron jobs          -> ~/.openclaw/cron/jobs.json\n"
  printf "    - Event hooks        -> ~/.openclaw/hooks/\n"
  printf "        baseclaw-roster-alerts   (message:sent)\n"
  printf "        baseclaw-memory-flush    (session:compact:before)\n"
  printf "        baseclaw-health          (gateway:startup)\n"
  printf "\n"
  printf "  Next steps:\n"
  printf "    1. Start the BaseClaw Docker container:\n"
  printf "         cd %s && docker compose up -d\n" "$(dirname "$SCRIPT_DIR")"
  printf "\n"
  printf "    2. Start the OpenClaw gateway:\n"
  printf "         openclaw start\n"
  printf "\n"
  if [ "$DELIVERY_CHANNEL" != "none" ]; then
    printf "    3. Verify %s delivery is working:\n" "$DELIVERY_CHANNEL"
    printf "         openclaw test notify --channel %s --to %s\n" "$DELIVERY_CHANNEL" "$DELIVERY_TO"
    printf "\n"
  else
    printf "    3. (Optional) Configure a messaging channel for notifications:\n"
    printf "         Edit ~/.openclaw/cron/jobs.json to set delivery channel and ID\n"
    printf "\n"
  fi
  printf "    4. Check server health:\n"
  printf "         curl %s/health\n" "$BASECLAW_URL"
  printf "\n"
  printf "  Webhook token (save this): %s\n" "$WEBHOOK_TOKEN"
  printf "\n"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
  print_banner
  check_prerequisites
  gather_config
  install_workspace
  install_mcporter
  install_openclaw_config
  install_cron
  install_hooks
  validate_health
  print_summary
}

main "$@"
