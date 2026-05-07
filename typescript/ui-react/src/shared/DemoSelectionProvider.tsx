import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { DemoId } from "./DemoShell.js";

const DEMO_SEARCH_PARAM = "demo";

function readDemoFromLocation(): DemoId {
  const raw = new URLSearchParams(window.location.search).get(DEMO_SEARCH_PARAM);
  if (raw === "reconnect" || raw === "branching") return raw;
  return "reconnect";
}

type DemoSelectionContextValue = {
  activeDemo: DemoId;
  setActiveDemo: (demo: DemoId) => void;
};

const DemoSelectionContext = createContext<DemoSelectionContextValue | null>(null);

type DemoSelectionProviderProps = {
  children: ReactNode;
};

export function DemoSelectionProvider({ children }: DemoSelectionProviderProps) {
  const [activeDemo, setActiveDemoState] = useState<DemoId>(() => readDemoFromLocation());
  const activeDemoRef = useRef(activeDemo);
  activeDemoRef.current = activeDemo;

  useEffect(() => {
    function onPopState() {
      setActiveDemoState(readDemoFromLocation());
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const setActiveDemo = useCallback((demo: DemoId) => {
    if (activeDemoRef.current === demo) return;
    const url = new URL(window.location.href);
    url.searchParams.set(DEMO_SEARCH_PARAM, demo);
    window.history.pushState(null, "", url);
    setActiveDemoState(demo);
  }, []);

  const value = useMemo(
    () => ({ activeDemo, setActiveDemo }),
    [activeDemo, setActiveDemo],
  );

  return <DemoSelectionContext.Provider value={value}>{children}</DemoSelectionContext.Provider>;
}

export function useDemoSelection(): DemoSelectionContextValue {
  const ctx = useContext(DemoSelectionContext);
  if (!ctx) {
    throw new Error("useDemoSelection must be used within DemoSelectionProvider");
  }
  return ctx;
}
