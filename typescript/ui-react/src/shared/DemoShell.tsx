import { useState, type ReactNode } from "react";

/**
 * DemoShell
 *
 * Shared layout shell for all streaming cookbook demos. Provides:
 * - Navigation between different demo scenarios
 * - Consistent theming (dark/light mode)
 * - Framework branding
 *
 * This keeps each demo focused on its specific concept while providing
 * a consistent user experience across the cookbook.
 */
export type DemoId = "reconnect" | "branching";

/** Set when no `?demo=` query is present (overview / landing). */
export type ActiveDemo = DemoId | null;

type DemoConfig = {
  id: DemoId;
  label: string;
  description: string;
};

export const DEMOS: DemoConfig[] = [
  {
    id: "reconnect",
    label: "Reconnect & Replay",
    description: "Tab refresh recovery with replay labeling",
  },
  {
    id: "branching",
    label: "Branching",
    description: "Conversation forking via checkpoint commands",
  },
];

type DemoShellProps = {
  /** The currently active demo, or `null` on the overview. */
  activeDemo: ActiveDemo;
  /** Callback when user switches demos */
  onDemoChange: (demo: DemoId) => void;
  /** The demo content to render */
  children: ReactNode;
};

export function DemoShell({ activeDemo, onDemoChange, children }: DemoShellProps) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  return (
    <main className={`chat-shell ${theme === "light" ? "light" : ""}`}>
      {/* Theme Toggle */}
      <button
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        className="theme-toggle"
        onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
        type="button"
      >
        {theme === "dark" ? (
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path className="moon-shape" d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
          </svg>
        )}
      </button>

      {/* Demo Navigator */}
      <nav className="demo-navigator" aria-label="Demo selector">
        <div className="demo-nav-header">
          <div className="framework-logo" aria-label="React logo" role="img">
            <svg viewBox="-11.5 -10.23174 23 20.46348">
              <circle cx="0" cy="0" fill="currentColor" r="2.05" />
              <g fill="none" stroke="currentColor" strokeWidth="1">
                <ellipse rx="11" ry="4.2" />
                <ellipse rx="11" ry="4.2" transform="rotate(60)" />
                <ellipse rx="11" ry="4.2" transform="rotate(120)" />
              </g>
            </svg>
          </div>
          <div className="demo-nav-title">
            <span className="eyebrow">Streaming Cookbook</span>
            <span className="demo-nav-heading">React Demos</span>
          </div>
        </div>

        <div className="demo-nav-items">
          {DEMOS.map((demo) => (
            <button
              key={demo.id}
              className={`demo-nav-item ${demo.id === activeDemo ? "active" : ""}`}
              onClick={() => onDemoChange(demo.id)}
              type="button"
            >
              <span className="demo-nav-label">{demo.label}</span>
              <span className="demo-nav-desc">{demo.description}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Demo Content */}
      {children}
    </main>
  );
}
