import { createContext, useContext, useCallback, useMemo } from "react";

interface AppContextValue {
  /** The MCP app instance for calling tools */
  app: any;
  /** Navigate to a new view by passing structuredContent data */
  navigate: (data: any) => void;
  /** Go back to the previous view (null if no history) */
  goBack: (() => void) | null;
  /** Call an MCP tool by name — returns the raw result. Use useCallTool() for loading/error state. */
  callTool: (name: string, args?: Record<string, any>) => Promise<any>;
}

var AppContext = createContext<AppContextValue | null>(null);

/**
 * Hook to access the MCP app context from any view component.
 * Replaces the `{ app, navigate }` prop drilling pattern.
 *
 * For tool calls with loading/error state, combine with useCallTool:
 *   var { app } = useAppContext();
 *   var { callTool, loading } = useCallTool(app);
 *
 * For simple navigation or raw tool calls:
 *   var { navigate, callTool } = useAppContext();
 */
export function useAppContext(): AppContextValue {
  var ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useAppContext must be used within an AppContextProvider");
  }
  return ctx;
}

/**
 * Safe version that returns null outside AppContextProvider.
 * Use this in shared components (like PlayerName) that may render
 * in contexts without a provider.
 */
export function useAppContextSafe(): AppContextValue | null {
  return useContext(AppContext);
}

interface AppContextProviderProps {
  app: any;
  navigate: (data: any) => void;
  goBack: (() => void) | null;
  children: React.ReactNode;
}

export function AppContextProvider({ app, navigate, goBack, children }: AppContextProviderProps) {
  var callTool = useCallback(async function (name: string, args?: Record<string, any>) {
    if (!app) return null;
    return app.callServerTool({ name, arguments: args || {} });
  }, [app]);

  var value = useMemo(function () {
    return { app, navigate, goBack, callTool };
  }, [app, navigate, goBack, callTool]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}
