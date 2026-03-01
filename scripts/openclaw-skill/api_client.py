"""Shared HTTP client for openclaw automation scripts.

Provides api_get() and api_post() helpers that all four automation
scripts (daily-lineup, injury-monitor, waiver-scout, weekly-recap)
use to communicate with the Python API server.

Coding conventions: string concatenation (no f-strings),
.get() for all dict access, try/except with print() for errors.
"""

import json
import urllib.request
import urllib.error


DEFAULT_TIMEOUT = 30


def api_get(base_url, path, params=None, timeout=DEFAULT_TIMEOUT):
    """Make a GET request to the Python API and return parsed JSON.

    Args:
        base_url: API base URL (e.g. "http://localhost:8766")
        path: endpoint path (e.g. "/api/injury-report")
        params: optional dict of query parameters
        timeout: request timeout in seconds (default 30)

    Returns:
        Parsed JSON dict, or dict with "error" key on failure.
    """
    try:
        url = base_url.rstrip("/") + path
        if params:
            query_parts = []
            for key, value in params.items():
                query_parts.append(
                    urllib.request.quote(str(key), safe="")
                    + "="
                    + urllib.request.quote(str(value), safe="")
                )
            url = url + "?" + "&".join(query_parts)

        req = urllib.request.Request(url)
        req.add_header("Accept", "application/json")

        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)

    except urllib.error.HTTPError as e:
        error_body = ""
        try:
            error_body = e.read().decode("utf-8")
        except Exception:
            pass
        if error_body:
            return {"error": "HTTP " + str(e.code) + ": " + error_body}
        return {"error": "HTTP " + str(e.code) + " from " + path}
    except urllib.error.URLError as e:
        return {"error": "Connection error: " + str(e.reason)}
    except Exception as e:
        return {"error": "Request failed: " + str(e)}


def api_post(base_url, path, payload=None, timeout=DEFAULT_TIMEOUT):
    """Make a POST request with JSON body, return parsed JSON dict.

    Args:
        base_url: API base URL (e.g. "http://localhost:8766")
        path: endpoint path (e.g. "/api/set-lineup")
        payload: dict to send as JSON body (default None sends empty object)
        timeout: request timeout in seconds (default 30)

    Returns:
        Parsed JSON dict, or dict with "error" key on failure.
    """
    try:
        url = base_url.rstrip("/") + path
        if payload is None:
            payload = {}
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url, data=data, method="POST",
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)

    except urllib.error.HTTPError as e:
        error_body = ""
        try:
            error_body = e.read().decode("utf-8")
        except Exception:
            pass
        if error_body:
            return {"error": "HTTP " + str(e.code) + ": " + error_body}
        return {"error": "HTTP " + str(e.code) + " from " + path}
    except urllib.error.URLError as e:
        return {"error": "Connection error: " + str(e.reason)}
    except Exception as e:
        return {"error": "Request failed: " + str(e)}
