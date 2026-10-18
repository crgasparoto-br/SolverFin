import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];

if (!chromePath) throw new Error("CHROME_BIN is required for categories visual validation.");
await mkdir(outputDir, { recursive: true });
let desktop;
let desktopModal;
let mobile;
let mobileModal;
let compactMobile;
let browserVersion = "unknown";
const completedScreenshots = [];

await runViewportSession("desktop", 1440, 1000, async (cdp) => {
  desktop = await validateDesktop(cdp);
  completedScreenshots.push("categories-desktop.png");
  desktopModal = await validateDesktopModal(cdp);
  completedScreenshots.push("categories-modal-desktop.png");
});

await runViewportSession("mobile", 390, 844, async (cdp) => {
  mobile = await validateMobile(cdp);
  completedScreenshots.push("categories-mobile.png");
  mobileModal = await validateMobileModal(cdp);
  completedScreenshots.push("categories-modal-mobile.png");
});

await runViewportSession("compact-mobile", 320, 740, async (cdp) => {
  compactMobile = await validateCompactMobile(cdp);
  completedScreenshots.push("categories-compact-mobile.png");
});

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browserVersion,
  failures,
  desktop,
  desktopModal,
  mobile,
  mobileModal,
  compactMobile,
  screenshots: completedScreenshots,
};

await writeFile(
  join(outputDir, "categories-interface.json"),
  `${JSON.stringify(report, null, 2)}
`,
);
await writeFile(join(outputDir, "CATEGORIES-INTERFACE.md"), renderReport(report));

if (failures.length > 0) {
  for (const...[truncated]