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

// A-006: prove the A6 button is contained and hit-testable, then reintroduce the
// legacy three-column grid to ensure the same geometry check detects the regression.
export async function validateReviewCardGridNegative(cdp, suggestionId) {
  return evaluate(
    cdp,
    `(() => {
    const card = document.querySelector('[data-review-id="${suggestionId}"]');
    const button = card?.querySelector('[data-review-select]');
    if (!card || !button) throw new Error('Review card or selection button missing');
    button.scrollIntoView({ block: 'center', inline: 'nearest' });
    const inspect = () => {
      const outer = card.getBoundingClientRect();
      const inner = button.getBoundingClientRect();
      const target = document.elementFromPoint(inner.left + inner.width / 2, inner.top + inner.height / 2);
      return {
        cardWidth: Math.round(outer.width),
        cardRight: Math.round(outer.right),
        buttonLeft: Math.round(inner.left),
        buttonRight: Math.round(inner.right),
        gridColumns: getComputedStyle(card).gridTemplateColumns,
        overflowPx: Math.max(0, card.scrollWidth - card.clientWidth),
        contained: inner.width >= 44 && inner.height >= 44 && inner.left >= outer.left - 1 && inner.right <= outer.right + 1,
        hitTarget: target === button || button.contains(target)
      };
    };
    const baseline = inspect();
    const previous = [card.style.getPropertyValue('grid-template-columns'), card.style.getPropertyPriority('grid-template-columns')];
    const previousButton = [button.style.getPropertyValue('grid-column'), button.style.getPropertyPriority('grid-column')];
    let attack;
    try {
      card.style.setProperty('grid-template-columns',
        'minmax(150px, .65fr) minmax(240px, 1.8fr) minmax(140px, auto)', 'important');
      button.style.setProperty('grid-column', 'auto', 'important');
      attack = inspect();
    } finally {
      if (previous[0]) card.style.setProperty('grid-template-columns', previous[0], previous[1]);
      else card.style.removeProperty('grid-template-columns');
      if (previousButton[0]) button.style.setProperty('grid-column', previousButton[0], previousButton[1]);
      else button.style.removeProperty('grid-column');
    }
    const restored = inspect();
    return {
      baseline,
      attack,
      restored,
      attackRejected: attack.overflowPx > 0 || !attack.contained || !attack.hitTarget,
      restorationPassed: restored.contained && restored.hitTarget && restored.overflowPx === 0
    };
  })()`,
  );
}

// Golden Screen: inspect actual CSS tokens, neutral controls, accessibility and menu keyboard behavior.
export async function validateGoldenInboxControls(cdp) {
  const rest = await evaluate(cdp, `(() => {
    const root = getComputedStyle(document.documentElement);
    const token = (name) => root.getPropertyValue('--sf-color-' + name).trim();
    const style = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const css = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        background: css.backgroundColor,
        color: css.color,
        border: css.borderTopColor,
        minTouchHeight: rect.height >= 44,
        actualHeight: Math.round(rect.height),
        neutral: node.getAttribute('data-button-variant') === 'neutral' ||
          node.classList.contains('sf-button-secondary') || node.matches('.inbox-new-entry-trigger'),
      };
    };
    const colors = (color) => {
      const value = String(color || '').trim();
      if (/^#[0-9a-fA-F]{6}$/.test(value)) {
        return [1,3,5].map((position) => parseInt(value.slice(position, position + 2), 16));
      }
      return (value.match(/[0-9]+/g) || []).slice(0,3).map(Number);
    };
    const similar = (a,b) => {
      const x = colors(a), y = colors(b);
      return x.length === 3 && y.length === 3 && x.every((v,i) => v === y[i]);
    };
    const luminance = (color) => {
      const rgb = colors(color).map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return rgb.length === 3 ? (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) : 0;
    };
    const contrast = (a,b) => {
      const x = luminance(a), y = luminance(b);
      return Number(((Math.max(x,y) + 0.05)/(Math.min(x,y) + 0.05)).toFixed(2));
    };
    const row = style('.inbox-review-queue [data-review-select]');
    const nav = style('.inbox-review-nav');
    const trigger = style('.inbox-new-entry-trigger');
    const refresh = style('[data-review-refresh]');
    const status = style('.review-card.selected');
    const selected = document.querySelector('.review-card.selected [data-review-select]');
    const refreshNode = document.querySelector('[data-review-refresh]');
    if (!row || !nav || !trigger || !refresh || !status || !selected || !refreshNode) return {complete:false};
    refreshNode.disabled = true;
    const disabledOpacity = getComputedStyle(refreshNode).opacity;
    refreshNode.disabled = false;
    return {
      complete: true, row, nav, trigger, refresh, status,
      selectedAriaPressed: selected.getAttribute('aria-pressed'),
      tokenMatch: [row, nav, trigger, refresh].every((item) => similar(item.background, token('surface')) && similar(item.color, token('primary'))),
      contrast: [row, nav, trigger, refresh].map((item) => contrast(item.color, item.background)),
      disabledOpacity: Number(disabledOpacity),
      ariaMenuLabel: document.querySelector('.inbox-new-entry-trigger')?.getAttribute('aria-label'),
      hasNeutralLinks: document.querySelectorAll('.inbox-section-nav a.sf-button-secondary').length === 3,
      financialDirectionColorFromTokens: document.querySelector('.review-risk') ?
        similar(getComputedStyle(document.querySelector('.review-risk')).backgroundColor, token('warning-surface')) : true,
      focusStyleDefined: Boolean([...document.styleSheets].some((sheet) => {
        try { return [...sheet.cssRules].some((rule) => String(rule.cssText).includes('.inbox-new-entry-actions > summary:focus-visible')); }
        catch { return false; }
      })),
    };
  })()`);
  const menuKeyboard = await evaluate(cdp, `(() => {
    const details = document.querySelector('.inbox-new-entry-actions');
    const summary = details?.querySelector('summary');
    if (!details || !summary) return {opened:false, closed:false, focusRestored:false};
    details.open = true;
    summary.focus();
    const opened = details.open;
    details.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true, cancelable:true}));
    return {opened, closed:!details.open, focusRestored: document.activeElement === summary};
  })()`);
  return { ...rest, menuKeyboard };
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
