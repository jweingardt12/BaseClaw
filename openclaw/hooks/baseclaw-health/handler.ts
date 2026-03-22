var handler = async function (event: any): Promise<void> {
  if (event.type !== "gateway" || event.action !== "startup") {
    return;
  }

  var baseUrl = process.env.BASECLAW_URL || "http://localhost:4951";
  var healthUrl = baseUrl + "/health";

  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, 5000);
  try {
    var response = await fetch(healthUrl, { signal: controller.signal });
    if (response.ok) {
      var data = await response.json();
      console.log("[baseclaw-health] BaseClaw MCP server is reachable at " + baseUrl
        + " (writes_enabled=" + (data.writes_enabled || false) + ")");
    } else {
      console.log("[baseclaw-health] WARNING: BaseClaw returned HTTP " + response.status + " from " + healthUrl);
    }
  } catch (e: any) {
    console.log("[baseclaw-health] WARNING: BaseClaw MCP server unreachable at " + healthUrl
      + " (" + (e.message || String(e)) + ")");
    console.log("[baseclaw-health] Make sure the BaseClaw Docker container is running");
  } finally {
    clearTimeout(timer);
  }
};

export default handler;
