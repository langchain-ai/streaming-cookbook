import { BranchingProvider, BranchingView } from "./branching/index.js";
import { ReasoningView } from "./reasoning/index.js";
import { ReconnectProvider, ReconnectView } from "./reconnect/index.js";
import {
  DemoLandingView,
  DemoShell,
  PageBottomAutoScroll,
  useDemoSelection,
} from "./shared/index.js";

/**
 * App
 *
 * Root component that manages which streaming demo is active.
 * Each demo lives in its own directory:
 *
 * - reconnect/    : Reconnect & replay demonstration
 * - branching/    : Branching & conversation forking
 * - reasoning/    : Reasoning token rendering from AIMessage content blocks
 *
 * The DemoShell provides shared navigation and theming.
 * `DemoSelectionProvider` keeps the active demo in sync with the URL (`?demo=`).
 *
 * To add a new demo:
 * 1. Create a new directory under src/
 * 2. Export the demo view from that directory
 * 3. Add the demo to DemoShell's DEMOS array
 * 4. Add a case in the switch below (and an entry in `DEMOS` in DemoShell)
 */
export function App() {
  const { activeDemo, setActiveDemo } = useDemoSelection();

  /**
   * When switching demos, we wrap the new demo in its provider so stream state stays scoped
   * per demo (e.g. reconnect persists thread ids in sessionStorage).
   */
  function renderDemo() {
    switch (activeDemo) {
      case "reconnect":
        return (
          <ReconnectProvider>
            <ReconnectView />
            <PageBottomAutoScroll />
          </ReconnectProvider>
        );
      case "branching":
        return (
          <BranchingProvider>
            <BranchingView />
          </BranchingProvider>
        );
      case "reasoning":
        return (
          <>
            <ReasoningView />
            <PageBottomAutoScroll />
          </>
        );
      default:
        return <DemoLandingView />;
    }
  }

  return (
    <DemoShell activeDemo={activeDemo} onDemoChange={setActiveDemo}>
      {renderDemo()}
    </DemoShell>
  );
}
