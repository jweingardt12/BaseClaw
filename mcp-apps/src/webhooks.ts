// mcp-apps/src/webhooks.ts
// Native webhook endpoints mirroring OpenClaw's /hooks/wake and /hooks/agent API.
// Auth via Authorization: Bearer <token> or x-openclaw-token: <token> header.

import { Request, Response, Router } from "express";
import { timingSafeEqual } from "crypto";
import { apiGet, apiPost } from "./api/python-client.js";
import { formatError } from "./api/errors.js";

var WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN || "";

function safeTokenEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// --- Rate limiting ---

var failedAttempts: Record<string, { count: number; firstAt: number }> = {};
var RATE_WINDOW_MS = 60000;
var MAX_FAILURES = 5;

function checkRateLimit(ip: string): number | null {
  var entry = failedAttempts[ip];
  if (!entry) return null;
  var elapsed = Date.now() - entry.firstAt;
  if (elapsed > RATE_WINDOW_MS) {
    delete failedAttempts[ip];
    return null;
  }
  if (entry.count >= MAX_FAILURES) {
    return Math.ceil((RATE_WINDOW_MS - elapsed) / 1000);
  }
  return null;
}

function recordFailure(ip: string): void {
  var entry = failedAttempts[ip];
  if (!entry || Date.now() - entry.firstAt > RATE_WINDOW_MS) {
    failedAttempts[ip] = { count: 1, firstAt: Date.now() };
  } else {
    entry.count++;
  }
}

// --- Auth middleware ---

function extractToken(req: Request): string {
  var authHeader = req.headers["authorization"] || "";
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  var openclawHeader = req.headers["x-openclaw-token"];
  if (typeof openclawHeader === "string" && openclawHeader) {
    return openclawHeader;
  }
  return "";
}

function webhookAuth(req: Request, res: Response): boolean {
  if (!WEBHOOK_TOKEN) {
    res.status(500).json({ error: "WEBHOOK_TOKEN not configured" });
    return false;
  }

  // Reject query-string tokens (per OpenClaw convention)
  if (req.query.token || req.query.access_token) {
    res.status(400).json({ error: "Query-string tokens are not accepted. Use Authorization header." });
    return false;
  }

  var ip = req.ip || req.socket.remoteAddress || "unknown";
  var retryAfter = checkRateLimit(ip);
  if (retryAfter !== null) {
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({ error: "Too many failed attempts. Retry after " + retryAfter + "s." });
    return false;
  }

  var token = extractToken(req);
  if (!safeTokenEquals(token, WEBHOOK_TOKEN)) {
    recordFailure(ip);
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

// --- Route handlers ---

async function handleWake(req: Request, res: Response): Promise<void> {
  if (!webhookAuth(req, res)) return;

  var text = req.body && req.body.text;
  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "Missing required field: text" });
    return;
  }

  var mode = req.body.mode || "now";
  if (mode !== "now" && mode !== "next-heartbeat") {
    res.status(400).json({ error: "Invalid mode. Must be 'now' or 'next-heartbeat'." });
    return;
  }

  console.log("[webhook] /hooks/wake: " + text.slice(0, 100) + " (mode=" + mode + ")");

  // Fire-and-forget health check — don't block the response on Python API latency
  if (mode === "now") {
    apiGet("/api/health").catch(function (e: any) {
      console.log("[webhook] Wake event: API health check failed: " + (e.message || String(e)));
    });
  }
  res.json({ ok: true, mode: mode, text: text });
}

async function handleAgent(req: Request, res: Response): Promise<void> {
  if (!webhookAuth(req, res)) return;

  var message = req.body && req.body.message;
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Missing required field: message" });
    return;
  }

  var name = req.body.name || "";
  var sessionKey = req.body.sessionKey || "";

  console.log("[webhook] /hooks/agent: " + (name ? name + ": " : "") + message.slice(0, 100));

  // In standalone mode, route to the Python API
  try {
    var result = await apiPost("/api/webhook/agent", {
      message: message,
      name: name,
      sessionKey: sessionKey,
    });
    res.json({ ok: true, result: result });
  } catch (e: any) {
    // If the Python API doesn't have a /webhook/agent endpoint, return accepted
    console.log("[webhook] Agent turn accepted: " + (e.message || String(e)));
    res.json({ ok: true, accepted: true, message: message });
  }
}

// --- Router export ---

export function createWebhookRouter(): Router {
  var router = Router();

  // Periodic cleanup of expired rate-limit entries
  setInterval(function () {
    var now = Date.now();
    for (var ip in failedAttempts) {
      if (now - failedAttempts[ip].firstAt > RATE_WINDOW_MS) {
        delete failedAttempts[ip];
      }
    }
  }, RATE_WINDOW_MS);

  router.post("/hooks/wake", handleWake);
  router.post("/hooks/agent", handleAgent);

  // Reject non-POST methods
  router.all("/hooks/wake", function (_req, res) {
    res.status(405).json({ error: "Method not allowed. Use POST." });
  });
  router.all("/hooks/agent", function (_req, res) {
    res.status(405).json({ error: "Method not allowed. Use POST." });
  });

  return router;
}
