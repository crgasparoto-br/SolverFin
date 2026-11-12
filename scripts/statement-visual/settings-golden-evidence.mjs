import { join } from "node:path";

import { evaluate, screenshot } from "./cdp.mjs";

// Supplement real authenticated flows with exact-renderer SSR fixtures for unavailable API states.
export async function captureSettingsGoldenEvidence({
  cdp,
  name,
  section,
  outputDir,
  check,
  pressKey,
  openDialogWithKeyboard,
  waitForDialogClosed,
}) {
  if (!/-(1366|320|mobile)$/.test(name)) return null;

  const evidence = {
    source:
      "authenticated Chrome for forms; production SSR renderer with mocked API for empty/error",
    screenshots: [],
  };

  async function capture(suffix) {
    const filename = "issue-727-" + name + "-" + suffix + ".png";
    await screenshot(cdp, join(outputDir, filename));
    evidence.screenshots.push(filename);
    return filename;
  }

  evidence.newDialog = await capture("new-dialog");

  const createError = await submitWithNetworkFailure(cdp);
  check(
    createError.visible && createError.retryEnabled && createError.valuePreserved,
    name + ": erro de criação não é recuperável ou perde dados",
    createError,
  );
  evidence.createNetworkError = { ...createError, screenshot: await capture("new-network-error") };

  if (section === "rules") {
    const invalid = await showInvalidAmountError(cdp);
    check(
      invalid.rejected && invalid.associated && invalid.valuePreserved,
      name + ": erro decimal do formulário não foi apresentado junto ao campo",
      invalid,
    );
    evidence.invalidAmount = { ...invalid, screenshot: await capture("invalid-amount") };
  }

  await pressKey(cdp, "Escape");
  await waitForDialogClosed(cdp);

  if (section === "profiles") {
    const opener = '[data-open-dialog^="edit-profile-dialog-"]';
    const editKeyboard = await openDialogWithKeyboard(cdp, opener);
    check(
      editKeyboard.openedWithEnter && editKeyboard.closedWithEscape && editKeyboard.focusRestored,
      name + ": modal de edição falhou no fluxo de teclado",
      editKeyboard,
    );
    evidence.editDialog = { ...editKeyboard, screenshot: await capture("edit-dialog") };

    const editError = await submitWithNetworkFailure(cdp);
    check(
      editError.visible && editError.retryEnabled && editError.valuePreserved,
      name + ": erro de edição não é recuperável ou perde dados",
      editError,
    );
    evidence.editNetworkError = { ...editError, screenshot: await capture("edit-network-error") };
    await pressKey(cdp, "Escape");
    await waitForDialogClosed(cdp);
  }

  evidence.ssrStates = [];
  for (const state of ["empty", "error"]) {
    const html = await renderSettingsFixture(section, state);
    const probe = await evaluate(
      cdp,
      "(() => {" +
        "const fixture = new DOMParser().parseFromString(" +
        JSON.stringify(html) +
        ', "text/html");' +
        "const selector = " +
        JSON.stringify('[data-settings-scope="' + section + '"]') +
        ";" +
        "const existing = document.querySelector(selector);" +
        "const replacement = fixture.querySelector(selector);" +
        'if (!existing || !replacement) throw Error("missing settings SSR state section");' +
        "existing.replaceWith(document.importNode(replacement, true));" +
        "const root = document.querySelector(selector);" +
        'return { empty: Boolean(root.querySelector(".empty-state")), error: Boolean(root.querySelector(".load-error[role=alert]")), noOverflow: document.documentElement.scrollWidth <= innerWidth + 1, scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth };' +
        "})()",
    );
    check(
      probe[state] === true && probe.noOverflow === true,
      name + ": estado SSR " + state + " não é responsivo ou está ausente",
      probe,
    );
    evidence.ssrStates.push({
      state,
      source: "renderSettingsPage with simulated API " + state + " (not a live API failure)",
      ...probe,
      screenshot: await capture("ssr-" + state),
    });
  }
  return evidence;
}

async function submitWithNetworkFailure(cdp) {
  return evaluate(
    cdp,
    "(async () => {" +
      'const dialog = document.querySelector("dialog[open]");' +
      'const form = dialog?.querySelector("form[data-api-form]");' +
      'const name = form?.elements.namedItem("name");' +
      "if (!form || !name) return { visible: false, retryEnabled: false, valuePreserved: false };" +
      'const label = "QA Issue 727 - falha de rede recuperável";' +
      "name.value = label;" +
      "const originalFetch = window.fetch;" +
      'window.fetch = async () => { throw new Error("QA simulated network failure"); };' +
      "try {" +
      'const status = form.querySelector("[data-form-status]");' +
      'if (status) { status.textContent = ""; status.className = "form-status muted"; }' +
      "form.requestSubmit();" +
      "for (let i = 0; i < 40; i++) {" +
      'if (form.querySelector("[data-form-status].error")?.textContent.includes("Falha de conexão")) break;' +
      "await new Promise((resolve) => setTimeout(resolve, 25));" +
      "}" +
      'return { visible: Boolean(form.querySelector("[data-form-status].error")?.textContent.includes("Falha de conexão")), retryEnabled: form.querySelector("button[type=submit]")?.disabled === false, valuePreserved: name.value === label, liveRegion: form.querySelector("[data-form-status]")?.getAttribute("aria-live") };' +
      "} finally { window.fetch = originalFetch; }" +
      "})()",
  );
}

async function showInvalidAmountError(cdp) {
  return evaluate(
    cdp,
    "(async () => {" +
      'const form = document.querySelector("#new-automation-rule-dialog form[data-api-form]");' +
      'const amount = form?.elements.namedItem("amountMinMinor");' +
      'const error = document.querySelector("#amount-minor-error");' +
      "if (!form || !amount || !error) return { rejected: false, associated: false, valuePreserved: false };" +
      'amount.value = "10,501";' +
      'amount.dispatchEvent(new Event("input", { bubbles: true }));' +
      "form.requestSubmit();" +
      "await new Promise((resolve) => setTimeout(resolve, 40));" +
      'return { rejected: amount.getAttribute("aria-invalid") === "true" && !error.hidden, associated: amount.getAttribute("aria-describedby") === error.id, valuePreserved: amount.value === "10,501" };' +
      "})()",
  );
}

async function renderSettingsFixture(section, state) {
  const { renderSettingsPage } = await import("../../apps/web/dist/dev-server/settings-page.js");
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = input instanceof Request ? new URL(input.url) : new URL(String(input));
    const path = url.pathname;
    const failed =
      state === "error" &&
      (section === "profiles"
        ? path === "/api/financial-profiles"
        : path === "/api/automation-rules");
    if (failed) {
      return new Response(
        JSON.stringify({ error: { message: "Falha simulada para evidência SSR." } }),
        {
          status: 503,
          headers: { "content-type": "application/json" },
        },
      );
    }
    let payload;
    if (path === "/api/financial-profiles") payload = { activeProfileId: undefined, profiles: [] };
    else if (path === "/api/automation-rules") payload = { rules: [] };
    else if (path === "/api/accounts") payload = { accounts: [] };
    else if (path === "/api/categories") payload = { categories: [] };
    else throw Error("Unexpected SSR fixture API: " + path);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    return await renderSettingsPage(
      "qa-issue-727-fixture",
      new URL("https://solverfin.invalid/configuracoes?section=" + section),
    );
  } finally {
    globalThis.fetch = savedFetch;
  }
}
