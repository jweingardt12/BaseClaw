// Structured error messages with user-friendly fix instructions
export const ERROR_MESSAGES: Record<string, {
  title: string;
  fix: string;
}> = {
  YAHOO_AUTH_EXPIRED: {
    title: "Yahoo API token expired",
    fix: "Run `./yf discover` to refresh your OAuth token, then restart: `docker compose restart`",
  },
  YAHOO_AUTH_MISSING: {
    title: "Yahoo API credentials not configured",
    fix: "Set YAHOO_CONSUMER_KEY and YAHOO_CONSUMER_SECRET in your .env file. See: developer.yahoo.com/apps/create/",
  },
  LEAGUE_NOT_FOUND: {
    title: "League not found",
    fix: "Run `./yf discover` to find your league ID, then update LEAGUE_ID in .env",
  },
  API_UNREACHABLE: {
    title: "BaseClaw API server not responding",
    fix: "Check if the Docker container is running: `docker compose ps`. Restart with: `docker compose up -d`",
  },
  BROWSER_SESSION_EXPIRED: {
    title: "Browser session expired (needed for write operations)",
    fix: "Run `./yf browser-login` to refresh the Yahoo browser session",
  },
  WRITE_OPS_DISABLED: {
    title: "Write operations are disabled",
    fix: "Set ENABLE_WRITE_OPS=true in .env and restart: `docker compose up -d`",
  },
  PLAYER_NOT_FOUND: {
    title: "Player not found",
    fix: "Check the player name spelling. Use yahoo_search to find players by name.",
  },
  RATE_LIMITED: {
    title: "Yahoo API rate limit hit",
    fix: "Wait 60 seconds and try again. Yahoo limits API calls to prevent abuse.",
  },
};

export function formatError(code: string, rawError?: string): string {
  const known = ERROR_MESSAGES[code];
  if (known) {
    return known.title + "\n\nFix: " + known.fix;
  }
  return "Unexpected error" + (rawError ? ": " + rawError : "") + "\n\nCheck logs: docker compose logs baseclaw";
}
