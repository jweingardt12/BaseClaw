var BASECLAW_URL = process.env.BASECLAW_URL || "http://localhost:8766";
var FETCH_TIMEOUT = 5000;
var _lastAlertHashes = new Set<string>();

async function fetchMonitor(): Promise<any> {
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
  if (event.type !== "message" || event.action !== "sent") {
    return;
  }

  // Poll the real roster monitor for state changes
  var monitor = await fetchMonitor();
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
      newAlerts.push(alert);
    }
  }

  // Cap the hash set to prevent unbounded growth
  if (_lastAlertHashes.size > 200) {
    _lastAlertHashes.clear();
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
