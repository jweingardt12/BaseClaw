import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/card";
import { fetchViewData, createLiveApp } from "./live-data";
import { createMockApp } from "./mock-app";
import { VIEW_GROUPS, type ViewDef } from "./view-registry";
import { ViewSkeleton } from "../shared/view-skeleton";

import "./preview.css";

const IS_PUBLIC_PREVIEW = Boolean(import.meta.env.VITE_PUBLIC_PREVIEW);

/* ── Error Boundary ─────────────────────────────────────────── */
class ViewErrorBoundary extends React.Component<
  { viewId: string; children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidUpdate(prev: { viewId: string }) {
    if (prev.viewId !== this.props.viewId) this.setState({ error: null });
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
          <div className="text-red-500 text-base font-semibold mb-2">View crashed</div>
          <p className="text-gray-400 text-sm mb-1">{this.state.error.message}</p>
          <pre className="text-xs text-gray-500 bg-gray-900 rounded p-3 max-w-full overflow-x-auto mb-4 text-left">
            {this.state.error.stack}
          </pre>
          <button className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-md text-white" onClick={() => this.setState({ error: null })}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ── Icons (inline SVG, no Plex UI dependency) ──────────────── */
function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/* ── Main App ───────────────────────────────────────────────── */
function PreviewApp() {
  const [activeView, setActiveView] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("view") || "morning-briefing"; } catch { return "morning-briefing"; }
  });
  const [dataSource, setDataSourceRaw] = useState<"mock" | "live">("mock");
  const [liveData, setLiveData] = useState<any>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveApp] = useState(() => createLiveApp());
  const [mockData, setMockData] = useState<Record<string, any> | null>(null);
  const [overlayData, setOverlayData] = useState<any>(null);
  const [darkMode, setDarkMode] = useState(() => {
    try { const v = localStorage.getItem("preview-dark"); return v === null ? true : v === "1"; } catch { return true; }
  });
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("All");
  const [menuOpen, setMenuOpen] = useState(false);
  const [recentViews, setRecentViews] = useState<string[]>(() => {
    try { const raw = localStorage.getItem("preview-recent-views"); const p = raw ? JSON.parse(raw) : []; return Array.isArray(p) ? p.filter((x) => typeof x === "string") : []; } catch { return []; }
  });
  const mockDataRef = useRef<Record<string, any> | null>(null);
  const [mockApp] = useState(() => createMockApp(() => mockDataRef.current));
  const previewSectionRef = useRef<HTMLElement | null>(null);

  const effectiveDataSource = IS_PUBLIC_PREVIEW ? "mock" : dataSource;

  const { allViews, viewById, groupByViewId } = useMemo(() => {
    const all = VIEW_GROUPS.flatMap((g) => g.views);
    const byId = new Map<string, ViewDef>();
    const byGroup = new Map<string, string>();
    for (const group of VIEW_GROUPS) for (const view of group.views) { byId.set(view.id, view); byGroup.set(view.id, group.name); }
    return { allViews: all, viewById: byId, groupByViewId: byGroup };
  }, []);

  const groupNames = useMemo(() => ["All", ...VIEW_GROUPS.map((g) => g.name)], []);

  useEffect(() => { if (!viewById.has(activeView)) setActiveView(allViews[0]?.id || ""); }, [activeView, allViews, viewById]);

  useEffect(() => {
    if (!activeView) return;
    try { const url = new URL(window.location.href); url.searchParams.set("view", activeView); window.history.replaceState({}, "", url.toString()); } catch {}
  }, [activeView]);

  useEffect(() => {
    if (effectiveDataSource !== "mock" || mockData) return;
    import("./mock-data").then((m) => { setMockData(m.MOCK_DATA); mockDataRef.current = m.MOCK_DATA; });
  }, [effectiveDataSource, mockData]);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("dark", darkMode);
    html.setAttribute("data-theme", darkMode ? "dark" : "light");
    html.style.colorScheme = darkMode ? "dark" : "light";
    try { localStorage.setItem("preview-dark", darkMode ? "1" : "0"); localStorage.setItem("preview-recent-views", JSON.stringify(recentViews.slice(0, 25))); } catch {}
  }, [darkMode, recentViews]);

  useEffect(() => {
    if (effectiveDataSource !== "live") return;
    setLiveLoading(true); setLiveError(null); setLiveData(null);
    fetchViewData(activeView).then((d) => { setLiveData(d); setLiveLoading(false); }).catch((e) => { setLiveError(e.message); setLiveLoading(false); });
  }, [activeView, effectiveDataSource]);

  const activeViewDef = viewById.get(activeView);
  const activeGroup = activeViewDef ? groupByViewId.get(activeViewDef.id) : undefined;

  const filteredViews = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allViews.filter((v) => {
      if (groupFilter !== "All" && groupByViewId.get(v.id) !== groupFilter) return false;
      if (!term) return true;
      return [v.label, v.id, v.description || "", groupByViewId.get(v.id) || ""].join(" ").toLowerCase().includes(term);
    }).sort((a, b) => a.label.localeCompare(b.label));
  }, [allViews, groupByViewId, groupFilter, search]);

  const groupedViews = useMemo(() => {
    const buckets = new Map<string, ViewDef[]>();
    for (const g of VIEW_GROUPS) buckets.set(g.name, []);
    for (const v of filteredViews) { const g = groupByViewId.get(v.id) || "Other"; if (!buckets.has(g)) buckets.set(g, []); buckets.get(g)!.push(v); }
    return [...buckets.entries()].filter(([, vs]) => vs.length > 0);
  }, [filteredViews, groupByViewId]);

  const baseData = effectiveDataSource === "live" ? liveData : (mockData ? mockData[activeView] : null);
  const currentData = overlayData || baseData;

  const handleNavigate = useCallback((d: any) => { if (effectiveDataSource === "live") setLiveData(d); else setOverlayData(d); }, [effectiveDataSource]);

  const handleSelectView = useCallback((viewId: string) => {
    setActiveView(viewId);
    setOverlayData(null);
    setMenuOpen(false);
    setRecentViews((prev) => [viewId, ...prev.filter((e) => e !== viewId)].slice(0, 25));
    if (previewSectionRef.current) previewSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="preview-shell min-h-[100dvh]">
      {/* ── Top Bar ── */}
      <header className="preview-header">
        <button className="preview-menu-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
          {menuOpen ? <XIcon /> : <MenuIcon />}
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold truncate">{activeViewDef?.label || "MCP App Showcase"}</h1>
          <p className="text-xs opacity-60 truncate">{activeGroup || "BaseClaw"}</p>
        </div>
        <div className="flex items-center gap-2">
          {!IS_PUBLIC_PREVIEW && (
            <div className="flex items-center gap-1">
              <button className={`preview-tab-btn ${effectiveDataSource === "mock" ? "active" : ""}`} onClick={() => { setDataSourceRaw("mock"); setOverlayData(null); }}>Mock</button>
              <button className={`preview-tab-btn ${effectiveDataSource === "live" ? "active" : ""}`} onClick={() => { setDataSourceRaw("live"); setOverlayData(null); }}>Live</button>
            </div>
          )}
          <button className="preview-icon-btn" onClick={() => setDarkMode(!darkMode)} aria-label="Toggle dark mode">
            {darkMode ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      {/* ── Slide-out Menu ── */}
      {menuOpen && <div className="preview-backdrop" onClick={() => setMenuOpen(false)} />}
      <nav className={`preview-nav ${menuOpen ? "open" : ""}`}>
        <div className="p-3">
          <input
            type="search"
            placeholder="Search tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="preview-search"
          />
        </div>
        <div className="preview-filter-row">
          {groupNames.map((name) => (
            <button
              key={name}
              className={`preview-pill ${groupFilter === name ? "active" : ""}`}
              onClick={() => setGroupFilter(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {groupedViews.map(([group, views]) => (
            <div key={group} className="mb-2">
              <div className="preview-group-label">{group}</div>
              {views.map((view) => (
                <button
                  key={view.id}
                  className={`preview-nav-item ${activeView === view.id ? "active" : ""}`}
                  onClick={() => handleSelectView(view.id)}
                >
                  <span className="font-medium text-sm">{view.label}</span>
                  {view.description && <span className="text-xs opacity-50 line-clamp-1">{view.description}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      </nav>

      {/* ── Main Content ── */}
      <main ref={previewSectionRef} className="preview-main">
        <div className="mcp-preview-canvas">
          {effectiveDataSource === "live" && liveLoading ? (
            <ViewSkeleton />
          ) : effectiveDataSource === "live" && liveError ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <p className="text-red-500 text-sm font-medium">Failed to load live data</p>
              <p className="text-gray-400 text-xs mt-1">{liveError}</p>
            </div>
          ) : effectiveDataSource === "mock" && !mockData ? (
            <ViewSkeleton />
          ) : activeViewDef && currentData ? (
            <ViewErrorBoundary key={activeView} viewId={activeView}>
              <Suspense fallback={<ViewSkeleton />}>
                <ViewRenderer view={activeViewDef} data={currentData} app={effectiveDataSource === "live" ? liveApp : mockApp} navigate={handleNavigate} />
              </Suspense>
            </ViewErrorBoundary>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <p className="text-gray-400 text-sm">No preview data for this tool yet.</p>
              <p className="text-gray-500 text-xs mt-1">{activeViewDef ? activeViewDef.id : "Select a tool."}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ViewRenderer({ view, data, app, navigate }: { view: ViewDef; data: any; app: any; navigate: (d: any) => void }) {
  const Component = view.component;
  const extraProps = { ...(view.props || {}), app, navigate };
  return (
    <div className="mcp-app-root">
      <Component data={data} {...extraProps} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PreviewApp />
  </StrictMode>
);
