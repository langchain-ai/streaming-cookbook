import { BranchingProvider, BranchingView } from "./branching/index.js";
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
 * Each demo lives in its own directory with its provider and view:
 *
 * - reconnect/    : Reconnect & replay demonstration
 * - branching/    : Branching & conversation forking
 *
 * The DemoShell provides shared navigation and theming.
 * `DemoSelectionProvider` keeps the active demo in sync with the URL (`?demo=`).
 *
 * To add a new demo:
 * 1. Create a new directory under src/
 * 2. Export a Provider and View from that directory
 * 3. Add the demo to DemoShell's DEMOS array
 * 4. Add a case in the switch below (and an entry in `DEMOS` in DemoShell)
 */
export function App() {
  const { activeDemo, setActiveDemo } = useDemoSelection();

  /**
   * When switching demos, we wrap the new demo in its provider.
   * Each provider manages its own sessionStorage state, so demos
   * don't interfere with each other.
   */
  function renderDemo() {
    switch (activeDemo) {
      case "reconnect":
        return (
          <ReconnectProvider key="reconnect">
            <ReconnectView />
            <PageBottomAutoScroll />
          </ReconnectProvider>
        );
      case "branching":
        return (
          <BranchingProvider key="branching">
            <BranchingView />
          </BranchingProvider>
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
