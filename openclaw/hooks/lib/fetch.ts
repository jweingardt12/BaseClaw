var BASECLAW_URL = process.env.BASECLAW_URL || "http://localhost:8766";
var DEFAULT_TIMEOUT = 5000;

export async function fetchBaseclaw(path: string, timeoutMs?: number): Promise<any> {
  var timeout = timeoutMs || DEFAULT_TIMEOUT;
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, timeout);
  try {
    var response = await fetch(BASECLAW_URL + path, { signal: controller.signal });
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
