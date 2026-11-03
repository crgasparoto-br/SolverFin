import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { renderAdminInstitutionsPage } from "../../apps/web/dist/dev-server/admin-institutions-page.js";
import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
if (!chromePath) throw new Error("CHROME_BIN required");
await mkdir(outputDir, { recursive: true });
const report = {
  commit: process.env.STATEMENT_VISUAL_CANDIDATE_SHA ?? process.env.GITHUB_SHA ?? "local",
  provenance:
    "Chrome, real SSR renderer with controlled API responses; live authenticated no-JS GET",
  viewports: [],
  failures: [],
};
let browser;
try {
  const fixtures = {
    empty: await renderFixture({
      institutions: [],
      summary: { total: 0, active: 0, withLogo: 0, usingFallback: 0, updatedAt: null },
    }),
    forbidden: await renderFixture({ error: { message: "Permissão master necessária." } }, 403),
    error: await renderFixture({ error: { message: "Falha temporária simulada." } }, 503),
  };
  browser = await launchChrome({ baseUrl, chromePath });
  report.browser = browser.version;
  await navigate(browser.cdp, baseUrl + "/login");
  assert.equal((await evaluate(browser.cdp, loginExpression())).ok, true);
  for (const [width, height, label] of [
    [1366, 768, "desktop"],
    [390, 844, "mobile"],
    [320, 740, "compact-mobile"],
  ]) {
    await setViewport(browser.cdp, width, height);
    const states = {};
    for (const state of ["empty", "forbidden", "error"]) {
      await navigate(browser.cdp, "about:blank");
      const tree = await browser.cdp.send("Page.getFrameTree");
      await browser.cdp.send("Page.setDocumentContent", {
        frameId: tree.frameTree.frame.id,
        html: fixtures[state],
      });
      await sleep(200);
      const observed = await evaluate(
        browser.cdp,
        "(() => {" +
          "const root = document.querySelector('.admin-institutions-page');" +
          "return { empty: root?.querySelector('.empty-state')?.textContent?.includes('Nenhuma instituição cadastrada')," +
          "denied: Boolean(root?.querySelector('[data-state=permission]'))," +
          "message: root?.textContent ?? '', list: Boolean(root?.querySelector('.list-panel'))," +
          "actions: root?.querySelectorAll('[data-admin-refresh],[data-logo-upload-form]').length ?? 0," +
          "overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };})()",
      );
      assert.equal(observed.overflow, false, label + ": " + state + " overflow");
      if (state === "empty") {
        assert.equal(observed.empty, true);
        assert.equal(observed.list, true);
        assert.equal(observed.actions, 1);
      } else {
        assert.equal(observed.denied, true);
        assert.equal(observed.list, false);
        assert.equal(observed.actions, 0);
        assert.equal(
          observed.message.includes(
            state === "forbidden" ? "Permissão master necessária" : "Falha temporária simulada",
          ),
          true,
        );
      }
      const file = "issue-728-" + state + "-" + width + "x" + height + ".png";
      await screenshot(browser.cdp, join(outputDir, file));
      states[state] = { screenshot: file, observed };
    }
    await browser.cdp.send("Emulation.setScriptExecutionDisabled", { value: true });
    try {
      await navigate(
        browser.cdp,
        baseUrl +
          "/admin/instituicoes?q=before728&logoStatus=fallback&sort=bankCode&order=desc&pageSize=10",
      );
      const before = await evaluate(
        browser.cdp,
        "(() => { const d = document.querySelector('.admin-advanced-filters');" +
          "const chip = document.querySelector('.active-filter-chip');" +
          "return { collapsed: !d?.open, active: Boolean(chip?.getClientRects().length)," +
          "sort: document.querySelector('[name=sort]')?.value, path: location.pathname," +
          "overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };})()",
      );
      assert.deepEqual(before, {
        collapsed: true,
        active: true,
        sort: "bankCode",
        path: "/admin/instituicoes",
        overflow: false,
      });
      await evaluate(
        browser.cdp,
        "document.querySelector('.admin-advanced-filters summary').focus(); true",
      );
      await pressEnter(browser.cdp);
      assert.equal(
        await evaluate(browser.cdp, "document.querySelector('.admin-advanced-filters').open"),
        true,
      );
      await pressEnter(browser.cdp);
      assert.equal(
        await evaluate(browser.cdp, "document.querySelector('.admin-advanced-filters').open"),
        false,
      );
      const controls = await evaluate(
        browser.cdp,
        "(() => {" +
          "const d = document.querySelector('.admin-advanced-filters'), chip = document.querySelector('.active-filter-chip');" +
          "const list = document.querySelector('.active-filter-list'), valid = () => !d.open && Boolean(chip.getClientRects().length);" +
          "const positive = valid(); d.open = true; const exposedFails = !valid(); d.open = false;" +
          "list.style.display = 'none'; const hiddenFails = !valid(); list.style.removeProperty('display');" +
          "return { positive, exposedFails, hiddenFails, restored: valid() };})()",
      );
      assert.deepEqual(controls, {
        positive: true,
        exposedFails: true,
        hiddenFails: true,
        restored: true,
      });
      await evaluate(
        browser.cdp,
        "document.querySelector('[name=q]').focus(); document.querySelector('[name=q]').select(); true",
      );
      await browser.cdp.send("Input.insertText", { text: "after728" });
      await evaluate(
        browser.cdp,
        "document.querySelector('.admin-filter-form button[type=submit]').focus(); true",
      );
      await pressEnter(browser.cdp);
      let search;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        search = await evaluate(browser.cdp, "location.search").catch(() => "");
        if (search.includes("after728")) break;
        await sleep(100);
      }
      const params = new URLSearchParams(search);
      for (const [key, value] of Object.entries({
        q: "after728",
        logoStatus: "fallback",
        sort: "bankCode",
        order: "desc",
        pageSize: "10",
      })) {
        assert.equal(params.get(key), value, label + ": no-JS GET lost " + key);
      }
      assert.equal(
        await evaluate(
          browser.cdp,
          "Boolean(document.querySelector('.active-filter-chip')?.getClientRects().length)",
        ),
        true,
      );
      const file = "issue-728-no-js-" + width + "x" + height + ".png";
      await screenshot(browser.cdp, join(outputDir, file));
      states.noJavaScript = {
        screenshot: file,
        before,
        controls,
        query: Object.fromEntries(params),
      };
    } finally {
      await browser.cdp.send("Emulation.setScriptExecutionDisabled", { value: false });
    }
    report.viewports.push({ width, height, states });
  }
} catch (error) {
  report.failures.push({ message: String(error), stack: error?.stack });
} finally {
  if (browser) await browser.close(outputDir);
}
await writeFile(
  join(outputDir, "issue-728-admin-states.json"),
  JSON.stringify(report, null, 2) + "\n",
);
if (report.failures.length) {
  console.error(report.failures[0].message);
  process.exitCode = 1;
} else {
  console.log(
    "Issue #728 empty, permission/error, and no-JavaScript browser states passed for three viewports.",
  );
}

async function renderFixture(body, status = 200) {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  try {
    return await renderAdminInstitutionsPage(
      "fixture-token",
      new URL(baseUrl + "/admin/instituicoes"),
    );
  } finally {
    globalThis.fetch = original;
  }
}

async function pressEnter(cdp) {
  const keys = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...keys });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...keys });
  await sleep(60);
}
