import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/preact";
import { afterEach, vi } from "vitest";
import { h } from "preact";

afterEach(() => {
  cleanup();
});

// Mock @plexui/ui components — Plex UI uses extensionless ESM imports
// that Node cannot resolve in the test environment. Components are
// stubbed as thin pass-through wrappers so tests can render views that
// import them.
function stub(displayName: string) {
  return function StubComponent(props: any) {
    return h("div", { "data-testid": "plex-" + displayName, ...props }, props.children);
  };
}

function stubButton(props: any) {
  return h("button", { "data-testid": "plex-button", ...props }, props.children);
}

function stubInput(props: any) {
  return h("input", { "data-testid": "plex-input", ...props });
}

vi.mock("@plexui/ui/components/Badge", () => ({ Badge: stub("badge") }));
vi.mock("@plexui/ui/components/Button", () => ({
  Button: stubButton,
  ButtonLink: stub("button-link"),
}));
vi.mock("@plexui/ui/components/Input", () => ({ Input: stubInput }));
vi.mock("@plexui/ui/components/Avatar", () => ({ Avatar: stub("avatar") }));
vi.mock("@plexui/ui/components/Skeleton", () => ({ Skeleton: stub("skeleton") }));
vi.mock("@plexui/ui/components/Tabs", () => ({ Tabs: stub("tabs") }));
vi.mock("@plexui/ui/components/Table", () => ({
  Table: stub("table"),
  TableHeader: stub("thead"),
  TableBody: stub("tbody"),
  TableRow: stub("tr"),
  TableHead: stub("th"),
  TableCell: stub("td"),
  TableCaption: stub("caption"),
  TableFooter: stub("tfoot"),
}));
vi.mock("@plexui/ui/components/Menu", () => ({
  Menu: Object.assign(stub("menu"), {
    Trigger: stub("menu-trigger"),
    Content: stub("menu-content"),
    Item: stub("menu-item"),
    Separator: stub("menu-separator"),
  }),
}));
vi.mock("@plexui/ui/components/Dialog", () => ({
  Dialog: Object.assign(stub("dialog"), {
    Trigger: stub("dialog-trigger"),
    Content: stub("dialog-content"),
    Header: stub("dialog-header"),
    Footer: stub("dialog-footer"),
    Title: stub("dialog-title"),
    Description: stub("dialog-description"),
    Close: stub("dialog-close"),
  }),
}));
vi.mock("@plexui/ui/components/Alert", () => ({ Alert: stub("alert") }));
vi.mock("@plexui/ui/components/Textarea", () => ({ Textarea: stub("textarea") }));
vi.mock("@plexui/ui/components/Select", () => ({ Select: stub("select") }));
vi.mock("@plexui/ui/components/Checkbox", () => ({ Checkbox: stub("checkbox") }));
vi.mock("@plexui/ui/components/Tooltip", () => ({ Tooltip: stub("tooltip") }));
vi.mock("@plexui/ui/components/StatCard", () => ({ StatCard: stub("stat-card") }));
vi.mock("@plexui/ui/components/EmptyMessage", () => ({
  EmptyMessage: Object.assign(stub("empty-message"), {
    Icon: stub("empty-message-icon"),
    Title: stub("empty-message-title"),
    Description: stub("empty-message-description"),
    ActionRow: stub("empty-message-action-row"),
  }),
}));
vi.mock("@plexui/ui/components/Indicator", () => ({
  LoadingIndicator: stub("loading-indicator"),
  LoadingDots: stub("loading-dots"),
  CircularProgress: stub("circular-progress"),
}));
