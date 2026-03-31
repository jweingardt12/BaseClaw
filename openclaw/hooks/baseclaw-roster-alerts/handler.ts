import { fetchBaseclaw } from "../lib/fetch";

var _lastAlertHashes = new Set<string>();
var _alertOrder: string[] = [];  // FIFO for eviction

var handler = async function (event: any): Promise<void> {
  if (event.type !== "message" || event.action !== "sent") {
    return;
  }

  // Poll the real roster monitor for state changes
  var monitor = await fetchBaseclaw("/api/roster-monitor");
  if (!monitor || !monitor.alerts || monitor.alerts.length === 0) {
    return;
  }

  // Only surface NEW alerts (not ones we already reported)
  var newAlerts: any[] = [];
  for (var i = 0; i < monitor.alerts.length; i++) {
    var alert = monitor.alerts[i];
    var hash = alert.type + ":" + alert.message;
    if (!_lastAlertHashes.has(hash)) {
      _lastAlertHashes.add(hash);
      _alertOrder.push(hash);
      newAlerts.push(alert);
    }
  }

  // FIFO eviction: remove oldest entries when over 200
  while (_lastAlertHashes.size > 200 && _alertOrder.length > 0) {
    var oldest = _alertOrder.shift();
    if (oldest) _lastAlertHashes.delete(oldest);
  }

  if (newAlerts.length === 0) {
    return;
  }

  // Build structured alert messages
  var criticals = newAlerts.filter(function (a) { return a.severity === "critical"; });
  var warnings = newAlerts.filter(function (a) { return a.severity === "warning"; });

  if (criticals.length > 0) {
    var alertLines = criticals.map(function (a) { return "[CRITICAL] " + a.message; });
    if (warnings.length > 0) {
      alertLines = alertLines.concat(warnings.map(function (a) { return "[WARNING] " + a.message; }));
    }
    var summary = "[BaseClaw] " + criticals.length + " critical alert(s):\n" + alertLines.join("\n");
    console.log("[baseclaw-roster-alerts] " + summary);
    if (event.messages) {
      event.messages.push(summary);
    }
  } else if (warnings.length > 0) {
    var warnSummary = "[BaseClaw] " + warnings.length + " warning(s): "
      + warnings.map(function (a) { return a.message; }).join("; ");
    console.log("[baseclaw-roster-alerts] " + warnSummary);
    if (event.messages) {
      event.messages.push(warnSummary);
    }
  }
};

export default handler;
