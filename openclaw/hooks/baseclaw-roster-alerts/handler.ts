var ALERT_PATTERNS = [
  /placed on (?:IL|DL)/i,
  /day-to-day/i,
  /injured/i,
  /\bDTD\b/,
  /out for \d+/i,
  /trade proposed/i,
  /trade accepted/i,
  /new trade/i,
  /lineup lock/i,
  /empty slot/i,
  /waiver claim processed/i,
];

var handler = async function (event: any): Promise<void> {
  if (event.type !== "message" || event.action !== "sent") {
    return;
  }

  var content = (event.context && event.context.content) || "";
  if (!content) {
    return;
  }

  var matched: string[] = [];
  for (var i = 0; i < ALERT_PATTERNS.length; i++) {
    if (ALERT_PATTERNS[i].test(content)) {
      matched.push(ALERT_PATTERNS[i].source);
    }
  }

  if (matched.length > 0) {
    var summary = "[BaseClaw Alert] " + matched.length + " alert(s) detected in outbound message";
    console.log(summary);
    if (event.messages) {
      event.messages.push(summary);
    }
  }
};

export default handler;
