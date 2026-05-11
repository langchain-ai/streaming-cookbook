import { DEMOS } from "./DemoShell.js";
import { useDemoSelection } from "./DemoSelectionProvider.js";

/**
 * Landing view when no specific demo is selected (?demo= missing or invalid).
 */
export function DemoLandingView() {
  const { setActiveDemo } = useDemoSelection();

  return (
    <div className="demo-content">
      <section className="hero-card demo-landing">
        <div className="eyebrow">Streaming Cookbook</div>
        <div className="hero-copy">
          <h1>React demos</h1>
          <p>Pick an example to open it in place, or use the links below.</p>
        </div>
        <ul className="demo-landing-links">
          {DEMOS.map((demo) => (
            <li key={demo.id}>
              <a
                className="demo-landing-link"
                href={`?demo=${demo.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  setActiveDemo(demo.id);
                }}
              >
                {demo.label}
              </a>
              <span className="demo-landing-desc">{demo.description}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
