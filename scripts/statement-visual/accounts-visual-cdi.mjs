import process from "node:process";
import assert from "node:assert/strict";
import { evaluate, navigate, sleep } from "./cdp.mjs";
import { accountVisualState as state } from "./accounts-visual-state.mjs";
const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const waitForDetail = (...args) => state.waitForDetail(...args);
const waitFor = (...args) => state.waitFor(...args);

export async function validateCdiSettings(cdp) {
  const href = await evaluate(
    cdp,
    `(() => {
    const item = document.querySelector('[data-resource-master-item][data-kind="account"][data-currency="BRL"][data-status="active"]');
    const link = item?.querySelector('a.resource-master-link');
    return link ? new URL(link.href).pathname + new URL(link.href).search : null;
  })()`,
  );
  assert.ok(href, "Missing eligible account for CDI settings.");
  await navigate(cdp, `${baseUrl}${href}`);
  await waitForDetail(cdp, "account");
  const setup = await evaluate(
    cdp,
    `(() => {
    const trigger = document.querySelector('[data-resource-detail="account"] [data-sf-dialog-open^="account-cdi-dialog-"]');
    if (!trigger || trigger.disabled) return null;
    const accountId = trigger.closest('[data-resource-detail]')?.dataset.resourceKey?.slice(8);
    const originalFetch = window.fetch;
    window.__issue716SettingsFetch = originalFetch;
    window.__issue716SettingsProof = { calls: [], firstFails: true };
    window.fetch = async (url, options = {}) => {
      const path = String(url);
      if (path === '/api/account-remuneration/configurations' && !options.method) {
        return { ok: true, json: async () => ({
          configurations: [{ accountId, accountCurrency: 'BRL', indexKind: 'cdi', enabled: true }]
        }) };
      }
      if (path === '/api/account-remuneration/configurations/' + encodeURIComponent(accountId) && options.method === 'PUT') {
        window.__issue716SettingsProof.calls.push(JSON.parse(options.body));
        if (window.__issue716SettingsProof.firstFails) {
          window.__issue716SettingsProof.firstFails = false;
          return { ok: false, json: async () => ({ error: { message: 'Falha configurações CDI simulada' } }) };
        }
        return { ok: true, json: async () => ({ operation: { message: 'Configuração CDI salva' } }) };
      }
      return originalFetch(url, options);
    };
    trigger.focus();
    trigger.click();
    return { label: trigger.getAttribute('aria-label'), title: trigger.title };
  })()`,
  );
  assert.ok(
    setup?.label?.includes("Configurar remuneração CDI"),
    "Settings icon missing accessible name.",
  );
  await waitFor(
    cdp,
    `Boolean(document.querySelector('dialog.master-dialog[open] [data-cdi-configuration-form]'))`,
    "Settings dialog did not open.",
  );
  await evaluate(
    cdp,
    `(() => {
    const form = document.querySelector('[data-cdi-configuration-form]');
    form.querySelector('[name="remunerationPercent"]').value = '88.5';
    form.querySelector('[name="startsOn"]').value = '2026-10-14';
    form.requestSubmit();
  })()`,
  );
  await waitFor(
    cdp,
    `document.querySelector('[data-cdi-form-status]')?.textContent?.includes('Falha configurações CDI simulada')`,
    "Settings API error was not visible.",
  );
  const failed = await evaluate(
    cdp,
    `(() => {
    const form = document.querySelector('[data-cdi-configuration-form]');
    return {
      modalOpen: form.closest('dialog')?.open,
      percent: form.querySelector('[name="remunerationPercent"]').value,
      date: form.querySelector('[name="startsOn"]').value,
      retryAllowed: !form.querySelector('[type="submit"]').disabled,
    };
  })()`,
  );
  assert.deepEqual(failed, {
    modalOpen: true,
    percent: "88.5",
    date: "2026-10-14",
    retryAllowed: true,
  });
  await evaluate(cdp, "document.querySelector('[data-cdi-configuration-form]')?.requestSubmit()");
  await waitFor(
    cdp,
    `document.querySelector('[data-cdi-form-status]')?.textContent?.includes('Configuração CDI salva')`,
    "Settings successful PUT was not visible.",
  );
  const success = await evaluate(cdp, "window.__issue716SettingsProof.calls");
  assert.equal(success.length, 2);
  assert.equal(success[1].enabled, true, "Editing settings must not disable active CDI.");
  assert.equal(success[1].remunerationPercent, 88.5);
  assert.equal(success[1].startsOn, "2026-10-14");
  await sleep(450);
  return { failed, success, accessibleLabel: setup.label };
}

/**
 * Exercises the real API, session scope and database via the browser. The existing
 * mocked scenarios remain responsible for deterministic cancel/error/retry cases.
 */
export async function validateCdiRealPersistence(cdp) {
  const created = await evaluate(
    cdp,
    `(async () => {
      const result = await fetch("/api/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "QA CDI real " + Date.now().toString(36),
          kind: "checking",
          currency: "BRL",
          openingBalanceMinor: 0,
        }),
      });
      return { status: result.status, body: await result.json() };
    })()`,
  );
  assert.equal(created.status, 201, "A real CDI test account must be created.");
  const accountId = created.body.account?.id;
  assert.ok(accountId, "The real account API did not return an id.");
  const href = `/contas-cartoes?resource=${encodeURIComponent(`account:${accountId}`)}`;
  const persisted = {
    accountId,
    activated: false,
    deactivated: false,
    cleanupStatus: null,
  };
  try {
    await navigate(cdp, `${baseUrl}${href}`);
    await waitForDetail(cdp, "account");
    const initial = await evaluate(
      cdp,
      `document.querySelector('[data-cdi-toggle]')?.getAttribute('aria-checked')`,
    );
    assert.equal(initial, "false", "A newly created account must not start with CDI active.");

    async function toggleAndVerify(enabled) {
      await evaluate(cdp, `document.querySelector('[data-cdi-toggle]')?.click()`);
      await waitFor(
        cdp,
        `Boolean(document.querySelector('#accounts-cards-confirm-dialog[open]'))`,
        "Real CDI confirmation did not open.",
      );
      await evaluate(cdp, `document.querySelector('[data-confirm-accept]')?.click()`);
      await waitFor(
        cdp,
        `document.querySelector('[data-cdi-toggle]')?.getAttribute('aria-checked') === ${JSON.stringify(String(enabled))}`,
        "The CDI switch did not reflect the successful real API update.",
      );
      await navigate(cdp, `${baseUrl}${href}`);
      await waitForDetail(cdp, "account");
      const current = await evaluate(
        cdp,
        `(async () => {
          const response = await fetch("/api/account-remuneration/configurations");
          const body = await response.json();
          return {
            status: response.status,
            entry: body.configurations?.find((entry) => entry.accountId === ${JSON.stringify(accountId)}),
            switchState: document.querySelector('[data-cdi-toggle]')?.getAttribute('aria-checked'),
            masterState: document.querySelector('[data-resource-master-item][data-kind="account"].is-selected')?.getAttribute('data-cdi-state'),
          };
        })()`,
      );
      assert.equal(current.status, 200, "The authenticated API must permit reading CDI.");
      assert.equal(
        current.entry?.enabled,
        enabled,
        "CDI must persist across a new HTTP GET and page load.",
      );
      assert.equal(
        current.switchState,
        String(enabled),
        "The server-rendered switch must match the persisted CDI state.",
      );
      assert.equal(
        current.masterState,
        enabled ? "active" : "inactive",
        "The master list must use persisted CDI state.",
      );
    }
    await toggleAndVerify(true);
    persisted.activated = true;
    await toggleAndVerify(false);
    persisted.deactivated = true;
  } finally {
    // Isolated CI fixture; do not leave an active remuneration on a test account.
    const cleanup = await evaluate(
      cdp,
      `(async () => {
        const response = await fetch("/api/accounts/" + encodeURIComponent(${JSON.stringify(accountId)}), { method: "DELETE" });
        return { status: response.status };
      })()`,
    ).catch(() => null);
    persisted.cleanupStatus = cleanup?.status ?? null;
  }
  return persisted;
}
