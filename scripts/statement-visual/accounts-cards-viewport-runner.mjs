import assert from "node:assert/strict";
import { join } from "node:path";
import { navigate, screenshot, setViewport } from "./cdp.mjs";

/** Runs the complete A3 viewport scenario using the existing verified probes. */
export function createAccountsCardsViewportRunner({
  baseUrl,
  outputDir,
  scenarios,
  validateCdiSettings,
  validateCdiRealPersistence,
  validateGoldenActionToolbar,
  validateCdiSwitch,
  inspectPage,
  selectResource,
  validateFilter,
  validateKeyboardDialog,
  validateSaveFailureStates,
  validateConfirmationCancellation,
  validateLongContent,
  waitForA3,
  waitForDetail,
  waitFor,
}) {
  async function validateViewport(cdp, viewport) {
    await setViewport(cdp, viewport.width, viewport.height);
    await navigate(cdp, `${baseUrl}/contas-cartoes`);
    await waitForA3(cdp);

    const baseline = await inspectPage(cdp);
    assert.equal(baseline.archetype, "A3");
    assert.equal(baseline.detailLayoutVisible, true, "A3 DetailLayout is not visible.");
    assert.equal(baseline.masterVisible, true, "Master list is not visible.");
    assert.equal(baseline.listAmountsVisible, true, "Master amounts are missing.");
    assert.equal(baseline.masterTypeColumn, true, "Account subtype icon column is absent.");
    assert.equal(baseline.masterTypeFirst, true, "Type icon must be the first visible column.");
    assert.equal(
      baseline.masterInstitutionSecond,
      true,
      "Institution must be between type and account/card.",
    );
    assert.equal(
      baseline.amountKindInline,
      true,
      "Balance/limit icon must be inline with the amount.",
    );
    assert.equal(
      baseline.masterTypeTooltips,
      true,
      "Account/card type icons need accessible tooltips.",
    );
    assert.equal(
      baseline.compactRowMinHeight,
      true,
      "Master rows must use compact Golden Screen density.",
    );
    assert.equal(
      baseline.headerActionsHaveIcons,
      true,
      "Add-account and add-card buttons need icons.",
    );
    assert.equal(baseline.cdiColumnPresent, true, "The dedicated CDI column is missing.");
    assert.equal(
      baseline.cdiStateConsistent,
      true,
      "CDI labels must be account-only and match the active configuration.",
    );
    assert.equal(baseline.listIsPrimary, true, "Master list should dominate the detail.");
    assert.equal(baseline.detailVisible, true, "Selected detail is not visible.");
    assert.equal(baseline.noHorizontalOverflow, true, "A3 page overflows horizontally.");
    assert.equal(baseline.hasTabs, false, "Retired tab markup is still present.");
    assert.equal(
      baseline.legacyActionMenuCount,
      0,
      "Post-processed row action menus are still present.",
    );
    assert.ok(baseline.masterItemCount > 0, "No master resources were rendered.");
    assert.equal(baseline.selectedMasterCount, 1, "Exactly one master resource must be selected.");
    assert.equal(baseline.searchVisible, true, "Master search is unavailable.");
    assert.equal(
      baseline.controlsUseGoldenPrimitives,
      true,
      "Golden Screen shared button and filter variants are missing.",
    );
    assert.deepEqual(baseline.kindOptions, ["all", "account", "card"]);
    assert.equal(baseline.currencyOptions[0], "all");
    assert.equal(baseline.currencyOptionLabels[0], "Todas as moedas");
    assert.equal(
      baseline.currencyFilterLabelFits,
      true,
      "Selected currency filter label must remain readable at every supported viewport.",
    );
    assert.ok(baseline.currencyOptions.length > 1, "Currency filter has no resource options.");
    assert.deepEqual(baseline.statusOptions, ["all", "active", "inactive"]);
    assert.equal(baseline.loadingStatePresent, true, "Route loading state is not wired.");
    assert.equal(
      baseline.institutionLogosOnMaster,
      true,
      "Institution logo/fallback missing from a master resource.",
    );
    assert.equal(
      baseline.institutionImageMatchesGolden,
      true,
      "List institution logos must match the 44px and 11px Golden Statement frame.",
    );

    const account = await selectResource(cdp, "account");
    const card = await selectResource(cdp, "card");
    assert.ok(account, "Demo data has no account master resource.");
    assert.ok(card, "Demo data has no card master resource.");

    if (account) {
      await navigate(cdp, `${baseUrl}${account.href}`);
      await waitForDetail(cdp, "account");
      const measurements = await inspectPage(cdp);
      assert.equal(measurements.selectedKind, "account");
      const accountActions = await validateGoldenActionToolbar(cdp, "account");
      scenarios.push({
        kind: "golden-detail-toolbar",
        resourceKind: "account",
        viewport: `${viewport.width}x${viewport.height}`,
        measurements: accountActions,
      });
      assert.equal(
        measurements.financialContextVisible,
        true,
        "Account financial context is not visible in the selected list row and detail.",
      );
      assert.equal(
        measurements.institutionIdentityVisible,
        true,
        "Account institution identity is hidden.",
      );
      assert.equal(
        measurements.detailImageMatchesGolden,
        true,
        "Account detail logo must match Golden Statement image geometry.",
      );
      assert.equal(measurements.selectedMasterCount, 1);
      assert.equal(
        measurements.currencyContextVisible,
        true,
        "Account currency context is ambiguous.",
      );
      scenarios.push({
        kind: "page",
        resourceKind: "account",
        viewport: `${viewport.width}x${viewport.height}`,
        measurements,
      });
    }

    if (card) {
      await navigate(cdp, `${baseUrl}${card.href}`);
      await waitForDetail(cdp, "card");
      const measurements = await inspectPage(cdp);
      assert.equal(measurements.selectedKind, "card");
      const cardActions = await validateGoldenActionToolbar(cdp, "card");
      scenarios.push({
        kind: "golden-detail-toolbar",
        resourceKind: "card",
        viewport: `${viewport.width}x${viewport.height}`,
        measurements: cardActions,
      });
      assert.equal(
        measurements.financialContextVisible,
        true,
        "Card limit context is not visible in the selected list row and detail.",
      );
      assert.equal(
        measurements.institutionIdentityVisible,
        true,
        "Card institution identity is hidden.",
      );
      assert.equal(
        measurements.detailImageMatchesGolden,
        true,
        "Card detail logo must match Golden Statement image geometry.",
      );
      assert.equal(measurements.selectedMasterCount, 1);
      assert.equal(
        measurements.currencyContextVisible,
        true,
        "Card currency context is ambiguous.",
      );
      assert.equal(
        measurements.instrumentSectionVisible,
        true,
        "Card instruments are not inside the detail.",
      );
      scenarios.push({
        kind: "page",
        resourceKind: "card",
        viewport: `${viewport.width}x${viewport.height}`,
        measurements,
      });
    }

    const filter = await validateFilter(cdp);
    scenarios.push({
      kind: "filter",
      viewport: `${viewport.width}x${viewport.height}`,
      measurements: filter,
    });

    const explicitSelection = account ?? card;
    if (explicitSelection) {
      await navigate(cdp, `${baseUrl}${explicitSelection.href}`);
      await waitForDetail(cdp, account ? "account" : "card");
    }

    const dialog = await validateKeyboardDialog(cdp);
    scenarios.push({
      kind: "resource-dialog",
      viewport: `${viewport.width}x${viewport.height}`,
      measurements: dialog,
    });

    if (viewport.width === 1366) {
      const failureState = await validateSaveFailureStates(cdp);
      scenarios.push({
        kind: "save-failure",
        viewport: "1366x768",
        measurements: failureState,
      });

      const destructive = await validateConfirmationCancellation(cdp);
      scenarios.push({
        kind: "confirmation-cancel",
        viewport: "1366x768",
        measurements: destructive,
      });

      const longContent = await validateLongContent(cdp);
      scenarios.push({
        kind: "long-content",
        viewport: "1366x768",
        measurements: longContent,
      });
    }

    await screenshot(cdp, join(outputDir, `issue-612-accounts-cards-${viewport.suffix}.png`));
    if (viewport.width === 1366) {
      const cdiSettings = await validateCdiSettings(cdp);
      scenarios.push({
        kind: "cdi-settings",
        viewport: "1366x768",
        measurements: cdiSettings,
      });
      const cdiPersistence = await validateCdiRealPersistence(cdp);
      scenarios.push({
        kind: "cdi-real-api",
        viewport: "1366x768",
        measurements: cdiPersistence,
      });
      const cdi = await validateCdiSwitch(cdp);
      scenarios.push({
        kind: "cdi-toggle",
        viewport: "1366x768",
        measurements: cdi,
      });
    }
  }

  return validateViewport;
}
