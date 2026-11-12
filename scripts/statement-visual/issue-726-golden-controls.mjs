import { join } from "node:path";

import { evaluate, screenshot, setViewport } from "./cdp.mjs";
import { validateGoldenStateMatrix } from "./issue-726-golden-state-matrix.mjs";
import { validateReviewCardGridNegative } from "./issue-726-inbox-controls.mjs";

// Golden Screen: inspect actual CSS tokens, neutral controls, accessibility and menu keyboard behavior.
export async function validateGoldenInboxControls(cdp) {
  const rest = await evaluate(
    cdp,
    `(async () => {
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
        hovered: node.matches(':hover'),
        focusVisible: node.matches(':focus-visible'),
        active: node.matches(':active'),
        expanded: Boolean(node.closest('details')?.open),
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
    const originallyDisabled = refreshNode.disabled;
    refreshNode.disabled = true;
    // Wait for the real CSS transition, rather than sampling its initial frame.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const disabledCss = getComputedStyle(refreshNode);
    const disabledOpacity = Number(disabledCss.opacity);
    const disabledCursor = disabledCss.cursor;
    const disabledContrast = contrast(disabledCss.color, disabledCss.backgroundColor);
    const disabledTokensMatch = similar(disabledCss.backgroundColor, token('neutral-control-hover')) &&
      similar(disabledCss.color, token('muted-text')) &&
      similar(disabledCss.borderTopColor, token('border')) && disabledOpacity === 1;
    refreshNode.disabled = originallyDisabled;
    const neutralTokensMatch = (item) => {
      const normal = similar(item.background, token('surface')) &&
        similar(item.color, token('primary')) &&
        [token('border'), token('line')].some((border) => similar(item.border, border));
      const interactive = (item.hovered || item.focusVisible || item.active || item.expanded) &&
        similar(item.background, token('neutral-control-hover')) &&
        similar(item.color, token('neutral-control-text-hover')) &&
        similar(item.border, token('neutral-control-border-hover'));
      return item.hovered || item.focusVisible || item.active || item.expanded ? interactive : normal;
    };
    return {
      complete: true, row, nav, trigger, refresh, status,
      selectedAriaPressed: selected.getAttribute('aria-pressed'),
      tokenMatch: [row, nav, trigger, refresh].every(neutralTokensMatch),
      contrast: [row, nav, trigger, refresh].map((item) => contrast(item.color, item.background)),
      disabledOpacity, disabledCursor, disabledContrast, disabledTokensMatch,
      ariaMenuLabel: document.querySelector('.inbox-new-entry-trigger')?.getAttribute('aria-label'),
      hasNeutralLinks: document.querySelectorAll('.inbox-section-nav a.sf-button-secondary').length === 3,
      financialDirectionColorFromTokens: document.querySelector('.review-risk') ?
        similar(getComputedStyle(document.querySelector('.review-risk')).backgroundColor, token('warning-surface')) : true,
      focusStyleDefined: Boolean([...document.styleSheets].some((sheet) => {
        try { return [...sheet.cssRules].some((rule) => String(rule.cssText).includes('.inbox-new-entry-actions > summary:focus-visible')); }
        catch { return false; }
      })),
    };
  })()`,
  );
  const menuKeyboard = await evaluate(
    cdp,
    `(() => {
    const details = document.querySelector('.inbox-new-entry-actions');
    const summary = details?.querySelector('summary');
    if (!details || !summary) return {opened:false, closed:false, focusRestored:false};
    details.open = true;
    summary.focus();
    const opened = details.open;
    details.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true, cancelable:true}));
    return {opened, closed:!details.open, focusRestored: document.activeElement === summary};
  })()`,
  );
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

export async function inspectViewport(cdp, suggestionId, width, height) {
  return evaluate(
    cdp,
    `(() => {
      const card = [...document.querySelectorAll('[data-review-id]')].find((item) => item.dataset.reviewId === ${JSON.stringify(suggestionId)});
      const visible = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const buttons = card ? [...card.querySelectorAll('button')].filter(visible) : [];
      const reviewCards = [...document.querySelectorAll('.inbox-review-queue .review-card')];
      const actionsContainedInCards = reviewCards.length > 0 && reviewCards.every((row) => {
        const rowRect = row.getBoundingClientRect();
        return [...row.querySelectorAll('[data-review-select]')].every((action) => {
          const actionRect = action.getBoundingClientRect();
          return actionRect.width >= 44 && actionRect.height >= 44 &&
            actionRect.left >= rowRect.left - 1 && actionRect.right <= rowRect.right + 1;
        });
      });
      const selected = document.getElementById('inbox-review-selected');
      const evidence = selected?.querySelector('[data-review-evidence="ready"]');
      const decision = selected?.querySelector('[data-review-approve]');
      const decisionButtons = selected ? [...selected.querySelectorAll('.review-decision-actions button')].filter(visible) : [];
      const reviewLayout = document.querySelector('.inbox-review-cockpit .sf-detail-layout');
      const secondary = document.querySelector('.inbox-review-secondary');
      const filters = [...document.querySelectorAll('[data-review-filter]')].filter(visible);
      return {
        viewport: ${JSON.stringify(`${width}x${height}`)},
        cardVisible: visible(card),
        filtersVisible: filters.length === 3,
        bodyFitsViewport: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        actionsFitViewport: buttons.length > 0 && buttons.every((button) => {
          const rect = button.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= window.innerWidth;
        }),
        actionsContainedInCards,
        actionsMeetMinimum: buttons.length > 0 && buttons.every((button) => button.getBoundingClientRect().height >= 34),
        technicalIdHidden: !document.body.innerText.includes(${JSON.stringify(suggestionId)}),
        selectedEvidenceReady: selected?.dataset.reviewEvidenceState === 'ready' && visible(evidence),
        decisionAfterEvidence: Boolean(evidence && decision && (evidence.compareDocumentPosition(decision) & Node.DOCUMENT_POSITION_FOLLOWING)),
        detailActionsFitViewport: decisionButtons.length > 0 && decisionButtons.every((button) => { const rect = button.getBoundingClientRect(); return rect.left >= 0 && rect.right <= window.innerWidth && rect.height >= 34; }),
        secondaryBelowReview: Boolean(reviewLayout && secondary) && secondary.getBoundingClientRect().top >= reviewLayout.getBoundingClientRect().bottom,
        buttonLabels: buttons.map((button) => (button.textContent || '').trim()),
        filterValues: filters.map((filter) => filter.value),
        cardRect: card ? (() => {
          const rect = card.getBoundingClientRect();
          return { left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width), height: Math.round(rect.height) };
        })() : null
      };
    })()`,
  );
}

export async function validateGoldenReviewViewport(cdp, suggestionId) {
  const golden = await validateGoldenInboxControls(cdp);
  const stateMatrix = await validateGoldenStateMatrix(cdp);
  golden.stateMatrix = stateMatrix;
  const negative = await validateReviewCardGridNegative(cdp, suggestionId);
  const goldenPass =
    golden.complete &&
    stateMatrix.complete &&
    stateMatrix.negativePass &&
    golden.tokenMatch &&
    golden.hasNeutralLinks &&
    golden.financialDirectionColorFromTokens &&
    golden.selectedAriaPressed === "true" &&
    golden.disabledTokensMatch &&
    golden.disabledContrast >= 4.5 &&
    golden.disabledCursor === "not-allowed" &&
    golden.focusStyleDefined &&
    golden.contrast.every((ratio) => ratio >= 4.5) &&
    golden.row.minTouchHeight &&
    golden.nav.minTouchHeight &&
    golden.trigger.minTouchHeight &&
    golden.refresh.minTouchHeight &&
    golden.menuKeyboard.opened &&
    golden.menuKeyboard.closed &&
    golden.menuKeyboard.focusRestored;
  const negativePass =
    negative.baseline.contained &&
    negative.baseline.hitTarget &&
    negative.attackRejected &&
    negative.restorationPassed;
  return { golden, negative, goldenPass, negativePass };
}
