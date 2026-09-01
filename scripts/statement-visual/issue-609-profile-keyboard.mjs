import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;

if (!chromePath)
  throw new Error("CHROME_BIN is required for Issue 609 profile/keyboard validation.");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
const scenarios = [];

try {
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  const fixture = await evaluate(
    browser.cdp,
    `(async () => {
      async function request(path, method = "GET", body) {
        const response = await fetch(path, {
          method,
          headers: body === undefined ? undefined : { "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(method + " " + path + " failed: " + JSON.stringify(payload));
        return payload;
      }
      const suffix = Date.now().toString(36);
      const first = (await request("/api/accounts", "POST", {
        name: "QA Issue 609 - Conta teclado A " + suffix,
        kind: "checking",
        openingBalanceMinor: 10000,
        currency: "BRL"
      })).account;
      const second = (await request("/api/accounts", "POST", {
        name: "QA Issue 609 - Conta teclado B " + suffix,
        kind: "checking",
        openingBalanceMinor: 20000,
        currency: "BRL"
      })).account;
      const profiles = await request("/api/financial-profiles");
      const activeProfile = profiles.profiles.find((item) => item.id === profiles.activeProfileId);
      return { firstAccountId: first.id, secondAccountId: second.id, activeProfileName: activeProfile?.name || "" };
    })()`,
  );
  assert.ok(fixture.activeProfileName, "Active financial profile fixture was not resolved.");

  await validateViewport(1366, 768, fixture);
  await validateViewport(390, 844, fixture);
} finally {
  await browser.close(outputDir);
}

await writeFile(
  join(outputDir, "issue-609-profile-keyboard.json"),
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      commit: process.env.GITHUB_SHA ?? "local",
      browser: browser.version,
      scenarios,
    },
    null,
    2,
  )}\n`,
);
console.log("Issue 609 profile and account-picker keyboard validation passed.");

async function validateViewport(width, height, fixture) {
  await setViewport(browser.cdp, width, height);
  const route = `/lancamentos?accountId=${encodeURIComponent(fixture.firstAccountId)}&month=2026-07`;
  await navigate(browser.cdp, `${baseUrl}${route}`);

  const profile = await waitForProfileContext(fixture.activeProfileName);
  assert.equal(profile.text, `Perfil: ${fixture.activeProfileName}`);
  assert.equal(profile.visible, true, `Profile context is not visible at ${width}px.`);

  const pickerReady = await evaluate(
    browser.cdp,
    `(() => {
      const trigger = document.querySelector('[data-account-trigger]');
      const options = Array.from(document.querySelectorAll('[data-account-option]'));
      const selected = options.find((option) => option.getAttribute('aria-selected') === 'true');
      trigger.focus();
      return {
        focused: document.activeElement === trigger,
        optionCount: options.length,
        selectedId: selected?.dataset.accountOption || null
      };
    })()`,
  );
  assert.equal(pickerReady.focused, true, "Account picker trigger did not receive focus.");
  assert.ok(pickerReady.optionCount >= 2, "Account picker fixture has fewer than two options.");
  assert.equal(pickerReady.selectedId, fixture.firstAccountId);

  await key("ArrowDown", 40);
  await sleep(80);
  const focusedOption = await evaluate(
    browser.cdp,
    `(() => {
      const active = document.activeElement;
      const menu = document.querySelector('[data-account-menu]');
      return {
        accountId: active?.dataset?.accountOption || null,
        role: active?.getAttribute?.('role') || null,
        menuOpen: menu ? !menu.hidden : false,
        outlineWidth: active ? getComputedStyle(active).outlineWidth : "0px"
      };
    })()`,
  );
  assert.equal(
    focusedOption.role,
    "option",
    "ArrowDown did not move focus into the account listbox.",
  );
  assert.equal(focusedOption.menuOpen, true, "Account listbox did not open from the keyboard.");
  assert.ok(focusedOption.accountId, "Focused account option has no account identifier.");
  assert.notEqual(
    focusedOption.accountId,
    fixture.firstAccountId,
    "Keyboard focus did not leave the selected account.",
  );

  const expectedAccountId = focusedOption.accountId;
  await key("Enter", 13);
  await waitForAccountNavigation(expectedAccountId);

  const selectedState = await evaluate(
    browser.cdp,
    `(() => {
      const url = new URL(location.href);
      const selected = document.querySelector('[data-account-option][aria-selected="true"]');
      return {
        accountId: url.searchParams.get('accountId'),
        selectedId: selected?.dataset.accountOption || null,
        context: document.querySelector('.statement-context-copy strong')?.textContent || ""
      };
    })()`,
  );
  assert.equal(
    selectedState.accountId,
    expectedAccountId,
    "Enter did not navigate to the focused account.",
  );
  assert.equal(
    selectedState.selectedId,
    expectedAccountId,
    "Selected account state did not follow keyboard navigation.",
  );
  assert.ok(
    selectedState.context.length > 0,
    "Account context disappeared after keyboard selection.",
  );

  const filename = `issue-609-profile-keyboard-${width}x${height}.png`;
  await screenshot(browser.cdp, join(outputDir, filename));
  scenarios.push({
    route,
    viewport: `${width}x${height}`,
    profile,
    pickerReady,
    focusedOption,
    selectedState,
    screenshot: filename,
  });
}

async function waitForProfileContext(expectedName) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const state = await evaluate(
      browser.cdp,
      `(() => {
        const node = document.querySelector('[data-profile-context]');
        if (!node) return { text: "", visible: false };
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
          text: node.textContent.trim(),
          visible: rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none"
        };
      })()`,
    );
    if (state.text === `Perfil: ${expectedName}`) return state;
    await sleep(100);
  }
  return evaluate(
    browser.cdp,
    `(() => {
      const node = document.querySelector('[data-profile-context]');
      return { text: node?.textContent?.trim() || "", visible: Boolean(node) };
    })()`,
  );
}

async function waitForAccountNavigation(expectedAccountId) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const accountId = await evaluate(
      browser.cdp,
      `new URL(location.href).searchParams.get('accountId')`,
    );
    if (accountId === expectedAccountId) {
      await sleep(180);
      return;
    }
    await sleep(100);
  }
  assert.fail(`Timed out waiting for keyboard account navigation to ${expectedAccountId}.`);
}

async function key(keyValue, keyCode) {
  await browser.cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: keyValue,
    code: keyValue,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
  await browser.cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: keyValue,
    code: keyValue,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
}
