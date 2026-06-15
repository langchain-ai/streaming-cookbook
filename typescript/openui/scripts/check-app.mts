/**
 * Browser verification harness.
 *
 * Drives the running app (vite on :5173, LangGraph on :2024) with headless
 * Chromium: kicks off a full-dashboard run, screenshots the grid mid-stream
 * and after completion, and reports panel statuses plus any console errors.
 *
 * Usage (both dev servers must be running):
 *   pnpm exec tsx scripts/check-app.mts
 */
import { chromium } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:5173";
const RUN_TIMEOUT_MS = 240_000;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

const consoleErrors: string[] = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

await page.goto(APP_URL, { waitUntil: "networkidle" });
console.log("page loaded:", await page.title());

await page.getByRole("button", { name: "Full dashboard" }).click();
await page.getByRole("button", { name: "Generate dashboard" }).click();
const t0 = Date.now();
console.log("run started");

// Wait for panels to appear, then catch them mid-stream.
await page.waitForSelector(".panel", { timeout: 60_000 });
console.log(`first panel at ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// Mid-stream snapshot: as soon as any panel shows OpenUI content.
await page.waitForSelector(".panel-body", { timeout: 120_000 });
await page.waitForTimeout(2_500);
const midPanels = await page.locator(".panel").count();
const midStreaming = await page.locator(".panel.is-running").count();
await page.screenshot({ path: "/tmp/dash-mid.png", fullPage: true });
console.log(
  `mid-stream at ${((Date.now() - t0) / 1000).toFixed(1)}s: ${midPanels} panels, ${midStreaming} running — /tmp/dash-mid.png`
);

// Wait for the run to finish (Generate button returns), then let panel
// statuses settle — the last status flip can trail the run end slightly.
await page
  .getByRole("button", { name: "Generate dashboard", exact: true })
  .waitFor({ timeout: RUN_TIMEOUT_MS });
await page
  .waitForFunction(() => document.querySelectorAll(".panel.is-running").length === 0, {
    timeout: 15_000,
  })
  .catch(() => console.log("warning: some panels never left running state"));
await page.waitForTimeout(1_000);
const finalPanels = await page.locator(".panel").count();
const complete = await page.locator(".panel.is-complete").count();
const errored = await page.locator(".panel.is-error").count();
const summary = await page.locator(".summary").textContent().catch(() => null);
await page.screenshot({ path: "/tmp/dash-final.png", fullPage: true });
console.log(
  `final at ${((Date.now() - t0) / 1000).toFixed(1)}s: ${finalPanels} panels — ${complete} complete, ${errored} error — /tmp/dash-final.png`
);
console.log("coordinator summary:", JSON.stringify(summary));

// Per-panel detail: source tag + rendered element count.
for (const panel of await page.locator(".panel").all()) {
  const source = await panel.locator(".panel-source").textContent();
  const status = await panel.locator(".panel-badge").getAttribute("data-status");
  const nodes = await panel.locator(".panel-body *").count();
  console.log(`  panel ${JSON.stringify(source)} status=${status} domNodes=${nodes}`);
}

console.log(
  consoleErrors.length === 0
    ? "console errors: none"
    : `console errors (${consoleErrors.length}):\n  ${consoleErrors
        .slice(0, 10)
        .map((text) => text.replace(/\s+/g, " ").slice(0, 200))
        .join("\n  ")}`
);

await browser.close();
// The OpenUI kit's foldable section nests a button inside a button and
// React logs it as an error — known kit quirk, not an app failure.
const KNOWN_KIT_WARNING = /cannot be a descendant of|cannot contain a nested/;
const realErrors = consoleErrors.filter((text) => !KNOWN_KIT_WARNING.test(text));
process.exit(realErrors.length === 0 && errored === 0 && finalPanels >= 4 ? 0 : 1);
