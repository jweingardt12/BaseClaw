# MCP App Connectivity & Completeness

## Problem

Only 7 of 130+ tools produce visual UI (structuredContent). Views exist for 80+ tool types but most tools return plain text only, making those views unreachable. The 7 visual tools that work feel disconnected — no cross-links, no "what's next" after actions, and back navigation disappears at the first level.

## Scope

1. Wire structuredContent for 4 critical tools (waiver-analyze, streaming, trade-eval, injury-report)
2. Fix navigation flow between all visual views

## Part 1: Wire 4 Tools

### Pattern

Each tool handler in `mcp-apps/src/tools/` already returns `content: [{ type: "text", text: ... }]`. Add `structuredContent` alongside it (not replacing it) so Claude gets the text AND the user gets the visual.

```typescript
return {
  content: [{ type: "text", text: textSummary }],
  structuredContent: { type: "view-name", ...data },
};
```

### Tools to Wire

**1. `yahoo_waiver_analyze`** (season-tools.ts)
- Currently: returns text table of waiver targets
- Add: `structuredContent: { type: "waiver-analyze", ...data }`
- View: `season-app/waiver-analyze-view.tsx` (already built, already has ContextChips + PhaseBar)

**2. `yahoo_streaming`** (season-tools.ts)
- Currently: returns text table of streaming pitchers
- Add: `structuredContent: { type: "streaming", ...data }`
- View: `season-app/streaming-view.tsx` (already built)

**3. `yahoo_trade_eval`** (season-tools.ts)
- Currently: returns text trade analysis
- Add: `structuredContent: { type: "trade-eval", ...data }`
- View: `season-app/trade-eval-view.tsx` (already built, has acceptance_likelihood + rival warning)

**4. `yahoo_injury_report`** (season-tools.ts)
- Currently: returns text injury list
- Add: `structuredContent: { type: "injury-report", ...data }`
- View: `season-app/injury-report-view.tsx` (already built)

### Verification per tool

1. Call tool via Claude.ai
2. Confirm text summary appears in conversation
3. Confirm visual UI renders inline
4. Confirm player names are tappable
5. Confirm back button works when navigating from another view

## Part 2: Fix Navigation Flow

### 2A: Action Completion — "What's Next"

After any roster action (add/drop/swap) completes, the `ActionView` shows a success message. Add contextual "next" buttons based on where the user came from:

**File:** `roster-app/action-view.tsx`

- Always show "Back to Roster" (already exists)
- Add "Run Waiver Analysis" button (calls `yahoo_waiver_analyze`)
- Add "Check Lineup" button (calls `yahoo_lineup_optimize`)

### 2B: Cross-View Navigation Links

Add "related tool" buttons to views where a natural next action exists:

| View | Add Link To | Trigger |
|------|-------------|---------|
| injury-report | "Find Replacements" → `yahoo_waiver_analyze` | When injured_active > 0 |
| waiver-analyze | "Check Category Impact" → `yahoo_category_check` | Always |
| streaming | "Check Category Impact" → `yahoo_category_check` | Always |
| trade-eval | "Build Another Trade" → `yahoo_trade_builder` | Always |
| matchup-detail | "Plan Strategy" → `yahoo_matchup_strategy` | Always |
| standings | "Season Pace" → `yahoo_season_pace` | Always |

Implementation: Use `useCallTool(app)` hook + `navigate(result.structuredContent)` pattern already established in other views.

### 2C: WorkflowSummaryView — Replace with Real Views

The `WorkflowSummaryView` is a generic placeholder catching 10 workflow tool types. These workflow tools return aggregate data that ALREADY has sub-objects matching real views.

Instead of a generic dump, parse the workflow response and route to the appropriate real view. For example, `league-landscape` returns `{ standings, pace, ... }` — route to a composite view that shows standings + pace together.

**Priority:** Low — these are agent-initiated workflows, not user-initiated. Skip for now.

## Files to Modify

| File | Change |
|------|--------|
| `src/tools/season-tools.ts` | Add structuredContent to waiver-analyze, streaming, trade-eval, injury-report handlers |
| `ui/roster-app/action-view.tsx` | Add "What's Next" buttons |
| `ui/season-app/injury-report-view.tsx` | Add "Find Replacements" cross-link |
| `ui/season-app/waiver-analyze-view.tsx` | Add "Check Category Impact" link |
| `ui/season-app/streaming-view.tsx` | Add "Check Category Impact" link |
| `ui/season-app/trade-eval-view.tsx` | Add "Build Another Trade" link |

## Out of Scope

- Wiring structuredContent for all 130 tools (clutters chat)
- Visual UI for simple lookups (search, who-owns, info)
- Visual UI for action confirmations (add/drop/swap)
- WorkflowSummaryView decomposition
- New views for tools that don't have views yet

## Success Criteria

1. The 4 newly-wired tools show visual UI when called on Claude.ai
2. Player names tappable in all visual views → player report → back works
3. After completing an action, user has clear "what's next" options
4. Injury report links to waiver analysis
5. No dead-end views in the critical path (roster → waiver → add → next)
