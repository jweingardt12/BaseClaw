import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react";
import { fetchViewData, createLiveApp } from "./live-data";
import { createMockApp } from "./mock-app";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VIEW_GROUPS, type ViewDef } from "./view-registry";

import "./preview.css";

// Error boundary to catch view crashes
class ViewErrorBoundary extends React.Component<
  { viewId: string; children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { viewId: string }) {
    if (prev.viewId !== this.props.viewId) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
          <div className="text-destructive text-base font-semibold mb-2">View crashed</div>
          <p className="text-muted-foreground text-sm mb-1">{this.state.error.message}</p>
          <pre className="text-xs text-muted-foreground bg-muted rounded p-3 max-w-full overflow-x-auto mb-4 text-left">
            {this.state.error.stack}
          </pre>
          <Button size="sm" onClick={() => this.setState({ error: null })}>
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mb-3" />
      <p className="text-muted-foreground text-sm">Loading view...</p>
    </div>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

function DataSourceToggle({ dataSource, setDataSource, className }: {
  dataSource: "mock" | "live";
  setDataSource: (v: "mock" | "live") => void;
  className?: string;
}) {
  return (
    <div className={"pv-toggle-wrap" + (className ? " " + className : "")}>
      <button
        onClick={() => setDataSource("mock")}
        className="pv-toggle-btn"
        data-active={dataSource === "mock"}
      >
        Mock
      </button>
      <button
        onClick={() => setDataSource("live")}
        className="pv-toggle-btn"
        data-active={dataSource === "live"}
      >
        {dataSource === "live" && <span className="pv-live-dot" />}
        Live
      </button>
    </div>
  );
}

function DarkModeToggle({ darkMode, setDarkMode }: { darkMode: boolean; setDarkMode: (v: boolean) => void }) {
  return (
    <button
      onClick={() => setDarkMode(!darkMode)}
      title={darkMode ? "Light mode" : "Dark mode"}
      className="pv-dark-toggle"
    >
      {darkMode ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function PreviewApp() {
  const [activeView, setActiveView] = useState("matchup-detail");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dataSource, setDataSourceRaw] = useState<"mock" | "live">("mock");
  const setDataSource = useCallback((v: "mock" | "live") => {
    setDataSourceRaw(v);
    setOverlayData(null);
  }, []);
  const [liveData, setLiveData] = useState<any>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveApp] = useState(() => createLiveApp());
  const [mockData, setMockData] = useState<Record<string, any> | null>(null);
  const [overlayData, setOverlayData] = useState<any>(null);
  const mockDataRef = useRef<Record<string, any> | null>(null);
  const [mockApp] = useState(() => createMockApp(function () { return mockDataRef.current; }));
  const [darkMode, setDarkMode] = useState(() => {
    try { var v = localStorage.getItem("preview-dark"); return v === null ? true : v === "1"; } catch { return true; }
  });
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    const activeGroupName = VIEW_GROUPS.find(g => g.views.some(v => v.id === "matchup-detail"));
    const collapsed = new Set<string>();
    for (const g of VIEW_GROUPS) {
      if (g.name !== (activeGroupName ? activeGroupName.name : "")) {
        collapsed.add(g.name);
      }
    }
    return collapsed;
  });

  const activeItemRef = useRef<HTMLButtonElement>(null);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);

  // Scroll active sidebar item into view on mount
  useEffect(() => {
    if (activeItemRef.current && sidebarScrollRef.current) {
      activeItemRef.current.scrollIntoView({ block: "center", behavior: "auto" });
    }
  }, []);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (sidebarOpen && window.innerWidth < 640) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [sidebarOpen]);

  // Lazy-load mock data
  useEffect(() => {
    if (dataSource === "mock" && !mockData) {
      import("./mock-data").then(m => { setMockData(m.MOCK_DATA); mockDataRef.current = m.MOCK_DATA; });
    }
  }, [dataSource, mockData]);

  // Apply dark mode class and color-scheme to <html>
  useEffect(() => {
    const html = document.documentElement;
    if (darkMode) {
      html.classList.add("dark");
      html.style.colorScheme = "dark";
    } else {
      html.classList.remove("dark");
      html.style.colorScheme = "light";
    }
    try { localStorage.setItem("preview-dark", darkMode ? "1" : "0"); } catch {}
  }, [darkMode]);

  useEffect(() => {
    if (dataSource !== "live") return;
    setLiveLoading(true);
    setLiveError(null);
    setLiveData(null);
    fetchViewData(activeView)
      .then((d) => { setLiveData(d); setLiveLoading(false); })
      .catch((e) => { setLiveError(e.message); setLiveLoading(false); });
  }, [activeView, dataSource]);

  // Memoize derived values
  const { allViews, view, activeGroup } = useMemo(() => {
    const all = VIEW_GROUPS.flatMap((g) => g.views);
    return {
      allViews: all,
      view: all.find((v) => v.id === activeView),
      activeGroup: VIEW_GROUPS.find((g) => g.views.some((v) => v.id === activeView)),
    };
  }, [activeView]);

  const baseData = dataSource === "live" ? liveData : (mockData ? mockData[activeView] : null);
  const currentData = overlayData || baseData;
  const handleNavigate = useCallback((newData: any) => {
    if (dataSource === "live") {
      setLiveData(newData);
    } else {
      setOverlayData(newData);
    }
  }, [dataSource]);

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  const handleSelectView = (viewId: string) => {
    setActiveView(viewId);
    setOverlayData(null);
    setSidebarOpen(false);
    const group = VIEW_GROUPS.find(g => g.views.some(v => v.id === viewId));
    if (group && collapsedGroups.has(group.name)) {
      setCollapsedGroups(prev => {
        const next = new Set(prev);
        next.delete(group.name);
        return next;
      });
    }
  };

  return (
    <div className="preview-shell flex h-[100dvh] -m-3 overflow-hidden text-foreground" style={{ fontSize: "1rem", background: "var(--pv-bg-deep)" }}>
      {/* Mobile top bar */}
      <div
        className="pv-mobile-bar sm:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between gap-2 px-3 py-2"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            className="pv-dark-toggle shrink-0"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <span className="text-base leading-none">{sidebarOpen ? "\u2715" : "\u2630"}</span>
          </button>
          <div className="min-w-0">
            <p className="pv-header-kicker">{activeGroup ? activeGroup.name : "Preview"}</p>
            <p className="pv-brand-name">{view ? view.label : "Select a view"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <DataSourceToggle dataSource={dataSource} setDataSource={setDataSource} className="hidden min-[420px]:inline-flex" />
          <DarkModeToggle darkMode={darkMode} setDarkMode={setDarkMode} />
        </div>
      </div>

      {/* Mobile sidebar overlay backdrop */}
      {sidebarOpen && (
        <div
          className="pv-overlay-backdrop sm:hidden fixed inset-0 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <nav
        className={
          "pv-sidebar w-72 max-w-[86vw] flex-shrink-0 flex flex-col z-50 "
          + "sm:relative sm:block sm:h-full "
          + (sidebarOpen
            ? "fixed top-0 left-0 bottom-0"
            : "hidden sm:flex")
        }
        style={sidebarOpen ? { paddingTop: "env(safe-area-inset-top)" } : undefined}
      >
        {/* Sidebar branding */}
        <div className="pv-brand flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <button
                className="pv-dark-toggle sm:hidden shrink-0"
                onClick={() => setSidebarOpen(false)}
              >
                <span className="text-base leading-none">{"\u2715"}</span>
              </button>
              <div>
                <div className="pv-brand-name">BaseClaw</div>
                <div className="pv-brand-sub">Fantasy Baseball</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <DarkModeToggle darkMode={darkMode} setDarkMode={setDarkMode} />
            </div>
          </div>
          <div className="mt-2.5">
            <DataSourceToggle dataSource={dataSource} setDataSource={setDataSource} className="w-full" />
          </div>
        </div>

        {/* Scrollable groups */}
        <div
          ref={sidebarScrollRef}
          className="flex-1 overflow-y-auto overscroll-contain p-2 pb-4"
          style={{ WebkitOverflowScrolling: "touch" } as any}
        >
          {VIEW_GROUPS.map((group) => {
            const isCollapsed = collapsedGroups.has(group.name);
            const isActiveGroup = activeGroup && activeGroup.name === group.name;
            return (
              <div key={group.name} className="mb-1">
                <button
                  onClick={() => toggleGroup(group.name)}
                  className="pv-group-header"
                  data-active={isActiveGroup ? "true" : "false"}
                >
                  <span>{group.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="pv-group-count">
                      {group.views.length}
                    </span>
                    <span className="pv-chevron" data-open={!isCollapsed ? "true" : "false"}>
                      {"\u25B6"}
                    </span>
                  </div>
                </button>
                {!isCollapsed && (
                  <div className="pv-view-list mt-0.5 ml-1">
                    {group.views.map((v) => (
                      <button
                        key={v.id}
                        ref={activeView === v.id ? activeItemRef : undefined}
                        onClick={() => handleSelectView(v.id)}
                        className="pv-view-item"
                        data-active={activeView === v.id ? "true" : "false"}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Main content */}
      <main
        className="pv-content-area flex-1 min-w-0 overflow-y-auto overscroll-contain h-full pt-[env(safe-area-inset-top)]"
        style={{ WebkitOverflowScrolling: "touch" } as any}
      >
        <div className="p-4 sm:p-6 lg:p-8 pt-14 sm:pt-6 lg:pt-8">
          <div style={{ maxWidth: "920px", margin: "0 auto" }}>
            {/* Content header */}
            <div className="pv-header">
              <div className="min-w-0">
                <p className="pv-header-kicker">{activeGroup ? activeGroup.name : "Preview"}</p>
                <h2 className="pv-header-title">{view ? view.label : "Select a view"}</h2>
              </div>
            </div>

            {dataSource === "live" && liveLoading ? (
              <LoadingSpinner />
            ) : dataSource === "live" && liveError ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8 px-4 text-center">
                  <p className="text-destructive text-sm font-medium">Failed to load live data</p>
                  <p className="text-muted-foreground text-xs mt-1">{liveError}</p>
                </CardContent>
              </Card>
            ) : dataSource === "mock" && !mockData ? (
              <LoadingSpinner />
            ) : view && currentData ? (
              <ViewErrorBoundary key={activeView} viewId={activeView}>
                <Suspense fallback={<LoadingSpinner />}>
                  <ViewRenderer view={view} data={currentData} app={dataSource === "live" ? liveApp : mockApp} navigate={handleNavigate} />
                </Suspense>
              </ViewErrorBoundary>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8 px-4 text-center">
                  <p className="text-muted-foreground text-sm">
                    {dataSource === "live" ? "No API mapping for this view." : "No mock data for this view yet."}
                  </p>
                  <p className="text-muted-foreground text-xs mt-1">
                    {view ? "View: " + view.id : "Select a view from the sidebar."}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
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

import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
createRoot(document.getElementById("root")!).render(<StrictMode><PreviewApp /></StrictMode>);
