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

import { DEMOS, type ActiveDemo, type DemoId } from "./DemoShell.js";

const DEMO_SEARCH_PARAM = "demo";

function readDemoFromLocation(): ActiveDemo {
  const raw = new URLSearchParams(window.location.search).get(DEMO_SEARCH_PARAM);
  const match = DEMOS.find((demo) => demo.id === raw);
  return match?.id ?? null;
}

type DemoSelectionContextValue = {
  activeDemo: ActiveDemo;
  setActiveDemo: (demo: ActiveDemo) => void;
};

const DemoSelectionContext = createContext<DemoSelectionContextValue | null>(null);

type DemoSelectionProviderProps = {
  children: ReactNode;
};

export function DemoSelectionProvider({ children }: DemoSelectionProviderProps) {
  const [activeDemo, setActiveDemoState] = useState<DemoId | null>(() => readDemoFromLocation());
  const activeDemoRef = useRef(activeDemo);
  activeDemoRef.current = activeDemo;

  useEffect(() => {
    function onPopState() {
      setActiveDemoState(readDemoFromLocation());
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const setActiveDemo = useCallback((demo: ActiveDemo) => {
    if (activeDemoRef.current === demo) return;
    const url = new URL(window.location.href);
    if (demo === null) {
      url.searchParams.delete(DEMO_SEARCH_PARAM);
    } else {
      url.searchParams.set(DEMO_SEARCH_PARAM, demo);
    }
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
