import { cardsPageMeasurementExpressionPart1 } from "./cards-interface-measurement-part-1.mjs";
import { cardsPageMeasurementExpressionPart2 } from "./cards-interface-measurement-part-2.mjs";
import { join } from "node:path";
import { evaluate, screenshot } from "./cdp.mjs";

export async function validateCardsPage(
  cdp,
  viewportKind,
  captureName = viewportKind,
  { check, outputDir, validateFirstFoldNegativeControl },
) {
  const measurements = await evaluate(
    cdp,
    cardsPageMeasurementExpressionPart1() + cardsPageMeasurementExpressionPart2(),
  );

  check(measurements.archetype === "A3", "Cards route is not rendered as A3", measurements);
  check(measurements.noHorizontalOverflow, "Cards page has horizontal overflow", measurements);
  check(
    measurements.categoryToneContract,
    "Category backgrounds must match Extrato: green in, red out, gray transfer",
    measurements,
  );
  check(
    measurements.fullWidthUsesCanonicalShell,
    "Golden Screen: cards must fill the canonical main area without a narrower page cap",
    measurements,
  );
  check(
    measurements.masterVisible && measurements.detailVisible,
    "Master-detail hierarchy is incomplete",
    measurements,
  );
  check(
    measurements.instrumentLimitsBelowIdentity,
    "Instrument limits must appear below identifiers and start with Limite",
    measurements,
  );
  check(
    measurements.iconOnlyPurchaseStatuses && measurements.statusMenuOperable,
    "Purchase status icon must open an accessible, correctly placed reconciliation menu",
    measurements,
  );
  check(measurements.invoiceHeaderVisible, "Selected invoice context is not visible", measurements);
  check(
    measurements.summaryUnboxed,
    "Design skill: summary metrics must not regress into bordered tile cards",
    measurements,
  );
  check(
    measurements.mobileContextConcise && measurements.mobileSummaryConcise,
    "Design skill: mobile card selection or summary wastes first-fold space",
    measurements,
  );
  check(
    measurements.invoiceFactsReadable,
    "Invoice closing, due date or currency is unreadable",
    measurements,
  );
  check(
    measurements.invoiceActionsSeparated,
    "Invoice primary and secondary actions overlap",
    measurements,
  );
  check(
    measurements.invoiceAmountLeads && measurements.payNextToAmount,
    "Invoice value must lead and settlement must remain attached to it",
    measurements,
  );
  check(
    measurements.invoiceSecondaryFooter,
    "Invoice secondary operations must stay in the footer below the decision",
    measurements,
  );
  check(
    measurements.mobileInvoiceActionsCompact,
    "Mobile invoice actions are not aligned",
    measurements,
  );
  check(
    measurements.monthTitleSingleLine,
    "Selected month wraps or overflows on mobile",
    measurements,
  );
  check(
    measurements.actionsBelongToContext,
    "Golden Screen: register, document, close and settle actions must stay with their respective context",
    measurements,
  );
  check(
    measurements.periodsDoNotOverlap,
    "Invoice period navigation overlaps at this viewport",
    measurements,
  );
  check(
    measurements.monthPopupInsideViewport && measurements.monthPopupNegativeRejected,
    "Invoice month picker escapes the viewport or its negative control fails",
    measurements,
  );
  check(measurements.primaryAmountVisible, "Invoice amount due is not visible", measurements);
  check(
    measurements.purchaseActionSecondary,
    "Purchase action competes with invoice decision",
    measurements,
  );
  check(measurements.closeActionSecondary, "Close action competes with settlement", measurements);
  check(
    measurements.payActionPrimary,
    "Settlement is not the invoice primary action",
    measurements,
  );
  check(
    measurements.primaryInvoiceActionCount <= 1,
    "Invoice has competing primary actions",
    measurements,
  );
  check(
    measurements.advancedFiltersCollapsed,
    "Unused advanced filters occupy the viewport",
    measurements,
  );
  check(measurements.statusVisible, "Invoice status is not visible", measurements);
  check(
    measurements.invoiceCopy.includes("Fechamento") &&
      measurements.invoiceCopy.includes("Vencimento"),
    "Invoice closing and due dates are not explicit",
    measurements,
  );
  check(
    measurements.settlementCopy.includes("não é uma nova compra"),
    "Settlement semantics are not explicit",
    measurements,
  );
  check(
    measurements.currencies.length > 0 && measurements.currencies.every(Boolean),
    "Money is rendered without explicit currency",
    measurements,
  );
  check(measurements.cardSelect, "Card master selector is unavailable", measurements);
  check(
    measurements.invoicePeriodNavigation &&
      measurements.previousPeriodControl &&
      measurements.nextPeriodControl &&
      measurements.monthInput,
    "Invoice period navigation is incomplete",
    measurements,
  );
  check(measurements.searchVisible, "Purchase search is unavailable", measurements);
  check(measurements.filterCount >= 3, "Reconciliation filters are incomplete", measurements);
  check(measurements.rowCount > 0, "Cards page rendered no purchase rows", measurements);
  check(
    measurements.categoryColumnHeader && measurements.categoryCellsSeparate,
    "Golden Screen: purchase category must have its own visible table column",
    measurements,
  );
  check(
    measurements.iconOnlyPurchaseStatuses && measurements.statusIconNegativeRejected,
    "Golden Screen: purchase situations must be accessible SVG pictograms, not text badges",
    measurements,
  );
  check(
    measurements.minimumActionTarget >= 44 &&
      measurements.actionTargetBefore &&
      measurements.actionTargetNegativeRejected,
    "Golden Screen: purchase menu actions need 44px touch targets and a rejecting negative control",
    measurements,
  );
  check(
    measurements.shellIsLight &&
      measurements.shellNegativeRejected &&
      measurements.noRepeatedHeader,
    "Golden Screen: card shell must be light and have no repeated visible route title",
    measurements,
  );
  check(
    measurements.purchaseActionIcons,
    "Purchase actions must use shared SVG iconography",
    measurements,
  );
  check(
    measurements.resultAnnouncement.includes("compra"),
    "Purchase result count is not announced",
    measurements,
  );

  if (viewportKind === "desktop") {
    check(
      measurements.firstPurchaseLegible &&
        measurements.firstPurchaseRowBottom <= measurements.viewport.height - 12,
      "Golden Screen: the full first purchase (description and amount) must be readable in the first desktop fold",
      measurements,
    );
    check(
      measurements.sidebarBefore &&
        measurements.sidebarNegativeRejected &&
        measurements.masterFactsVisible,
      "Golden Screen: card information must be visible in a separate left panel; stacking is a regression",
      measurements,
    );
    check(
      measurements.detailWidth >= 600,
      "Golden Screen: restoring the left panel must not crush the invoice or purchase table",
      measurements,
    );
    check(
      measurements.tableHeaderVisible,
      "Purchase table header is not visible on desktop",
      measurements,
    );
    check(
      measurements.minimumRowHeight >= 40,
      "Purchase rows are too small on desktop",
      measurements,
    );
  } else {
    check(
      measurements.primaryAmountTop < measurements.viewport.height * 0.62 &&
        measurements.primaryAmountTop - measurements.invoiceHeaderTop < 88,
      "Golden Screen: invoice amount must lead the mobile invoice decision without preceding metadata blocks",
      measurements,
    );
    check(
      measurements.heroAction.height >= 44,
      "Primary purchase action is smaller than 44px",
      measurements,
    );
    check(measurements.searchHeight >= 40, "Purchase search is too small on mobile", measurements);
    check(
      !measurements.tableHeaderVisible,
      "Desktop purchase header remains visible on mobile",
      measurements,
    );
    check(
      measurements.mobileDateLabel.includes("Data"),
      "Mobile purchase date lost its contextual label",
      measurements,
    );
    check(
      !measurements.mobileStatusLabel.includes("Situação"),
      "Mobile purchase status duplicates the icon label instead of using tooltip/aria",
      measurements,
    );
    check(
      measurements.mobileCategoryLabel.includes("Categoria"),
      "Mobile purchase category lost its contextual label",
      measurements,
    );
    check(
      measurements.minimumActionTarget >= 44,
      "Purchase action target is smaller than 44px on mobile",
      measurements,
    );
  }

  const negative = await validateFirstFoldNegativeControl(cdp, viewportKind);
  check(
    negative.acceptedBefore && !negative.acceptedDuring && negative.acceptedAfter,
    "Golden Screen negative control failed to reject content pushed below the fold",
    negative,
  );
  measurements.firstFoldNegative = negative;
  await screenshot(cdp, join(outputDir, `cards-${captureName}.png`));

  // Regression: the global button:hover rule must never turn a contextual action
  // into a dark primary button with unreadable dark text.
  const hoverTarget = await evaluate(
    cdp,
    `(() => {
      const button = document.querySelector('.cards-purchase-status-menu [data-set-purchase-status]:not(:disabled)');
      const details = button?.closest('[data-purchase-status-control]');
      if (!button || !details) return null;
      details.open = true;
      button.scrollIntoView({ block: 'center', inline: 'nearest' });
      const rect = button.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        visible: rect.width >= 44 && rect.height >= 44 &&
          rect.top >= 0 && rect.bottom <= window.innerHeight &&
          rect.left >= 0 && rect.right <= window.innerWidth,
      };
    })()`,
  );
  check(
    Boolean(hoverTarget?.visible),
    "Status menu action is outside the visible viewport",
    hoverTarget,
  );
  if (hoverTarget?.visible) {
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: hoverTarget.x,
      y: hoverTarget.y,
    });
    const hover = await evaluate(
      cdp,
      `(() => {
        const button = document.querySelector('.cards-purchase-status-menu [data-set-purchase-status]:not(:disabled)');
        if (!button) return { hovered: false };
        const probe = document.createElement('span');
        probe.style.background = 'var(--neutral-control-hover)';
        probe.style.color = 'var(--neutral-control-text-hover)';
        document.body.append(probe);
        const expectedBackground = getComputedStyle(probe).backgroundColor;
        const expectedForeground = getComputedStyle(probe).color;
        probe.remove();
        const style = getComputedStyle(button);
        const background = style.backgroundColor;
        const foreground = style.color;
        const luminance = (value) => {
          const rgb = value.match(/[\\d.]+/g)?.slice(0, 3).map(Number) || [0, 0, 0];
          const channels = rgb.map((value) => {
            const normalized = value / 255;
            return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        };
        // A transparent action is painted over its ancestors, not over black.
        const ancestors = [];
        for (let node = button; node; node = node.parentElement) ancestors.unshift(node);
        let compositedRgb = [255, 255, 255];
        for (const node of ancestors) {
          const channels = (getComputedStyle(node).backgroundColor.match(/[\\d.]+/g) || []).map(Number);
          if (channels.length < 3) continue;
          const alpha = channels[3] ?? 1;
          compositedRgb = compositedRgb.map((value, index) =>
            channels[index] * alpha + value * (1 - alpha)
          );
        }
        const effectiveBackground = 'rgb(' + compositedRgb.map(Math.round).join(', ') + ')';
        const a = luminance(effectiveBackground);
        const b = luminance(foreground);
        return {
          hovered: button.matches(':hover'),
          enabled: !button.disabled,
          background,
          effectiveBackground,
          compositedRgb,
          foreground,
          expectedBackground,
          expectedForeground,
          contrastRatio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        };
      })()`,
    );
    check(
      hover.hovered &&
        hover.enabled &&
        hover.contrastRatio >= 4.5 &&
        hover.compositedRgb.every((value) => value >= 210),
      "Golden Screen status option must remain light with readable text on hover",
      hover,
    );
    measurements.statusMenuHover = hover;
    await screenshot(cdp, join(outputDir, `cards-status-menu-${captureName}.png`));
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
    await evaluate(
      cdp,
      `document.querySelectorAll('[data-purchase-status-control]').forEach((node) => { node.open = false; })`,
    );
  }
  return measurements;
}
