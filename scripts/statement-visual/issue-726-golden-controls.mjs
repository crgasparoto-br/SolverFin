import { join } from "node:path";

import { evaluate, screenshot, setViewport } from "./cdp.mjs";
import { validateGoldenStateMatrix } from "./issue-726-golden-state-matrix.mjs";
import { validateReviewCardGridNegative } from "./issue-726-inbox-controls.mjs";

// Golden Screen: verify neutral tabs, contextual actions, keyboard behavior and shared tokens.
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
        bottomBorder: css.borderBottomColor,
        minTouchHeight: rect.height >= 44,
        actualHeight: Math.round(rect.height),
      };
    };
    const colors = (color) => {
      const value = String(color || '').trim();
      if (/^#[0-9a-fA-F]{6}$/.test(value)) return [1,3,5].map((position) => parseInt(value.slice(position, position + 2), 16));
      return (value.match(/[0-9]+/g) || []).slice(0,3).map(Number);
    };
    const similar = (a, b) => {
      const x = colors(a), y = colors(b);
      return x.length === 3 && y.length === 3 && x.every((v, i) => v === y[i]);
    };
    const luminance = (color) => {
      const rgb = colors(color).map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return rgb.length === 3 ? (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) : 0;
    };
    const contrast = (a, b) => {
      const x = luminance(a), y = luminance(b);
      return Number(((Math.max(x, y) + 0.05)/(Math.min(x, y) + 0.05)).toFixed(2));
    };
    const row = style('.inbox-review-queue [data-review-select]');
    const nav = style('#inbox-tab-imports');
    const activeTab = style('#inbox-tab-reviews');
    const refresh = style('[data-review-refresh]');
    const status = style('.review-card.selected');
    const selected = document.querySelector('.review-card.selected [data-review-select]');
    const refreshNode = document.querySelector('[data-review-refresh]');
    if (!row || !nav || !activeTab || !refresh || !status || !selected || !refreshNode) return {complete: false};
    const originalDisabled = refreshNode.disabled;
    refreshNode.disabled = true;
    await new Promise((resolve) => setTimeout(resolve, 250));
    const disabledCss = getComputedStyle(refreshNode);
    const disabledOpacity = Number(disabledCss.opacity);
    const disabledCursor = disabledCss.cursor;
    const disabledContrast = contrast(disabledCss.color, disabledCss.backgroundColor);
    const disabledTokensMatch = similar(disabledCss.backgroundColor, token('neutral-control-hover')) &&
      similar(disabledCss.color, token('muted-text')) &&
      similar(disabledCss.borderTopColor, token('border')) && disabledOpacity === 1;
    refreshNode.disabled = originalDisabled;
    const neutralTokensMatch = (item) =>
      similar(item.background, token('surface')) &&
      similar(item.color, token('primary')) &&
      [token('border'), token('line')].some((border) => similar(item.border, border));
    const activeTabTokensMatch = similar(activeTab.background, token('primary-soft')) &&
      similar(activeTab.color, token('primary')) &&
      similar(activeTab.bottomBorder, token('primary'));
    const navTokensMatch = nav.background === 'rgba(0, 0, 0, 0)' &&
      similar(nav.color, token('muted-text'));
    const tabs = [...document.querySelectorAll('[role="tab"][data-inbox-tab]')];
    const panels = [...document.querySelectorAll('[role="tabpanel"][data-inbox-tab-panel]')];
    const tabSemantics = tabs.length === 4 && panels.length === 4 &&
      tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true').length === 1 &&
      tabs.every((tab) => document.getElementById(tab.getAttribute('aria-controls'))?.getAttribute('aria-labelledby') === tab.id);
    const importButton = document.querySelector('#inbox-panel-imports [data-open-dialog="csv-import-dialog"]');
    const messageButton = document.querySelector('#inbox-panel-messages [data-open-dialog="new-inbox-message-dialog"]');
    const contextActions = Boolean(importButton && messageButton &&
      importButton.closest('[data-inbox-tab-panel]') !== messageButton.closest('[data-inbox-tab-panel]'));
    const focusStyleDefined = Boolean([...document.styleSheets].some((sheet) => {
      try { return [...sheet.cssRules].some((rule) => String(rule.cssText).includes('.inbox-tab-list .inbox-tab.sf-tab:focus-visible')); }
      catch { return false; }
    }));
    return {
      complete: true, row, nav, activeTab, refresh, status,
      selectedAriaPressed: selected.getAttribute('aria-pressed'),
      tokenMatch: neutralTokensMatch(row) && neutralTokensMatch(refresh) && activeTabTokensMatch && navTokensMatch,
      contrast: [
        contrast(row.color, row.background), contrast(refresh.color, refresh.background),
        contrast(nav.color, token('surface')), contrast(activeTab.color, activeTab.background)
      ],
      disabledOpacity, disabledCursor, disabledContrast, disabledTokensMatch,
      tabSemantics, contextActions,
      financialDirectionColorFromTokens: document.querySelector('.review-risk') ?
        similar(getComputedStyle(document.querySelector('.review-risk')).backgroundColor, token('warning-surface')) : true,
      focusStyleDefined,
    };
  })()`,
  );
  const tabKeyboard = await evaluate(
    cdp,
    `(() => {
    const imports = document.getElementById('inbox-tab-imports');
    const messages = document.getElementById('inbox-tab-messages');
    const review = document.getElementById('inbox-tab-reviews');
    const importsPanel = document.getElementById('inbox-panel-imports');
    const messagePanel = document.getElementById('inbox-panel-messages');
    if (!imports || !messages || !review || !importsPanel || !messagePanel)
      return { arrow: false, home: false, actionVisible: false, restored: false };
    imports.focus();
    imports.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true, cancelable: true}));
    const arrow = document.activeElement === messages && messages.getAttribute('aria-selected') === 'true' && !messagePanel.hidden;
    const messageAction = messagePanel.querySelector('[data-open-dialog="new-inbox-message-dialog"]');
    const actionVisible = Boolean(messageAction && messageAction.getBoundingClientRect().height >= 44);
    messages.dispatchEvent(new KeyboardEvent('keydown', {key: 'Home', bubbles: true, cancelable: true}));
    const home = document.activeElement === review && review.getAttribute('aria-selected') === 'true';
    return { arrow, home, actionVisible, restored: !document.getElementById('inbox-panel-reviews').hidden && importsPanel.hidden && messagePanel.hidden };
  })()`,
  );
  return { ...rest, tabKeyboard };
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
      const panels = [...document.querySelectorAll('[data-inbox-tab-panel]')];
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
        otherPanelsHidden: Boolean(reviewLayout) && panels.length === 4 && panels.filter((panel) => !panel.hidden).length === 1 && !document.getElementById('inbox-panel-reviews')?.hidden,
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
    golden.tabSemantics &&
    golden.contextActions &&
    golden.financialDirectionColorFromTokens &&
    golden.selectedAriaPressed === "true" &&
    golden.disabledTokensMatch &&
    golden.disabledContrast >= 4.5 &&
    golden.disabledCursor === "not-allowed" &&
    golden.focusStyleDefined &&
    golden.contrast.every((ratio) => ratio >= 4.5) &&
    golden.row.minTouchHeight &&
    golden.nav.minTouchHeight &&
    golden.activeTab.minTouchHeight &&
    golden.refresh.minTouchHeight &&
    golden.tabKeyboard.arrow &&
    golden.tabKeyboard.home &&
    golden.tabKeyboard.actionVisible &&
    golden.tabKeyboard.restored;
  const negativePass =
    negative.baseline.contained &&
    negative.baseline.hitTarget &&
    negative.attackRejected &&
    negative.restorationPassed;
  return { golden, negative, goldenPass, negativePass };
}
