import assert from "node:assert/strict";

const EVIDENCE_FILE = "issue-693-notifications.json";

/** Derive browser behavior claims only from observed, exact-SHA Chrome evidence. */
export function collectNotifications693Evidence(report) {
  assert.equal(report.result, "passed", "Notifications Chrome scenario did not pass.");
  assert.equal(report.route, "/notificacoes", "Notifications evidence targets another route.");
  assert.ok(Array.isArray(report.viewports), "Notifications viewport evidence is missing.");

  const widths = new Set();
  for (const viewport of report.viewports) {
    assert.equal(viewport.route, "/notificacoes");
    assert.equal(viewport.rootVisible, true, "Notifications root is not visible.");
    assert.equal(viewport.emptyState, true, "Notifications empty state is not rendered.");
    assert.equal(viewport.preferenceCount, 12, "Notifications channel preferences are incomplete.");
    assert.equal(viewport.unreadCount, "0 não lidas", "Notifications unread count is incorrect.");
    assert.equal(viewport.noHorizontalOverflow, true, "Notifications page overflows horizontally.");
    assert.equal(
      viewport.viewportWidth,
      viewport.width,
      "Notifications viewport size was not applied.",
    );
    widths.add(viewport.width);
  }

  assert.ok(widths.has(390), "Notifications evidence lacks the mobile viewport.");
  assert.ok(
    [...widths].some((width) => width >= 1024),
    "Notifications evidence lacks a desktop viewport.",
  );
  assert.ok(
    Array.isArray(report.populatedViewports),
    "Populated notifications were not verified in Chrome.",
  );
  const populatedWidths = new Set();
  for (const viewport of report.populatedViewports) {
    assert.equal(viewport.route, "/notificacoes");
    assert.equal(viewport.profilePreserved, true, "SSR lost the populated financial profile.");
    assert.equal(viewport.rootVisible, true);
    assert.equal(viewport.receivedTabActive, true);
    assert.equal(viewport.emptyState, false, "The populated list was not rendered.");
    assert.equal(viewport.rowCount, 3, "Not all real notification fixtures are visible.");
    assert.equal(viewport.unreadCount, "2 não lidas");
    assert.equal(viewport.hasReadState, true);
    assert.equal(viewport.hasUnreadState, true);
    assert.equal(viewport.hasBudgetAmount, true, "BRL is missing from the populated list.");
    assert.equal(viewport.hasInvoiceAmount, true, "USD is missing from the populated list.");
    assert.equal(viewport.metadataCount, 3);
    assert.equal(viewport.visibleTitles, true);
    assert.equal(viewport.actionCount, 6);
    assert.equal(viewport.actionsVisible, true, "A row action is clipped or undersized.");
    assert.equal(viewport.noRowOverflow, true, "A notification row overflows horizontally.");
    assert.equal(viewport.noHorizontalOverflow, true, "Populated page overflows horizontally.");
    assert.equal(viewport.viewportWidth, viewport.width);
    populatedWidths.add(viewport.width);
  }
  for (const width of [320, 390, 1366]) {
    assert.ok(populatedWidths.has(width), "Missing populated screenshot at " + width + "px.");
  }
  assert.equal(report.populatedZoom?.width, 320);
  assert.equal(report.populatedZoom?.textScale, 200);
  assert.equal(report.populatedZoom?.noHorizontalOverflow, true);
  assert.equal(report.populatedZoom?.actionsWithinViewport, true);
  assert.equal(report.populatedActions?.passed, true);
  assert.equal(report.populatedActions?.restoredReadState, true);
  assert.equal(report.populatedActions?.unavailableSourceHandled, true);
  assert.equal(report.populatedActions?.safeOriginNavigated, true);
  assert.equal(report.populatedActions?.profilePreserved, true);
  assert.equal(report.fixtureCleanup?.passed, true);

  assert.equal(
    report.preference?.changedAndRestored,
    true,
    "Preference restoration was not observed.",
  );
  assert.equal(
    report.preference?.persistsAcrossReload,
    true,
    "Preference persistence across reload was not observed.",
  );
  assert.equal(
    report.navigation?.preservesProfileId,
    true,
    "Notification origin navigation lost the authorized profile selection.",
  );
  assert.equal(
    report.navigation?.preservesAnchor,
    true,
    "Notification origin navigation lost the safe destination anchor.",
  );
  return {
    files: [EVIDENCE_FILE],
    assertions: [
      "behavior:layout:desktop",
      "behavior:layout:mobile",
      "behavior:notification:navigation-context",
    ],
    observations: {
      widths: [...widths].sort((left, right) => left - right),
      emptyState: true,
      populatedWidths: [...populatedWidths].sort((left, right) => left - right),
      populatedRows: 3,
      populatedTextZoom: 200,
      realNotificationActions: report.populatedActions,
      preferredChannels: 12,
      preferencePersistence: true,
      navigationContext: report.navigation,
    },
  };
}
