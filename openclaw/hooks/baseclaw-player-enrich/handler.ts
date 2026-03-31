import { fetchBaseclaw } from "../lib/fetch";

// Common fantasy baseball verbs that precede player names
var TRIGGER_PATTERNS = [
  /(?:pick up|add|drop|trade|roster|start|bench|stash|grab|target|sell|buy)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/g,
  /(?:what about|how about|thoughts on|opinion on|is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/gi,
  /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+(?:worth|droppable|tradeable|startable|available|injured|hot|cold)/g,
  /(?:trade|swap)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+(?:for|and)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/gi,
];

// Words that look like names but aren't players
var SKIP_WORDS = new Set([
  "the", "and", "for", "but", "not", "how", "what", "who", "when",
  "this", "that", "with", "from", "about", "should", "would", "could",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december",
  "yahoo", "fantasy", "baseball", "baseclaw", "waiver", "trade",
]);

function extractPlayerNames(text: string): string[] {
  var names = new Set<string>();
  for (var i = 0; i < TRIGGER_PATTERNS.length; i++) {
    var pattern = new RegExp(TRIGGER_PATTERNS[i].source, TRIGGER_PATTERNS[i].flags);
    var match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      // Capture groups 1 and 2 (trade X for Y pattern)
      for (var g = 1; g < match.length; g++) {
        if (match[g]) {
          var candidate = match[g].trim();
          var first = candidate.split(" ")[0].toLowerCase();
          if (!SKIP_WORDS.has(first) && candidate.length >= 4) {
            names.add(candidate);
          }
        }
      }
    }
  }
  return Array.from(names).slice(0, 4); // Cap at 4 players to keep latency low
}

async function fetchPlayerIntel(name: string): Promise<any> {
  return fetchBaseclaw("/api/player-intel?name=" + encodeURIComponent(name));
}

function formatIntelSummary(name: string, data: any): string {
  if (!data || data.error) return "";
  var parts: string[] = [];

  // Statcast quality
  var statcast = data.statcast || {};
  if (statcast.quality_tier) {
    parts.push("Statcast: " + statcast.quality_tier);
  }

  // Trends
  var trends = data.trends || {};
  if (trends.hot_cold) {
    parts.push("Streak: " + trends.hot_cold);
  }

  // Context flags
  var context = data.context || {};
  var flags = context.flags || [];
  for (var i = 0; i < flags.length; i++) {
    if (flags[i].type === "DEALBREAKER") {
      parts.push("DEALBREAKER: " + (flags[i].message || "unavailable"));
      break;
    } else if (flags[i].type === "WARNING") {
      parts.push("WARNING: " + (flags[i].message || ""));
      break;
    }
  }

  // Injury
  if (context.injury_severity) {
    parts.push("Injury: " + context.injury_severity);
  }

  // Availability
  if (context.availability && context.availability !== "available") {
    parts.push("Status: " + context.availability);
  }

  // Reddit
  var reddit = context.reddit || {};
  if (reddit.mentions >= 3) {
    parts.push("Reddit: " + reddit.sentiment + " (" + reddit.mentions + " mentions)");
  }

  if (parts.length === 0) return "";
  return "[" + name + "] " + parts.join(" | ");
}

var handler = async function (event: any): Promise<void> {
  if (event.type !== "message" || event.action !== "received") {
    return;
  }

  var content = (event.context && event.context.content) || "";
  if (!content || content.length < 5) return;

  var playerNames = extractPlayerNames(content);
  if (playerNames.length === 0) return;

  // Fetch intel for all detected players in parallel
  var results = await Promise.all(playerNames.map(function (name) {
    return fetchPlayerIntel(name);
  }));

  var summaries: string[] = [];
  for (var i = 0; i < playerNames.length; i++) {
    var summary = formatIntelSummary(playerNames[i], results[i]);
    if (summary) {
      summaries.push(summary);
    }
  }

  if (summaries.length > 0 && event.messages) {
    event.messages.push("[Player Intel] " + summaries.join("\n"));
    console.log("[baseclaw-player-enrich] Pre-fetched intel for " + playerNames.length + " player(s): " + playerNames.join(", "));
  }
};

export default handler;
