import * as fs from "fs/promises";
import * as path from "path";

var FANTASY_KEYWORDS = [
  "standings", "playoff", "traded", "dropped", "added", "waiver",
  "il", "injured", "streaming", "faab", "category", "punt",
  "sell high", "buy low", "regression", "breakout", "bust",
];

function extractFantasyNotes(content: string): string[] {
  var lines = content.split("\n");
  var notes: string[] = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    for (var j = 0; j < FANTASY_KEYWORDS.length; j++) {
      if (line.toLowerCase().indexOf(FANTASY_KEYWORDS[j]) !== -1) {
        notes.push(line);
        break;
      }
    }
  }
  return notes;
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

  var transcript = "";
  if (typeof sessionEntry === "object" && sessionEntry.messages) {
    for (var i = 0; i < sessionEntry.messages.length; i++) {
      var msg = sessionEntry.messages[i];
      if (msg && msg.content) {
        transcript = transcript + "\n" + (typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content));
      }
    }
  }

  var notes = extractFantasyNotes(transcript);
  if (notes.length === 0) {
    console.log("[baseclaw-memory-flush] No fantasy-relevant notes to persist");
    return;
  }

  var now = new Date();
  var dateStr = now.getFullYear() + "-"
    + String(now.getMonth() + 1).padStart(2, "0") + "-"
    + String(now.getDate()).padStart(2, "0");
  var memoryDir = path.join(workspaceDir, "memory");

  await fs.mkdir(memoryDir, { recursive: true });

  var filePath = path.join(memoryDir, dateStr + ".md");
  var header = "\n## BaseClaw Session Notes (" + now.toLocaleTimeString() + ")\n\n";
  var content = header + notes.map(function (n) { return "- " + n; }).join("\n") + "\n";

  await fs.appendFile(filePath, content, "utf-8");
  console.log("[baseclaw-memory-flush] Persisted " + notes.length + " notes to memory/" + dateStr + ".md");
};

export default handler;
