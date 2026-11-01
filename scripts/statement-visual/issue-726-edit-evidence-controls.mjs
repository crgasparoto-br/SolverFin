import { evaluate } from "./cdp.mjs";

// A-010: a visible, selected A must remain the same current A at the /edit boundary.
// All /edit POSTs are intercepted with 409 to avoid financial fixture mutations.
export async function validateEditEvidenceBinding(cdp) {
  return evaluate(
    cdp,
    `(async () => {
    const selected = document.getElementById('inbox-review-selected');
    const dialog = document.getElementById('ai-review-dialog');
    if (!selected || !dialog || !selected.querySelector('[data-review-edit]')) {
      throw new Error('Review editing controls are unavailable');
    }
    const originalFetch = window.fetch;
    const reports = [];
    const modes = [
      'open-hidden', 'open-stale', 'submit-hidden', 'submit-inert',
      'submit-wrong-selection', 'submit-stale', 'submit-unavailable',
      'submit-canceled', 'submit-matching'
    ];
    const wait = async (test) => {
      for (let i = 0; i < 120; i++) {
        if (test()) return true;
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      return false;
    };
    try {
      for (const mode of modes) {
        const evidence = selected.querySelector('[data-review-evidence="ready"]');
        const editButton = selected.querySelector('[data-review-edit]');
        if (!evidence || !editButton || !selected.dataset.reviewFingerprint) {
          throw new Error('Missing ready evidence before editing ' + mode);
        }
        const ancestor = evidence.closest('.inbox-review-detail');
        const expected = selected.dataset.reviewFingerprint;
        const originalStyle = evidence.style.cssText;
        let phase = 'open', posts = 0, fingerprintMatched = false;
        let releaseGet, delayedGetStarted = false;
        window.fetch = async (input, options) => {
          const url = typeof input === 'string' ? input : input?.url || String(input);
          const method = String(options?.method || input?.method || 'GET').toUpperCase();
          const isPayload = method === 'GET' && url.includes('/api/ai-review-queue/') && url.endsWith('/payload');
          if (isPayload && ((mode === 'open-stale' && phase === 'open') ||
            (mode === 'submit-stale' && phase === 'submit'))) {
            const response = await originalFetch(input, options);
            const body = await response.json();
            return new Response(JSON.stringify({ ...body, payload: { ...body.payload, fingerprint: 'unreviewed-other-version' } }), {
              status: 200, headers: { 'content-type': 'application/json' }
            });
          }
          if (isPayload && phase === 'submit' && mode === 'submit-unavailable') {
            return new Response(JSON.stringify({ error: { code: 'TEMPORARILY_UNAVAILABLE', message: 'Synthetic 503' } }), {
              status: 503, headers: { 'content-type': 'application/json' }
            });
          }
          if (isPayload && phase === 'submit' && mode === 'submit-canceled') {
            delayedGetStarted = true;
            await new Promise((resolve) => { releaseGet = resolve; });
          }
          if (method === 'POST' && url.includes('/api/ai-review-queue/') && url.endsWith('/edit')) {
            posts++;
            fingerprintMatched = JSON.parse(options?.body || '{}').expectedFingerprint === expected;
            return new Response(JSON.stringify({ error: { code: 'AI_SUGGESTION_PAYLOAD_CONFLICT', message: 'Synthetic 409, no mutation' } }), {
              status: 409, headers: { 'content-type': 'application/json' }
            });
          }
          return originalFetch(input, options);
        };
        let observed = false;
        try {
          if (mode === 'open-hidden') evidence.style.visibility = 'hidden';
          editButton.click();
          if (mode === 'open-hidden') {
            await new Promise((resolve) => setTimeout(resolve, 120));
            observed = !dialog.open && posts === 0;
          } else if (mode === 'open-stale') {
            observed = await wait(() => selected.dataset.reviewEvidenceState === 'unavailable' &&
              dialog.open && !dialog.querySelector('[data-review-edit-form]'));
            observed = observed && posts === 0;
          } else {
            const opened = await wait(() => dialog.open && Boolean(dialog.querySelector('[data-review-edit-form]')));
            if (!opened) throw new Error('Edit dialog did not open for ' + mode);
            const form = dialog.querySelector('[data-review-edit-form]');
            phase = 'submit';
            if (mode === 'submit-hidden') evidence.style.visibility = 'hidden';
            if (mode === 'submit-inert') ancestor.setAttribute('inert', '');
            if (mode === 'submit-wrong-selection') selected.dataset.reviewSelectedId = 'another-review';
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            if (mode === 'submit-canceled') {
              const pending = await wait(() => delayedGetStarted && Boolean(releaseGet));
              if (pending) dialog.close();
              releaseGet?.();
              await new Promise((resolve) => setTimeout(resolve, 160));
              observed = pending && posts === 0 && !dialog.open;
            } else {
              const settled = await wait(() => !form.querySelector('button[type="submit"]')?.disabled);
              observed = settled && (mode === 'submit-matching'
                ? posts === 1 && fingerprintMatched && selected.dataset.reviewEvidenceState === 'ready'
                : posts === 0);
              if (mode === 'submit-stale' || mode === 'submit-wrong-selection') {
                observed = observed && selected.dataset.reviewEvidenceState === 'unavailable';
              }
            }
          }
          reports.push({ mode, posts, fingerprintMatched, passed: observed });
        } finally {
          releaseGet?.();
          evidence.style.cssText = originalStyle;
          ancestor?.removeAttribute('inert');
          if (mode === 'submit-wrong-selection' && selected.dataset.reviewEvidenceState === 'ready') {
            selected.dataset.reviewSelectedId = selected.querySelector('[data-review-edit]')?.dataset.reviewEdit || '';
          }
          if (dialog.open) dialog.close();
          window.fetch = originalFetch;
          if (selected.dataset.reviewEvidenceState === 'unavailable') {
            selected.querySelector('[data-review-evidence-retry]')?.click();
            if (!await wait(() => selected.dataset.reviewEvidenceState === 'ready')) {
              throw new Error('Review evidence did not recover after ' + mode);
            }
          }
        }
      }
    } finally {
      window.fetch = originalFetch;
      if (dialog.open) dialog.close();
    }
    return reports;
  })()`,
  );
}

