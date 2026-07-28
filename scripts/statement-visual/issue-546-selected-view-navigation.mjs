import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;

if (!chromePath) throw new Error("CHROME_BIN is required for issue 546 navigation validation.");
await mkdir(outputDir, { recursive: true });

let browser;
try {
  browser = await launchChrome({ baseUrl, chromePath });
  await setViewport(browser.cdp, 1024, 700);
  await navigate(browser.cdp, `${baseUrl}/login`);

  const loginResult = await evaluate(browser.cdp, loginExpression());
  assert.equal(loginResult.ok, true, `Demo login failed: ${JSON.stringify(loginResult)}`);

  const account = await evaluate(
    browser.cdp,
    `(() => fetch('/api/accounts', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Conta navegação issue 546 ' + Date.now().toString(36),
        kind: 'checking',
        openingBalanceMinor: 0
      })
    }).then(async (response) => ({ status: response.status, body: await response.json() })))()`,
  );
  assert.equal(account.status, 201, JSON.stringify(account));
  const accountId = account.body?.account?.id;
  assert.equal(typeof accountId, "string");

  const month = new Date().toISOString().slice(0, 7);
  await navigate(
    browser.cdp,
    `${baseUrl}/relatorios?view=category-evolution&interval=monthly&start=${month}&periods=1&accountId=${accountId}`,
  );

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evaluate(
      browser.cdp,
      `document.querySelector('[data-report-state]')?.getAttribute('data-report-state') || ''`,
    );
    if (state === "empty" || state === "ready") break;
    if (attempt === 59) throw new Error(`Report did not become ready or empty; state=${state}`);
    await sleep(100);
  }

  const result = await evaluate(
    browser.cdp,
    `(() => {
      const active = document.querySelector('.report-view-tabs a[aria-current="page"]');
      const accountSelect = document.querySelector('select[name="accountId"]');
      const before = window.location.pathname + window.location.search;
      if (!(active instanceof HTMLAnchorElement)) return { ok: false, reason: 'active-link-missing' };
      active.click();
      const after = window.location.pathname + window.location.search;
      return {
        ok: true,
        href: active.getAttribute('href'),
        before,
        after,
        accountId: new URL(window.location.href).searchParams.get('accountId'),
        selectedAccount: accountSelect instanceof HTMLSelectElement ? accountSelect.value : null
      };
    })()`,
  );

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.href, "#", JSON.stringify(result));
  assert.equal(result.after, result.before, JSON.stringify(result));
  assert.equal(result.accountId, accountId, JSON.stringify(result));
  assert.equal(result.selectedAccount, accountId, JSON.stringify(result));

  await writeFile(
    join(outputDir, "issue-546-selected-view-navigation.json"),
    `${JSON.stringify({ accountId, result }, null, 2)}\n`,
  );
  console.log("Issue 546 selected-view navigation preserves accountId.");
} finally {
  if (browser) await browser.close(outputDir);
}
