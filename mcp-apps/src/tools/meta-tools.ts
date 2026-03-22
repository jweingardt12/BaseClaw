import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { TOOLSETS, PROFILES, TOOL_DESCRIPTIONS, resolveToolset, shouldRegister as _shouldRegister } from "../toolsets.js";

// Full registry of all tool metadata (name, description, category)
export const TOOL_REGISTRY: Map<string, {
  name: string;
  description: string;
  category: string;
}> = new Map();

// Populate registry from toolset definitions with category info
for (var _cat of Object.keys(TOOLSETS)) {
  for (var _tool of TOOLSETS[_cat]) {
    if (!TOOL_REGISTRY.has(_tool)) {
      TOOL_REGISTRY.set(_tool, {
        name: _tool,
        description: TOOL_DESCRIPTIONS[_tool] || _tool.replace(/_/g, " ").replace(/^(yahoo|fantasy|mlb) /, ""),
        category: _cat,
      });
    }
  }
}

// After all register*Tools calls, update TOOL_REGISTRY with real descriptions
// from the MCP server's internal tool storage (replaces name-derived placeholders).
export function populateRegistryFromServer(server: McpServer) {
  var tools = (server as any)._registeredTools || {};
  for (var [name, tool] of Object.entries(tools)) {
    var entry = TOOL_REGISTRY.get(name);
    if (entry && (tool as any).description) {
      entry.description = (tool as any).description;
    }
  }
}

export function registerMetaTools(server: McpServer, enabledTools?: Set<string>) {
  // 1. Discover available capabilities
  registerAppTool(
    server,
    "discover_capabilities",
    {
      description:
        "Use this to find which tools handle a specific task. " +
        "Lists available tool categories and their tools. " +
        "Call with no arguments to see all categories, or with a category name to see tools in that category. " +
        "Use get_tool_details for full parameter schema of a specific tool.",
      inputSchema: {
        category: z.string().optional().describe(
          "Optional category to filter: core, lineup, waivers, trades, strategy, " +
          "workflows, intel, prospects, draft, mlb, history, admin"
        ),
      },
      annotations: { readOnlyHint: true },
      _meta: {},
    },
    async ({ category }) => {
      if (category && TOOLSETS[category]) {
        var tools = TOOLSETS[category].map(function (name) {
          var meta = TOOL_REGISTRY.get(name);
          var loaded = _shouldRegister(enabledTools, name);
          return "  " + name + (loaded ? "" : " [not loaded]") + ": " + (meta ? meta.description : "(no description)");
        });
        return {
          content: [{
            type: "text" as const,
            text: "Tools in \"" + category + "\" (" + tools.length + "):\n" + tools.join("\n"),
          }],
        };
      }

      // List all categories with counts
      var lines = Object.entries(TOOLSETS).map(function ([cat, catTools]) {
        return "  " + cat + " (" + catTools.length + " tools): " + catTools.slice(0, 3).join(", ") + "...";
      });
      return {
        content: [{
          type: "text" as const,
          text: "Available tool categories:\n" + lines.join("\n") + "\n\n" +
            "Profiles: " + Object.keys(PROFILES).join(", ") + "\n\n" +
            "Use discover_capabilities(category=\"name\") for tool details in a category.",
        }],
      };
    },
  );

  // 2. Get detailed schema for a specific tool
  registerAppTool(
    server,
    "get_tool_details",
    {
      description:
        "Use this to get the full description and parameter info for a specific tool by name. " +
        "Call this before trying to use a tool that isn't in your current toolset. " +
        "Use discover_capabilities to browse available tools first.",
      inputSchema: {
        tool_name: z.string().describe("Exact tool name, e.g. 'yahoo_statcast_history'"),
      },
      annotations: { readOnlyHint: true },
      _meta: {},
    },
    async ({ tool_name }) => {
      var meta = TOOL_REGISTRY.get(tool_name);
      if (!meta) {
        return {
          content: [{
            type: "text" as const,
            text: "Tool \"" + tool_name + "\" not found. Use discover_capabilities to browse available tools.",
          }],
        };
      }

      var isLoaded = _shouldRegister(enabledTools, tool_name);

      var text = "Tool: " + meta.name + "\n" +
        "Category: " + meta.category + "\n" +
        "Status: " + (isLoaded ? "loaded (available in current session)" : "not loaded") + "\n" +
        "Description: " + meta.description;

      if (!isLoaded) {
        text += "\n\nThis tool is in the '" + meta.category + "' toolset. " +
          "To enable it, set MCP_TOOLSET to include '" + meta.category + "' " +
          "(e.g., MCP_TOOLSET=" + meta.category + " or MCP_TOOLSET=default," + meta.category + ")";
      }

      return {
        content: [{ type: "text" as const, text: text }],
      };
    },
  );
}
