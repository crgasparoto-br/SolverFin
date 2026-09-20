import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const route = process.env.STATEMENT_VISUAL_ROUTE ?? "";
const compatPort = Number(process.env.SOLVERFIN_SSR_COMPAT_PORT ?? 5191);
const compatUrl = "http://127.0.0.1:" + compatPort;
const config = {
  "/admin/instituicoes": ["admin-instituicoes", "adminInstitutions", "admin-maintenance", "master", "operational", ".admin-institution-list"],
  "/admin/indices-financeiros": ["admin-indices-financeiros", "adminFinancialIndexes", "admin-operations", "master", "operational", ".operation-grid"],
  "/remuneracao-contas": ["remuneracao-contas", "accountRemuneration", "legacy-compatibility", "financial-profile", "legacy-renderer", ".configuration-list", true],
}[route];
if (!chromePath) throw new Error("CHROME_BIN is required for issue #615 visual validation.");
if (!config) throw new Error("Unsupported issue #615 route: " + route);
if (!Number.isInteger(compatPort) || compatPort <= 0) throw new Error("Invalid compatibility port.");
const [slug, foundationId, archetype, audience, operationalMode, readySelector, compatibility] = config;
const failures = [];
let browser;
let compat;
let desktop;
let mobile;
let browserVersion = "unknown";
await mkdir(outputDir, { recursive: true });
try {
  if (compatibility) compat = await startCompat();
  browser = await launchChrome({ baseUrl, chromePath });
  browserVersion = browser.version;
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, baseUrl + "/login");
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, "Demo login failed: " + login.status);
  desktop = await verify(browser.cdp, 1366, 768, "desktop");
  mobile = await verify(browser.cdp, 390, 844, "mobile");
} catch (error) {
  failures.push({ message: "Issue #615 route validation crashed", error: serialize(error) });
} finally {
  if (browser) await browser.close(outputDir);
  if (compat) await stopCompat(compat);
}
const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browserVersion,
  route,
  expectedFoundation: foundationId,
  expectedArchetype: archetype,
  expectedAudience: audience,
  expectedOperationalMode: operationalMode,
  failures,
  desktop,
  mobile,
};
await writeFile(join(outputDir, "issue-615-secondary-" + slug + ".json"), JSON.stringify(report, null, 2) + "\n");
if (failures.length) {
  for (const failure of failures) console.error("- " + failure.message + ": " + (failure.error?.message ?? ""));
  process.exitCode = 1;
} else {
  console.log("Issue #615 secondary-route visual validation passed for " + route + ".");
}

async function verify(cdp, width, height, label) {
  await setViewport(cdp, width, height);
  await navigate(cdp, (compatibility ? compatUrl : baseUrl) + route);
  await waitReady(cdp);
  const measurements = await evaluate(cdp, measurementExpression());
  const keyboard = await tabIntoPage(cdp);
  const image = "issue-615-" + slug + "-" + label + "-" + width + "x" + height + ".png";
  await screenshot(cdp, join(outputDir, image));
  check(measurements.pathname === route, label + ": unexpected redirect", measurements);
  check(measurements.pageContainer, label + ": PageContainer missing", measurements);
  check(measurements.pageHeader, label + ": PageHeader missing", measurements);
  check(measurements.headingVisible, label + ": heading not visible", measurements);
  check(measurements.noHorizontalOverflow, label + ": horizontal overflow", measurements);
  check(measurements.unnamedInteractiveCount === 0, label + ": unnamed controls", measurements);
  check(measurements.foundation.id === foundationId, label + ": foundation mismatch", measurements);
  check(measurements.foundation.archetype === archetype, label + ": archetype mismatch", measurements);
  check(measurements.foundation.audience === audience, label + ": audience mismatch", measurements);
  check(measurements.foundation.operationalMode === operationalMode, label + ": mode mismatch", measurements);
  check(measurements.routeSpecific.ready, label + ": route content missing", measurements);
  check(!measurements.routeSpecific.restricted, label + ": permission denial rendered", measurements);
  check(keyboard.focusedInsidePage && keyboard.focusedVisible, label + ": keyboard focus proof failed", keyboard);
  if (route === "/admin/instituicoes") {
    check(measurements.routeSpecific.summaryCards >= 4, label + ": summary incomplete", measurements);
    check(measurements.routeSpecific.filterControls >= 8, label + ": filters incomplete", measurements);
  }
  if (route === "/admin/indices-financeiros") {
    check(measurements.routeSpecific.summaryCards >= 4, label + ": summary incomplete", measurements);
    check(measurements.routeSpecific.operationCards === 2, label + ": operations incomplete", measurements);
  }
  if (route === "/remuneracao-contas") {
    check(measurements.routeSpecific.infoAlert, label + ": explanation missing", measurements);
    check(measurements.routeSpecific.port === String(compatPort), label + ": compatibility server not used", measurements);
  }
  return { viewport: { width, height }, measurements, keyboard, screenshot: image };
}

async function waitReady(cdp) {
  const selector = '[data-secondary-route-foundation="' + foundationId + '"] ' + readySelector;
  for (let i = 0; i < 60; i += 1) {
    const ready = await evaluate(cdp, "Boolean(document.querySelector(" + JSON.stringify(selector) + "))").catch(() => false);
    if (ready) return;
    await sleep(100);
  }
  throw new Error("Timed out waiting for " + route + " to render " + readySelector);
}

function measurementExpression() {
  return "(() => {" +
    "const root=document.querySelector(" + JSON.stringify('[data-secondary-route-foundation="' + foundationId + '"]') + ");" +
    "if(!root)throw new Error('foundation root missing');" +
    "const visible=(e)=>{if(!e)return false;const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};" +
    "const name=(e)=>{const a=e.getAttribute('aria-label');if(a&&a.trim())return a.trim();const ids=e.getAttribute('aria-labelledby');if(ids){const t=ids.split(/\\s+/).map(id=>document.getElementById(id)?.textContent?.trim()||'').filter(Boolean).join(' ');if(t)return t}const ls=e.labels?Array.from(e.labels).map(l=>l.textContent?.trim()||'').filter(Boolean).join(' '):'';if(ls)return ls;return e.textContent?.trim()||e.getAttribute('title')||e.getAttribute('placeholder')||e.getAttribute('name')||''};" +
    "const interactive=Array.from(root.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex=\"-1\"])')).filter(visible);" +
    "const unnamed=interactive.filter(e=>!name(e));const d=document.documentElement;" +
    "return {pathname:location.pathname,pageContainer:Boolean(root.closest('.sf-page-container')),pageHeader:Boolean(root.querySelector('.sf-page-header')),headingVisible:visible(root.querySelector('.sf-page-header-title')),noHorizontalOverflow:d.scrollWidth<=d.clientWidth+1,unnamedInteractiveCount:unnamed.length,foundation:{id:root.getAttribute('data-secondary-route-foundation')||'',archetype:root.getAttribute('data-route-archetype')||'',audience:root.getAttribute('data-route-audience')||'',operationalMode:root.getAttribute('data-operational-mode')||''},routeSpecific:{ready:Boolean(root.querySelector(" + JSON.stringify(readySelector) + ")),restricted:Boolean(root.querySelector('[data-state=\"permission\"]')),summaryCards:root.querySelectorAll('.sf-metric-card').length,filterControls:root.querySelectorAll('.filters-grid input,.filters-grid select,.filters-grid button').length,operationCards:root.querySelectorAll('.operation-card').length,infoAlert:Boolean(root.querySelector('.sf-alert')),port:location.port}}})()";
}

async function tabIntoPage(cdp) {
  await evaluate(cdp, "document.activeElement?.blur(); true");
  for (let i = 1; i <= 80; i += 1) {
    await pressTab(cdp);
    const state = await evaluate(cdp, "(()=>{const root=document.querySelector(" + JSON.stringify('[data-secondary-route-foundation="' + foundationId + '"]') + "),a=document.activeElement;if(!root||!a)return{inside:false,visible:false};const r=a.getBoundingClientRect(),s=getComputedStyle(a);return{inside:root.contains(a),visible:s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0&&r.bottom>=0&&r.top<=innerHeight}})()");
    if (state.inside) return { steps: i, focusedInsidePage: true, focusedVisible: state.visible };
  }
  return { steps: 80, focusedInsidePage: false, focusedVisible: false };
}
async function pressTab(cdp) {
  const p = { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 };
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...p });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...p });
  await sleep(40);
}
async function startCompat() {
  const child = spawn(process.execPath, ["apps/web/dist/dev-server.js"], { env: { ...process.env, HOST: "127.0.0.1", PORT: String(compatPort), SOLVERFIN_SSR_STYLE_CONTRACT_VALIDATION: "1" }, stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", chunk => { stderr = (stderr + String(chunk)).slice(-4000); });
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error("Compatibility server exited: " + stderr.slice(-800));
    try { const response = await fetch(compatUrl + "/health"); if (response.ok) return child; } catch {}
    await sleep(100);
  }
  child.kill("SIGTERM");
  throw new Error("Compatibility server did not become healthy.");
}
async function stopCompat(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once("exit", resolve));
  child.kill("SIGTERM");
  await Promise.race([exited, sleep(2000)]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}
function check(condition, message, details) { if (!condition) failures.push({ message, details }); }
function serialize(error) { return error instanceof Error ? { name: error.name, message: error.message, stack: error.stack ?? "" } : { name: "UnknownError", message: String(error), stack: "" }; }
