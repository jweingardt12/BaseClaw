import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toolError, apiGet, apiPost } from "../python-client.js";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("toolError", () => {
  it("formats Error instances", () => {
    const result = toolError(new Error("boom"));
    expect(result).toMatchObject({
      content: [{ type: "text", text: "Error: boom" }],
      isError: true,
    });
  });

  it("handles non-Error values", () => {
    const result = toolError("string error");
    expect(result).toMatchObject({
      content: [{ type: "text", text: "Error: string error" }],
      isError: true,
    });
  });
});

describe("apiGet", () => {
  it("calls correct URL and returns parsed JSON", async () => {
    const data = { players: [] };
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify(data), { status: 200 })
    );

    const result = await apiGet("/api/roster");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const calledUrl = vi.mocked(globalThis.fetch).mock.calls[0][0];
    expect(String(calledUrl)).toContain("/api/roster");
    expect(result).toEqual(data);
  });

  it("appends query string params", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    );

    await apiGet("/api/free-agents", { pos_type: "B", limit: "25" });
    const calledUrl = String(vi.mocked(globalThis.fetch).mock.calls[0][0]);
    expect(calledUrl).toContain("pos_type=B");
    expect(calledUrl).toContain("limit=25");
  });

  it("skips empty/undefined param values", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    );

    await apiGet("/api/test", { filled: "yes", empty: "", undef: undefined as unknown as string });
    const calledUrl = String(vi.mocked(globalThis.fetch).mock.calls[0][0]);
    expect(calledUrl).toContain("filled=yes");
    expect(calledUrl).not.toContain("empty");
    expect(calledUrl).not.toContain("undef");
  });

  it("throws on non-ok response with status and body", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response("Not found", { status: 404, statusText: "Not Found" })
    );

    await expect(apiGet("/api/missing")).rejects.toThrow("API 404 Not Found - Not found");
  });
});

describe("apiPost", () => {
  it("sends JSON body and returns parsed JSON", async () => {
    const data = { success: true, message: "Added" };
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify(data), { status: 200 })
    );

    const result = await apiPost("/api/add", { player_id: "123" });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    const [url, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(String(url)).toContain("/api/add");
    expect(opts).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_id: "123" }),
    });
    expect(result).toEqual(data);
  });

  it("throws on non-ok response", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response("Server error", { status: 500, statusText: "Internal Server Error" })
    );

    await expect(apiPost("/api/drop", { player_id: "456" })).rejects.toThrow(
      "API 500 Internal Server Error - Server error"
    );
  });
});
