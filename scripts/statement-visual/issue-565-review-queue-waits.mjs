import { evaluate, sleep } from "./cdp.mjs";

export async function waitForEmptyState(cdp, timeout = 2_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const empty = await evaluate(
      cdp,
      `(() => ({
        visible: Boolean(document.querySelector('.empty-state')) &&
          document.body.innerText.includes('Nenhuma sugestão neste filtro.')
      }))()`,
    ).catch(() => ({ visible: false }));
    if (empty.visible) return empty;
    await sleep(80);
  }
  return evaluate(
    cdp,
    `(() => ({
      visible: Boolean(document.querySelector('.empty-state')) &&
        document.body.innerText.includes('Nenhuma sugestão neste filtro.')
    }))()`,
  );
}

export async function inspectQueueStatus(cdp, expectedText) {
  return evaluate(
    cdp,
    `(() => {
      const status = document.querySelector('[data-review-queue-status]');
      return {
        visible: Boolean(status) && status.textContent.includes(${JSON.stringify(expectedText)}),
        retryVisible: Boolean(status?.querySelector('[data-review-retry]'))
      };
    })()`,
  );
}

/** Await a completed refresh, not a fixed delay that can race with selection rendering. */
export async function waitForQueueRefresh(cdp, timeout = 6_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const status = await inspectQueueStatus(cdp, "Fila atualizada.").catch(() => ({
      visible: false,
    }));
    if (status.visible) return;
    await sleep(100);
  }
  throw new Error("Review queue refresh did not finish before conflict validation.");
}

export async function waitForCurrentEvidence(cdp, timeout = 4_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const ready = await evaluate(
      cdp,
      `document.getElementById('inbox-review-selected')?.dataset.reviewEvidenceState === 'ready'`,
    ).catch(() => false);
    if (ready) return;
    await sleep(100);
  }
  throw new Error("The review evidence did not become ready.");
}

export async function inspectConflictState(cdp, suggestionId) {
  return evaluate(
    cdp,
    `(() => {
      const card = document.getElementById('inbox-review-selected');
      const status = card?.querySelector('[data-review-row-status]');
      const button = card?.querySelector('[data-review-approve]');
      return {
        visible: Boolean(status) && status.textContent.includes(
          'Esta sugestão mudou. Atualize a fila antes de tentar novamente.'
        ),
        actionReenabled: button?.disabled === false
      };
    })()`,
  );
}

export async function waitForConflictState(cdp, suggestionId, timeout = 4_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const conflict = await inspectConflictState(cdp, suggestionId).catch(() => ({
      visible: false,
      actionReenabled: false,
    }));
    if (conflict.visible && conflict.actionReenabled) return conflict;
    await sleep(120);
  }
  return inspectConflictState(cdp, suggestionId);
}

export async function restoreHarness(cdp) {
  await evaluate(
    cdp,
    `(() => {
      if (window.__issue565OriginalFetch) window.fetch = window.__issue565OriginalFetch;
      if (window.__issue565OriginalConfirm) window.confirm = window.__issue565OriginalConfirm;
      delete window.__issue565OriginalFetch;
      delete window.__issue565OriginalConfirm;
      delete window.__issue565BaselineReviewItem;
      delete window.__issue565QueueMode;
      return true;
    })()`,
  );
}

export async function waitForReviewCard(cdp, suggestionId, timeout = 12_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const ready = await evaluate(
      cdp,
      `Boolean(document.querySelector('[data-review-id="${escapeJs(suggestionId)}"]'))`,
    ).catch(() => false);
    if (ready) return;
    await sleep(120);
  }
  throw new Error(`Timed out waiting for review card ${suggestionId}`);
}

export function escapeJs(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
