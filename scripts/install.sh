#!/usr/bin/env bash
set -euo pipefail

# BaseClaw installer
# Usage: curl -fsSL https://raw.githubusercontent.com/jweingardt12/baseclaw/main/scripts/install.sh | bash
# Uninstall: curl -fsSL https://raw.githubusercontent.com/jweingardt12/baseclaw/main/scripts/install.sh | bash -s -- --uninstall

REPO="jweingardt12/baseclaw"
RAW="https://raw.githubusercontent.com/$REPO/main"
INSTALL_DIR="${BASECLAW_DIR:-$HOME/.baseclaw}"
CONTAINER="baseclaw"
SERVER_NAME="baseclaw"

# Colors (disabled if not a terminal)
if [ -t 1 ]; then
  GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; BOLD='\033[1m'; NC='\033[0m'
else
  GREEN=''; RED=''; YELLOW=''; BOLD=''; NC=''
fi

info()  { printf "${GREEN}>${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}!${NC} %s\n" "$*"; }
err()   { printf "${RED}x${NC} %s\n" "$*" >&2; }
ok()    { printf "${GREEN}ok${NC} %s\n" "$*"; }

# Detect download tool once
if command -v curl >/dev/null 2>&1; then
  FETCHER="curl"
elif command -v wget >/dev/null 2>&1; then
  FETCHER="wget"
else
  err "Neither curl nor wget found"; exit 1
fi

# Detect python3 once
HAS_PYTHON=false
if command -v python3 >/dev/null 2>&1; then
  HAS_PYTHON=true
fi

# Platform-compatible sed -i
sedi() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "$@"
  else
    sed -i "$@"
  fi
}

# Set a key=value in the .env file
set_env() {
  local key="$1" value="$2"
  sedi "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
}

# Check if a key in .env has a real value (not a placeholder)
has_real_value() {
  local key="$1"
  local val
  val=$(grep "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-) || true
  [ -n "$val" ] && [[ "$val" != your_*_here ]]
}

# Add or remove BaseClaw from an MCP JSON config file
manage_mcp_config() {
  local action="$1" cfg_path="$2"
  if [ "$HAS_PYTHON" != "true" ]; then return 1; fi
  python3 - "$action" "$cfg_path" "$CONTAINER" "$SERVER_NAME" <<'PYEOF'
import json, sys, os
action, cfg_path, container, name = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
try:
    with open(cfg_path) as f: cfg = json.load(f)
except (json.JSONDecodeError, FileNotFoundError, OSError):
    cfg = {}
servers = cfg.setdefault("mcpServers", {})
if action == "add":
    if name in servers:
        print(name + " already in " + cfg_path)
        sys.exit(0)
    servers[name] = {
        "command": "docker",
        "args": ["exec", "-i", container, "node", "/app/mcp-apps/dist/main.js", "--stdio"]
    }
    os.makedirs(os.path.dirname(cfg_path) or ".", exist_ok=True)
    with open(cfg_path, "w") as f: json.dump(cfg, f, indent=2); f.write("\n")
    print("Added " + name + " to " + cfg_path)
elif action == "remove":
    if name in servers:
        del servers[name]
        with open(cfg_path, "w") as f: json.dump(cfg, f, indent=2); f.write("\n")
        print("Removed " + name + " from " + cfg_path)
PYEOF
}

# Docker exec with TTY only when available
docker_exec_interactive() {
  if [ -t 0 ]; then
    docker exec -it "$@"
  else
    docker exec -i "$@"
  fi
}

# ---------------------------------------------------------------------------
# Uninstall
# ---------------------------------------------------------------------------
if [ "${1:-}" = "--uninstall" ]; then
  info "Uninstalling BaseClaw..."

  if [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
    (cd "$INSTALL_DIR" && docker compose down 2>/dev/null) || true
  fi

  if [ -d "$INSTALL_DIR" ]; then
    rm -rf "$INSTALL_DIR"
    ok "Removed $INSTALL_DIR"
  fi

  # Remove from MCP client configs
  for cfg in \
    "$HOME/.mcp.json" \
    "$HOME/Library/Application Support/Claude/claude_desktop_config.json" \
    "$HOME/.config/Claude/claude_desktop_config.json"; do
    if [ -f "$cfg" ]; then
      manage_mcp_config "remove" "$cfg" 2>/dev/null || true
    fi
  done

  ok "BaseClaw uninstalled"
  exit 0
fi

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
info "Checking prerequisites..."

if ! command -v docker >/dev/null 2>&1; then
  err "Docker is not installed. Install Docker first: https://docs.docker.com/get-docker/"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  err "Docker daemon is not running. Start Docker and try again."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  err "docker compose is not available. Update Docker or install the compose plugin."
  exit 1
fi

ok "Docker ready"

# ---------------------------------------------------------------------------
# Create install directory
# ---------------------------------------------------------------------------
info "Installing to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR/config" "$INSTALL_DIR/data"

# ---------------------------------------------------------------------------
# Download config files
# ---------------------------------------------------------------------------
fetch() {
  local src="$1" dest="$2"
  if [ -f "$dest" ]; then
    warn "Skipping $dest (already exists)"
    return 0
  fi
  if [ "$FETCHER" = "curl" ]; then
    curl -fsSL "$src" -o "$dest"
  else
    wget -qO "$dest" "$src"
  fi
}

info "Downloading config files..."
fetch "$RAW/docker-compose.example.yml" "$INSTALL_DIR/docker-compose.yml"
fetch "$RAW/.env.example"               "$INSTALL_DIR/.env"
fetch "$RAW/openclaw-config.yaml"       "$INSTALL_DIR/openclaw-config.yaml"
fetch "$RAW/AGENTS.md"                  "$INSTALL_DIR/AGENTS.md"
fetch "$RAW/openclaw-cron-examples.json" "$INSTALL_DIR/openclaw-cron-examples.json"
ok "Config files ready"

# ---------------------------------------------------------------------------
# Yahoo API credentials
# ---------------------------------------------------------------------------
ENV_FILE="$INSTALL_DIR/.env"

if ! has_real_value "YAHOO_CONSUMER_KEY" || ! has_real_value "YAHOO_CONSUMER_SECRET"; then
  echo ""
  printf "${BOLD}Yahoo API credentials required${NC}\n"
  echo "Create an app at https://developer.yahoo.com/apps/create"
  echo "  - Select 'Fantasy Sports' read permissions"
  echo "  - Set redirect URI to 'oob'"
  echo ""

  read -rp "Consumer Key: " CONSUMER_KEY
  read -rsp "Consumer Secret: " CONSUMER_SECRET
  echo ""

  if [ -z "$CONSUMER_KEY" ] || [ -z "$CONSUMER_SECRET" ]; then
    err "Both credentials are required"
    exit 1
  fi

  set_env "YAHOO_CONSUMER_KEY" "$CONSUMER_KEY"
  set_env "YAHOO_CONSUMER_SECRET" "$CONSUMER_SECRET"
  ok "Credentials saved"
else
  ok "Yahoo credentials already configured"
fi

# ---------------------------------------------------------------------------
# Pull and start container
# ---------------------------------------------------------------------------
info "Pulling Docker image..."
(cd "$INSTALL_DIR" && docker compose pull)

info "Starting container..."
(cd "$INSTALL_DIR" && docker compose up -d)

# Wait for health check
info "Waiting for server to start..."
SERVER_HEALTHY=false
TRIES=0
while [ $TRIES -lt 30 ]; do
  if curl -sf http://localhost:4951/health >/dev/null 2>&1; then
    SERVER_HEALTHY=true
    break
  fi
  sleep 1
  TRIES=$((TRIES + 1))
done

if [ "$SERVER_HEALTHY" = "true" ]; then
  ok "Server running"
else
  warn "Server didn't respond to health check within 30s"
  warn "Check logs: cd $INSTALL_DIR && docker compose logs"
fi

# ---------------------------------------------------------------------------
# Yahoo OAuth discovery
# ---------------------------------------------------------------------------
if ! has_real_value "LEAGUE_ID"; then
  if [ "$SERVER_HEALTHY" != "true" ]; then
    warn "Skipping discovery — server is not healthy"
  else
    echo ""
    printf "${BOLD}Yahoo account authorization${NC}\n"
    echo "This will open Yahoo's OAuth flow to find your league."
    echo ""
    read -rp "Run discovery now? [Y/n] " DO_DISCOVER
    DO_DISCOVER="${DO_DISCOVER:-Y}"

    if [[ "$DO_DISCOVER" =~ ^[Yy] ]]; then
      echo ""
      docker_exec_interactive "$CONTAINER" python3 /app/scripts/yahoo-fantasy.py discover || true

      echo ""
      read -rp "League ID (e.g., 469.l.16960): " LEAGUE_ID
      read -rp "Team ID (e.g., 469.l.16960.t.12): " TEAM_ID

      if [ -n "$LEAGUE_ID" ] && [ -n "$TEAM_ID" ]; then
        set_env "LEAGUE_ID" "$LEAGUE_ID"
        set_env "TEAM_ID" "$TEAM_ID"
        info "Restarting with league config..."
        (cd "$INSTALL_DIR" && docker compose up -d)
        ok "League configured"
      else
        warn "Skipped league config. Edit $ENV_FILE and restart: cd $INSTALL_DIR && docker compose up -d"
      fi
    else
      warn "Skipped discovery. Run later: docker exec -it $CONTAINER python3 /app/scripts/yahoo-fantasy.py discover"
    fi
  fi
else
  ok "League already configured"
fi

# ---------------------------------------------------------------------------
# Configure MCP clients
# ---------------------------------------------------------------------------
echo ""
printf "${BOLD}Configure MCP clients${NC}\n"

# Claude Code
read -rp "Add to Claude Code (~/.mcp.json)? [Y/n] " DO_CC
DO_CC="${DO_CC:-Y}"
if [[ "$DO_CC" =~ ^[Yy] ]]; then
  manage_mcp_config "add" "$HOME/.mcp.json" && ok "Claude Code configured" || warn "Could not configure Claude Code"
fi

# Claude Desktop
DESKTOP_CFG=""
if [[ "$OSTYPE" == "darwin"* ]]; then
  DESKTOP_CFG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
elif [[ "$OSTYPE" == "linux"* ]]; then
  DESKTOP_CFG="$HOME/.config/Claude/claude_desktop_config.json"
fi

if [ -n "$DESKTOP_CFG" ]; then
  read -rp "Add to Claude Desktop? [Y/n] " DO_CD
  DO_CD="${DO_CD:-Y}"
  if [[ "$DO_CD" =~ ^[Yy] ]]; then
    manage_mcp_config "add" "$DESKTOP_CFG" && ok "Claude Desktop configured" || warn "Could not configure Claude Desktop"
  fi
fi

# OpenClaw
if [ -d "$HOME/.openclaw" ]; then
  read -rp "Configure OpenClaw agent? [Y/n] " DO_OC
  DO_OC="${DO_OC:-Y}"
  if [[ "$DO_OC" =~ ^[Yy] ]]; then
    OC_DIR="$HOME/.openclaw/workspace/baseclaw"
    mkdir -p "$OC_DIR"
    cp "$INSTALL_DIR/openclaw-config.yaml" "$OC_DIR/"
    cp "$INSTALL_DIR/AGENTS.md" "$OC_DIR/"
    cp "$INSTALL_DIR/openclaw-cron-examples.json" "$OC_DIR/"
    ok "OpenClaw configured at $OC_DIR"
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "============================================"
printf "  ${GREEN}${BOLD}BaseClaw installed${NC}\n"
echo "============================================"
echo ""
echo "  Install dir:  $INSTALL_DIR"
echo "  Container:    $CONTAINER"

if has_real_value "LEAGUE_ID"; then
  LEAGUE_VAL=$(grep "^LEAGUE_ID=" "$ENV_FILE" | head -1 | cut -d= -f2-)
  echo "  League:       $LEAGUE_VAL"
fi

echo ""
echo "  Try it:"
echo "    Ask Claude: \"Show my roster\""
echo ""
echo "  Manage:"
echo "    cd $INSTALL_DIR && docker compose logs -f"
echo "    cd $INSTALL_DIR && docker compose down"
echo ""
echo "  Uninstall:"
echo "    curl -fsSL $RAW/scripts/install.sh | bash -s -- --uninstall"
echo ""
