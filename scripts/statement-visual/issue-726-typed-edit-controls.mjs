import { evaluate } from "./cdp.mjs";

// A-011: the typed category editor must fail closed across all evidence / modal boundaries.
// POSTs are always intercepted with 409; no financial fixture is modified by these attacks.
export async function validateTypedCategorizationEdit(cdp) {
  return evaluate(
    cdp,
    `(async () => {
      const selected = document.getElementById('inbox-review-selected');
      const dialog = document.getElementById('ai-review-dialog');
      if (!selected || !dialog || !document.querySelector('.review-card[data-review-kind="categorization"] [data-review-select]')) {
        throw new Error('Typed review fixture is missing');
      }
      const wait = async (predicate) => {
        for (let count = 0; count < 110; count++) {
          if (predicate()) return true;
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
        return false;
      };
      const modes = [
        'open-stale', 'submit-stale', 'submit-hidden', 'submit-inert',
        'submit-wrong-selection', 'submit-unavailable', 'submit-canceled-before',
        'submit-canceled-during-get', 'submit-detached',
        'submit-regenerated-selection', 'submit-matching'
      ];
      const originalFetch = window.fetch;
      const results = [];
      try {
        for (const mode of modes) {
          const trigger = document.querySelector('.review-card[data-review-kind="categorization"] [data-review-select]');
          if (!trigger) throw new Error('Typed review card disappeared');
          trigger.click();
          if (!await wait(() => selected.dataset.reviewEvidenceState === 'ready' &&
            selected.querySelector('[data-review-edit][data-review-kind="categorization"]'))) {
            throw new Error('Category evidence unavailable for ' + mode);
          }
          const editButton = selected.querySelector('[data-review-edit]');
          const evidence = selected.querySelector('[data-review-evidence="ready"]');
          const ancestor = evidence?.closest('.inbox-review-detail');
          const expected = selected.dataset.reviewFingerprint;
          const selectedId = selected.dataset.reviewSelectedId;
          let phase = 'open', posts = 0, submitGets = 0, matched = false;
          let releaseGet, delayedGet = false;
          const previousVisibility = evidence.style.visibility;
          window.fetch = async (input, options) => {
            const url = typeof input === 'string' ? input : input?.url || String(input);
            const method = String(options?.method || input?.method || 'GET').toUpperCase();
            const payload = method === 'GET' && url.includes('/api/ai-review-queue/') && url.endsWith('/payload');
            if (payload && phase === 'submit') submitGets += 1;
            if (payload && ((mode === 'open-stale' && phase === 'open') ||
              (mode === 'submit-stale' && phase === 'submit'))) {
              const response = await originalFetch(input, options);
              const body = await response.json();
              return new Response(JSON.stringify({ ...body, payload: { ...body.payload, fingerprint: 'alternate-version' } }), {
                status: 200, headers: { 'content-type': 'application/json' }
              });
            }
            if (payload && mode === 'submit-unavailable' && phase === 'submit') {
              return new Response(JSON.stringify({ error: { code: 'TEMPORARILY_UNAVAILABLE', message: 'Synthetic 503' } }), {
                status: 503, headers: { 'content-type': 'application/json' }
              });
            }
            if (payload && mode === 'submit-canceled-during-get' && phase === 'submit') {
              delayedGet = true;
              await new Promise((resolve) => { releaseGet = resolve; });
            }
            if (method === 'POST' && url.includes('/api/ai-review-queue/') && url.endsWith('/edit')) {
              posts += 1;
              matched = JSON.parse(options?.body || '{}').expectedFingerprint === expected;
              return new Response(JSON.stringify({ error: { code: 'AI_SUGGESTION_PAYLOAD_CONFLICT', message: 'Synthetic 409, no mutation' } }), {
                status: 409, headers: { 'content-type': 'application/json' }
              });
            }
            return originalFetch(input, options);
          };
          try {
            editButton.click();
            if (mode === 'open-stale') {
              const invalidated = await wait(() => selected.dataset.reviewEvidenceState === 'unavailable' &&
                dialog.open && !dialog.querySelector('[data-review-edit-form]'));
              results.push({ mode, submitGets, posts, matched, passed: invalidated && posts === 0 });
              continue;
            }
            if (!await wait(() => dialog.open && Boolean(dialog.querySelector('[data-review-edit-form]')))) {
              throw new Error('Category edit form did not open for ' + mode);
            }
            const form = dialog.querySelector('[data-review-edit-form]');
            const category = [...form.elements.proposedCategoryId.options].find((option) => option.value);
            if (!category) throw new Error('Missing active category option');
            form.elements.proposedCategoryId.value = category.value;
            phase = 'submit';
            if (mode === 'submit-hidden') evidence.style.visibility = 'hidden';
            if (mode === 'submit-inert') ancestor?.setAttribute('inert', '');
            if (mode === 'submit-wrong-selection') selected.dataset.reviewSelectedId = 'another-review';
            if (mode === 'submit-canceled-before') dialog.close();
            if (mode === 'submit-detached') form.remove();
            if (mode === 'submit-regenerated-selection') {
              const previousEvidence = selected.querySelector('[data-review-evidence="ready"]');
              document.querySelector('[data-review-refresh]')?.click();
              if (!await wait(() => selected.dataset.reviewEvidenceState === 'ready' &&
                selected.querySelector('[data-review-evidence="ready"]') !== previousEvidence)) {
                throw new Error('Review generation refresh did not complete');
              }
            }
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            if (mode === 'submit-canceled-during-get') {
              if (!await wait(() => delayedGet && Boolean(releaseGet))) throw new Error('GET not pending');
              dialog.close();
              releaseGet?.();
              await new Promise((resolve) => setTimeout(resolve, 180));
            } else {
              await wait(() => !form.querySelector('button[type="submit"]')?.disabled || !dialog.open);
            }
            const valid = mode === 'submit-matching'
              ? submitGets === 1 && posts === 1 && matched
              : posts === 0 && (mode.startsWith('submit-canceled-before') || mode === 'submit-detached' ||
                mode === 'submit-hidden' || mode === 'submit-inert' ||
                mode === 'submit-wrong-selection' || mode === 'submit-regenerated-selection' ||
                mode === 'submit-canceled-during-get' || submitGets === 1);
            const invalidated = mode === 'submit-stale' || mode === 'submit-wrong-selection'
              ? selected.dataset.reviewEvidenceState === 'unavailable' : true;
            results.push({ mode, submitGets, posts, matched, invalidated, passed: valid && invalidated });
          } finally {
            releaseGet?.();
            evidence.style.visibility = previousVisibility;
            ancestor?.removeAttribute('inert');
            if (mode === 'submit-wrong-selection' && selected.dataset.reviewEvidenceState === 'ready') {
              selected.dataset.reviewSelectedId = selectedId;
            }
            if (dialog.open) dialog.close();
            window.fetch = originalFetch;
            if (selected.dataset.reviewEvidenceState === 'unavailable') {
              selected.querySelector('[data-review-evidence-retry]')?.click();
              if (!await wait(() => selected.dataset.reviewEvidenceState === 'ready')) {
                throw new Error('Review evidence recovery failed after ' + mode);
              }
            }
          }
        }
      } finally {
        window.fetch = originalFetch;
        if (dialog.open) dialog.close();
      }
      return results;
    })()`,
  );
}
