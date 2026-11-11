import assert from "node:assert/strict";
import { evaluate, navigate, sleep } from "./cdp.mjs";

/** Advanced A3 interaction probes, evaluated within the shared authenticated browser. */
export function createAccountsCardsAdvancedProbes({ baseUrl, waitFor, waitForDetail }) {
  async function validateGoldenActionToolbar(cdp, resourceKind) {
    const snapshot = await evaluate(
      cdp,
      `(() => {
        const detail = document.querySelector('[data-resource-detail]');
        const actions = detail?.querySelector('.resource-detail-actions');
        const toolbar = actions?.querySelector('.resource-action-toolbar');
        if (!actions || !toolbar) return null;
        const bounds = (node) => {
          const box = node.getBoundingClientRect();
          return { x: box.x, right: box.right, width: box.width, height: box.height };
        };
        const buttons = Array.from(actions.querySelectorAll('button.resource-action-button'));
        const instrumentButtons = Array.from(detail.querySelectorAll('.instrument-actions button.resource-action-button'));
        const instrumentStylesConsistent = instrumentButtons.every((button) => {
          const box = button.getBoundingClientRect();
          const svg = button.querySelector('svg')?.getBoundingClientRect();
          const panel = detail.getBoundingClientRect();
          return box.width >= 43 && box.height >= 43 &&
            Math.abs(box.width - box.height) <= 1 &&
            Boolean(button.title && button.getAttribute('aria-label')) &&
            Boolean(svg && svg.width >= 16 && svg.width <= 21 && svg.height >= 16 && svg.height <= 21) &&
            box.left >= panel.left - 1 && box.right <= panel.right + 1;
        });
        return {
          instrumentActionCount: instrumentButtons.length,
          instrumentStylesConsistent,
          kinds: {
            card: Boolean(detail?.getAttribute('data-resource-detail') === 'card'),
            cdi: Boolean(actions.querySelector('.resource-account-cdi-row')),
          },
          buttonCount: buttons.length,
          allNamed: buttons.every((button) => Boolean(button.title && button.getAttribute('aria-label'))),
          allGoldenSize: buttons.every((button) => {
            const box = button.getBoundingClientRect();
            return box.width >= 43 && box.height >= 43 && Math.abs(box.width - box.height) <= 1;
          }),
          allGoldenGlyphs: buttons.every((button) => {
            const svg = button.querySelector('svg');
            if (!svg) return false;
            const box = svg.getBoundingClientRect();
            return box.width >= 16 && box.width <= 21 && box.height >= 16 && box.height <= 21;
          }),
          allWithinDetail: buttons.every((button) => {
            const box = button.getBoundingClientRect();
            const panel = detail.getBoundingClientRect();
            return box.left >= panel.left - 1 && box.right <= panel.right + 1;
          }),
          cdiSwitch: (() => {
            const el = actions.querySelector('[data-cdi-toggle]');
            if (!el) return null;
            const box = el.getBoundingClientRect();
            return { width: box.width, height: box.height, role: el.getAttribute('role') };
          })(),
          toolbar: bounds(toolbar),
          actions: bounds(actions),
          noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        };
      })()`,
    );
    assert.ok(snapshot, "Golden Screen maintenance toolbar is missing.");
    assert.equal(snapshot.buttonCount, 4);
    assert.equal(
      snapshot.allNamed,
      true,
      "Subscreen icon controls need accessible names and tooltips.",
    );
    assert.equal(snapshot.allGoldenSize, true, "Golden Screen controls must have 44x44px targets.");
    assert.equal(snapshot.allGoldenGlyphs, true, "Action glyphs must use the same icon scale.");
    assert.equal(
      snapshot.instrumentStylesConsistent,
      true,
      "Instrument controls must reuse the same Golden Screen dimensions and labels.",
    );
    if (resourceKind === "card") {
      assert.ok(
        snapshot.instrumentActionCount > 0,
        "Card instruments must expose canonical maintenance actions.",
      );
    } else {
      assert.equal(snapshot.instrumentActionCount, 0);
    }
    assert.equal(snapshot.allWithinDetail, true, "Subscreen controls overflow their detail panel.");
    assert.equal(snapshot.noHorizontalOverflow, true, "Toolbar introduces a horizontal overflow.");
    assert.equal(snapshot.kinds.cdi, resourceKind === "account");
    if (resourceKind === "account") {
      assert.equal(snapshot.cdiSwitch?.role, "switch");
      assert.ok(snapshot.cdiSwitch?.width >= 43 && snapshot.cdiSwitch?.height >= 24);
    }
    return snapshot;
  }
  
  async function validateCdiSwitch(cdp) {
    const eligibleHref = await evaluate(
      cdp,
      `(() => {
      const item = document.querySelector('[data-resource-master-item][data-kind="account"][data-currency="BRL"][data-status="active"]');
      const link = item?.querySelector('a.resource-master-link');
      return link ? new URL(link.href).pathname + new URL(link.href).search : null;
    })()`,
    );
    assert.ok(eligibleHref, "No eligible BRL account for CDI switch validation.");
    await navigate(cdp, `${baseUrl}${eligibleHref}`);
    await waitForDetail(cdp, "account");
    const setup = await evaluate(
      cdp,
      `(() => {
      const toggle = document.querySelector('[data-resource-detail="account"] [data-cdi-toggle]');
      if (!toggle || toggle.disabled) return null;
      const accountId = toggle.dataset.accountId;
      const initiallyActive = toggle.getAttribute('aria-checked') === 'true';
      const originalFetch = window.fetch;
      window.__issue716CdiProof = { calls: [], initiallyActive, failNextPut: true };
      window.__issue716Fetch = originalFetch;
      window.fetch = async (url, options = {}) => {
        const path = String(url);
        const method = options.method || 'GET';
        if (path === '/api/account-remuneration/configurations' && method === 'GET') {
          return { ok: true, json: async () => ({ configurations: [{
            accountId, accountCurrency: 'BRL', indexKind: 'cdi', enabled: initiallyActive,
            remunerationPercent: 95, startsOn: '2026-10-01', categoryId: 'income-1'
          }] }) };
        }
        if (path === '/api/account-remuneration/configurations/' + encodeURIComponent(accountId) && method === 'PUT') {
          window.__issue716CdiProof.calls.push(JSON.parse(options.body));
          if (window.__issue716CdiProof.failNextPut) {
            window.__issue716CdiProof.failNextPut = false;
            return { ok: false, json: async () => ({ error: { message: 'Falha CDI simulada' } }) };
          }
          return { ok: true, json: async () => ({ operation: { message: 'CDI atualizado' } }) };
        }
        return originalFetch(url, options);
      };
      toggle.focus();
      toggle.click();
      return { focused: document.activeElement === toggle, label: toggle.getAttribute('aria-label') };
    })()`,
    );
    assert.ok(
      setup?.focused && setup.label?.includes("Remuneração CDI"),
      "CDI switch must be keyboard focusable and named.",
    );
    await waitFor(
      cdp,
      `Boolean(document.querySelector('#accounts-cards-confirm-dialog[open]'))`,
      "CDI confirmation did not open.",
    );
    await evaluate(cdp, `document.querySelector('[data-confirm-cancel]')?.click()`);
    await sleep(80);
    const cancelled = await evaluate(
      cdp,
      `(() => ({
      requests: window.__issue716CdiProof.calls.length,
      checked: document.querySelector('[data-cdi-toggle]')?.getAttribute('aria-checked'),
    }))()`,
    );
    assert.equal(cancelled.requests, 0, "Cancelling CDI must not write.");
    const before = await evaluate(cdp, "String(window.__issue716CdiProof.initiallyActive)");
    assert.equal(cancelled.checked, before, "Cancel must preserve state.");
  
    await evaluate(cdp, "document.querySelector('[data-cdi-toggle]')?.click()");
    await waitFor(
      cdp,
      `Boolean(document.querySelector('#accounts-cards-confirm-dialog[open]'))`,
      "CDI retry confirmation absent.",
    );
    await evaluate(cdp, "document.querySelector('[data-confirm-accept]')?.click()");
    await waitFor(
      cdp,
      `document.querySelector('[data-cdi-feedback]')?.textContent?.includes('Falha CDI simulada')`,
      "CDI failure was not surfaced.",
    );
    const failed = await evaluate(
      cdp,
      `(() => ({
      checked: document.querySelector('[data-cdi-toggle]')?.getAttribute('aria-checked'),
      canRetry: !document.querySelector('[data-cdi-toggle]')?.disabled,
    }))()`,
    );
    assert.equal(failed.checked, before, "Failed write must not flip CDI.");
    assert.equal(failed.canRetry, true, "Failed CDI write must allow retry.");
    await sleep(120);
    await waitFor(
      cdp,
      `!document.querySelector('#accounts-cards-confirm-dialog[open]') && !document.querySelector('[data-cdi-toggle]')?.disabled`,
      "CDI retry must wait for prior dialog close and toggle unlock.",
    );
  
    await evaluate(cdp, "document.querySelector('[data-cdi-toggle]')?.click()");
    await waitFor(
      cdp,
      `Boolean(document.querySelector('#accounts-cards-confirm-dialog[open]'))`,
      "CDI successful retry confirmation absent.",
    );
    await evaluate(cdp, "document.querySelector('[data-confirm-accept]')?.click()");
    await waitFor(
      cdp,
      `document.querySelector('[data-cdi-feedback]')?.textContent?.includes('CDI atualizado')`,
      "CDI successful write not surfaced.",
    );
    const success = await evaluate(
      cdp,
      `(() => ({
      checked: document.querySelector('[data-cdi-toggle]')?.getAttribute('aria-checked'),
      calls: window.__issue716CdiProof.calls,
      busy: document.querySelector('[data-cdi-toggle]')?.disabled,
    }))()`,
    );
    assert.equal(success.checked, String(before !== "true"), "Successful write must flip CDI.");
    assert.equal(
      success.calls.length,
      2,
      "Expected failed then successful PUT after cancelled attempt.",
    );
    assert.deepEqual(success.calls[1], {
      enabled: before !== "true",
      remunerationPercent: 95,
      startsOn: "2026-10-01",
      categoryId: "income-1",
    });
    assert.equal(success.busy, true, "Switch must lock until reload after successful write.");
    return { cancelled, failed, success };
  }

  return { validateGoldenActionToolbar, validateCdiSwitch };
}
