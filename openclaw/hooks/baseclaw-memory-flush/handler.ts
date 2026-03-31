import * as fs from "fs/promises";
import * as path from "path";

var BASECLAW_URL = process.env.BASECLAW_URL || "http://localhost:8766";
var FETCH_TIMEOUT = 5000;

// Structured extraction patterns (more precise than keyword matching)
var SECTION_PATTERNS = {
  moves: [
    /(?:added|picked up|grabbed|rostered)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/gi,
    /(?:dropped|cut|released)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/gi,
    /(?:traded|dealt|sent)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+for\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/gi,
    /waiver claim.*?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/gi,
  ],
  strategy: [
    /(?:punting?|targeting?|focusing on)\s+([\w\s,]+?(?:categories?|cats?))/gi,
    /(?:sell[- ]high|buy[- ]low)\s+(?:on\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/gi,
    /(?:streaming|stream)\s+(?:pitchers?|SP|strategy)/gi,
    /(?:playoff|standings|rank)\s+(?:push|position|target)/gi,
  ],
  alerts: [
    /(?:placed on (?:IL|DL)|day-to-day|injured|DTD|out for)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})?/gi,
    /(?:DFA|designated for assignment|optioned|sent to minors)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})?/gi,
    /(?:trade proposed|trade accepted|pending trade)/gi,
    /(?:called up|promoted|activated)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/gi,
  ],
};

function extractSection(transcript: string, patterns: RegExp[]): string[] {
  var matches = new Set<string>();
  for (var i = 0; i < patterns.length; i++) {
    var pattern = new RegExp(patterns[i].source, patterns[i].flags);
    var match: RegExpExecArray | null;
    while ((match = pattern.exec(transcript)) !== null) {
      // Use the full match for context, trimmed
      var entry = match[0].trim();
      if (entry.length > 3 && entry.length < 200) {
        matches.add(entry);
      }
    }
  }
  return Array.from(matches);
}

async function fetchMonitorState(): Promise<any> {
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT);
  try {
    var response = await fetch(BASECLAW_URL + "/api/roster-monitor", { signal: controller.signal });
    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

var handler = async function (event: any): Promise<void> {
  if (event.type !== "session" || event.action !== "compact:before") {
    return;
  }

  var workspaceDir = (event.context && event.context.workspaceDir) || "";
  if (!workspaceDir) {
    console.log("[baseclaw-memory-flush] No workspace directory available, skipping");
    return;
  }

  var sessionEntry = event.context.sessionEntry;
  if (!sessionEntry) {
    return;
  }

  // Build transcript from session messages
  var transcript = "";
  if (typeof sessionEntry === "object" && sessionEntry.messages) {
    for (var i = 0; i < sessionEntry.messages.length; i++) {
      var msg = sessionEntry.messages[i];
      if (msg && msg.content) {
        transcript = transcript + "\n" + (typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content));
      }
    }
  }

  if (transcript.length < 50) {
    console.log("[baseclaw-memory-flush] Transcript too short, skipping");
    return;
  }

  // Extract structured sections
  var moves = extractSection(transcript, SECTION_PATTERNS.moves);
  var strategy = extractSection(transcript, SECTION_PATTERNS.strategy);
  var alerts = extractSection(transcript, SECTION_PATTERNS.alerts);

  // Fetch current roster state for context
  var monitor = await fetchMonitorState();

  var now = new Date();
  var dateStr = now.getFullYear() + "-"
    + String(now.getMonth() + 1).padStart(2, "0") + "-"
    + String(now.getDate()).padStart(2, "0");
  var timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  var lines: string[] = [];
  lines.push("## Session " + dateStr + " " + timeStr);
  lines.push("");

  if (moves.length > 0) {
    lines.push("### Roster Moves");
    for (var m = 0; m < moves.length; m++) {
      lines.push("- " + moves[m]);
    }
    lines.push("");
  }

  if (strategy.length > 0) {
    lines.push("### Strategy Decisions");
    for (var s = 0; s < strategy.length; s++) {
      lines.push("- " + strategy[s]);
    }
    lines.push("");
  }

  if (alerts.length > 0) {
    lines.push("### Alerts Processed");
    for (var a = 0; a < alerts.length; a++) {
      lines.push("- " + alerts[a]);
    }
    lines.push("");
  }

  // Append monitor state snapshot
  if (monitor && monitor.roster_size) {
    lines.push("### Roster State");
    lines.push("- Roster size: " + monitor.roster_size);
    if (monitor.alert_count > 0) {
      lines.push("- Active alerts: " + monitor.alert_count);
    }
    lines.push("");
  }

  if (lines.length <= 2) {
    console.log("[baseclaw-memory-flush] No structured notes extracted");
    return;
  }

  var memoryDir = path.join(workspaceDir, "memory");
  await fs.mkdir(memoryDir, { recursive: true });

  var filePath = path.join(memoryDir, dateStr + ".md");
  var content = "\n" + lines.join("\n");

  await fs.appendFile(filePath, content, "utf-8");
  console.log("[baseclaw-memory-flush] Persisted structured notes: "
    + moves.length + " moves, " + strategy.length + " strategy, " + alerts.length + " alerts");
};

export default handler;
