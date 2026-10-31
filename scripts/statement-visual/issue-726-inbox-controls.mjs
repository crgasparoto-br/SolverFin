import { join } from "node:path";

import { evaluate, screenshot, setViewport } from "./cdp.mjs";

export async function validateCorrectionGuards(cdp, suggestionId, submitCorrectionDialog, waitFor) {
  const report = [];
  for (const mode of ["hidden", "wrong-selection", "changed-fingerprint"]) {
    const initial = await evaluate(
      cdp,
      `(() => {
      const originalFetch = window.fetch;
      const selected = document.getElementById('inbox-review-selected');
      const element = selected.querySelector('[data-review-evidence="ready"]');
      if (!element) throw new Error('Review evidence not available for correction control');
      window.__issue726OriginalFetch = originalFetch;
      window.__issue726ApprovalPosts = 0;
      window.__issue726OriginalVisibility = element.style.visibility;
      window.__issue726OriginalReviewId = selected.dataset.reviewSelectedId;
      if (${JSON.stringify(mode)} === 'hidden') element.style.visibility = 'hidden';
      if (${JSON.stringify(mode)} === 'wrong-selection') selected.dataset.reviewSelectedId = 'another-selected-item';
      window.fetch = async (...args) => {
        const url = String(args[0] instanceof Request ? args[0].url : args[0]);
        if (url.includes('/api/ai-review-queue/${suggestionId}/approve')) {
          window.__issue726ApprovalPosts++;
          return new Response(JSON.stringify({ error: { message: 'Synthetic approval should not be reached' } }), { status: 409 });
        }
        if (${JSON.stringify(mode)} === 'changed-fingerprint' && url.includes('/api/ai-review-queue/${suggestionId}/payload')) {
          const response = await originalFetch(...args);
          const body = await response.json();
          return new Response(JSON.stringify({ ...body, payload: { ...body.payload, fingerprint: 'different-after-human-review' } }), {
            status: 200, headers: { 'content-type': 'application/json' }
          });
        }
        return originalFetch(...args);
      };
      return { fingerprint: selected.dataset.reviewFingerprint, mode: ${JSON.stringify(mode)} };
    })()`,
    );
    await submitCorrectionDialog(cdp);
    await waitFor(
      cdp,
      `document.querySelector('[data-category-correction-dialog] .form-status')?.textContent?.includes('evidência') === true`,
    );
    const result = await evaluate(
      cdp,
      `(() => {
      const selected = document.getElementById('inbox-review-selected');
      const element = selected.querySelector('[data-review-evidence="ready"]');
      const form = document.querySelector('[data-category-correction-dialog] form.edit-grid');
      return { posts: window.__issue726ApprovalPosts, blocked: Boolean(form && !form.querySelector('button[type="submit"]').disabled),
        reviewState: selected.dataset.reviewEvidenceState };
    })()`,
    );
    report.push({ ...initial, ...result });
    await evaluate(
      cdp,
      `(() => {
      const selected = document.getElementById('inbox-review-selected');
      const element = selected.querySelector('[data-review-evidence="ready"]');
      if (element) element.style.visibility = window.__issue726OriginalVisibility;
      if (${JSON.stringify(mode)} === 'wrong-selection') selected.dataset.reviewSelectedId = window.__issue726OriginalReviewId;
      window.fetch = window.__issue726OriginalFetch;
      delete window.__issue726OriginalFetch;
      return true;
    })()`,
    );
  }
  return report;
}

export async function validateEvidenceNegativeControl(cdp) {
  return evaluate(
    cdp,
    `(() => {
    const evidence = document.querySelector('#inbox-review-selected [data-review-evidence="ready"]');
    const approve = document.querySelector('#inbox-review-selected [data-review-approve]');
    if (!evidence || !approve) return { hiddenEvidenceBlockedDecision: false, evidenceRestored: false };
    const initialVisibility = evidence.style.visibility;
    const originalConfirm = window.confirm;
    let confirms = 0;
    try {
      evidence.style.visibility = 'hidden';
      window.confirm = () => { confirms += 1; return false; };
      approve.click();
    } finally {
      evidence.style.visibility = initialVisibility;
      window.confirm = originalConfirm;
    }
    return { hiddenEvidenceBlockedDecision: confirms === 0, evidenceRestored: getComputedStyle(evidence).visibility !== 'hidden' };
  })()`,
  );
}

export async function validateFingerprintBinding(cdp) {
  return evaluate(
    cdp,
    `(async () => {
    const originalFetch = window.fetch;
    const originalConfirm = window.confirm;
    const selected = document.getElementById('inbox-review-selected');
    const results = [];
    const wait = async (test) => {
      for (let i = 0; i < 100; i++) {
        if (test()) return true;
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      return false;
    };
    try {
      for (const action of ['approve', 'reject']) {
        for (const changed of [true, false]) {
          const original = selected?.dataset.reviewFingerprint;
          if (!original || selected.dataset.reviewEvidenceState !== 'ready') throw new Error('Missing initial reviewed fingerprint');
          let posts = 0;
          let expectedFingerprint;
          window.confirm = () => true;
          window.fetch = async (input, options) => {
            const url = typeof input === 'string' ? input : input?.url || String(input);
            const method = String(options?.method || input?.method || 'GET').toUpperCase();
            if (method === 'GET' && url.includes('/api/ai-review-queue/') && url.endsWith('/payload') && changed) {
              const response = await originalFetch(input, options);
              const body = await response.json();
              return new Response(JSON.stringify({ ...body, payload: { ...body.payload, fingerprint: 'changed-without-review-' + action } }), {
                status: 200, headers: { 'content-type': 'application/json' }
              });
            }
            if (method === 'POST' && url.endsWith('/' + action) && url.includes('/api/ai-review-queue/')) {
              posts++;
              expectedFingerprint = JSON.parse(options?.body || '{}').expectedFingerprint;
              return new Response(JSON.stringify({ error: { code: 'AI_SUGGESTION_PAYLOAD_CONFLICT', message: 'Synthetic conflict; no mutation.' } }), {
                status: 409, headers: { 'content-type': 'application/json' }
              });
            }
            return originalFetch(input, options);
          };
          selected.querySelector('[data-review-' + action + ']')?.click();
          const settled = await wait(() => changed
            ? selected.dataset.reviewEvidenceState === 'unavailable'
            : posts > 0 && selected.querySelector('[data-review-row-status]')?.textContent?.includes('mudou'));
          const ok = changed
            ? settled && posts === 0 && Boolean(selected.querySelector('[data-review-evidence-retry]'))
            : settled && posts === 1 && expectedFingerprint === original;
          results.push({ action, changed, posts, original, expectedFingerprint, settled, ok });
          window.fetch = originalFetch;
          window.confirm = originalConfirm;
          if (changed) {
            selected.querySelector('[data-review-evidence-retry]')?.click();
            if (!await wait(() => selected.dataset.reviewEvidenceState === 'ready')) {
              throw new Error('Evidence retry failed after blocking stale ' + action);
            }
          }
        }
      }
      return results;
    } finally {
      window.fetch = originalFetch;
      window.confirm = originalConfirm;
    }
  })()`,
  );
}

export async function validateHierarchyNegative(cdp) {
  return evaluate(
    cdp,
    `(() => {
    const layout = document.querySelector('.inbox-review-cockpit .sf-detail-layout');
    const secondary = document.querySelector('.inbox-review-secondary');
    const fallback = document.querySelector('[data-financial-insight-fallback="true"]');
    if (!layout || !secondary) return { baseline: false, attackRejected: false, restored: false };
    const below = () => secondary.getBoundingClientRect().top >= layout.getBoundingClientRect().bottom;
    const baseline = below() && (!fallback || secondary.contains(fallback));
    const originalParent = secondary.parentElement;
    const nextSibling = secondary.nextSibling;
    let attackRejected = false;
    try {
      layout.before(secondary);
      attackRejected = !below();
    } finally {
      if (nextSibling) originalParent.insertBefore(secondary, nextSibling);
      else originalParent.appendChild(secondary);
    }
    return { baseline, attackRejected, restored: below() };
  })()`,
  );
}

export async function validateLongEvidence(cdp, outputDir) {
  const findings = [];
  for (const [width, height] of [
    [320, 740],
    [390, 844],
  ]) {
    await setViewport(cdp, width, height);
    const filename = `issue-726-inbox-long-evidence-${width}x${height}.png`;
    await evaluate(
      cdp,
      `(() => {
      const evidence = document.querySelector('#inbox-review-selected [data-review-evidence="ready"]');
      if (!evidence) throw new Error('Selected evidence is not available');
      const paragraph = document.createElement('p');
      paragraph.dataset.issue726LongEvidence = '';
      paragraph.textContent = 'Evidência extensa para revisão humana sem dados sensíveis. '.repeat(48) +
        'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      evidence.appendChild(paragraph);
      return true;
    })()`,
    );
    try {
      const inspected = await evaluate(
        cdp,
        `(() => {
        const selected = document.getElementById('inbox-review-selected');
        const evidence = selected?.querySelector('[data-review-evidence="ready"]');
        const decision = selected?.querySelector('[data-review-approve]');
        if (!evidence || !decision) return { bodyFitsViewport: false, decisionFitsViewport: false, evidenceBeforeDecision: false };
        decision.scrollIntoView({ block: 'end' });
        const rect = decision.getBoundingClientRect();
        return {
          bodyFitsViewport: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          decisionFitsViewport: rect.left >= 0 && rect.right <= innerWidth && rect.height >= 34,
          evidenceBeforeDecision: Boolean(evidence.compareDocumentPosition(decision) & Node.DOCUMENT_POSITION_FOLLOWING)
        };
      })()`,
      );
      await screenshot(cdp, join(outputDir, filename));
      findings.push({ width, height, screenshot: filename, ...inspected });
    } finally {
      await evaluate(cdp, `document.querySelector('[data-issue726-long-evidence]')?.remove()`);
    }
  }
  await setViewport(cdp, 1366, 900);
  return findings;
}
