import assert from "node:assert/strict";
import test from "node:test";

import { collectNotifications693Evidence } from "./issue-693-notifications-behavior-evidence.mjs";

function validReport() {
  return {
    route: "/notificacoes",
    result: "passed",
    viewports: [1366, 390].map((width) => ({
      width,
      viewportWidth: width,
      route: "/notificacoes",
      rootVisible: true,
      emptyState: true,
      preferenceCount: 12,
      unreadCount: "0 não lidas",
      noHorizontalOverflow: true,
    })),
    populatedViewports: [1366, 390, 320].map((width) => ({
      width,
      viewportWidth: width,
      route: "/notificacoes",
      profilePreserved: true,
      rootVisible: true,
      receivedTabActive: true,
      emptyState: false,
      rowCount: 3,
      unreadCount: "2 não lidas",
      hasReadState: true,
      hasUnreadState: true,
      hasBudgetAmount: true,
      hasInvoiceAmount: true,
      metadataCount: 3,
      visibleTitles: true,
      actionCount: 6,
      actionsVisible: true,
      noRowOverflow: true,
      noHorizontalOverflow: true,
    })),
    populatedZoom: {
      width: 320,
      textScale: 200,
      noHorizontalOverflow: true,
      actionsWithinViewport: true,
    },
    populatedActions: {
      passed: true,
      restoredReadState: true,
      unavailableSourceHandled: true,
      safeOriginNavigated: true,
      profilePreserved: true,
    },
    fixtureCleanup: { passed: true },
    preference: { changedAndRestored: true, persistsAcrossReload: true },
    navigation: { preservesProfileId: true, preservesAnchor: true },
  };
}

test("notifications behavior proof derives layout and preference assertions from both viewports", () => {
  const evidence = collectNotifications693Evidence(validReport());
  assert.deepEqual(evidence.assertions, [
    "behavior:layout:desktop",
    "behavior:layout:mobile",
    "behavior:notification:navigation-context",
  ]);
  assert.deepEqual(evidence.observations.widths, [390, 1366]);
  assert.equal(evidence.observations.preferencePersistence, true);
  assert.deepEqual(evidence.observations.populatedWidths, [320, 390, 1366]);
  assert.equal(evidence.observations.populatedRows, 3);
  assert.equal(evidence.observations.realNotificationActions.safeOriginNavigated, true);
});

test("notifications proof rejects missing mobile, wrong route and page errors", () => {
  for (const modify of [
    (report) => report.viewports.pop(),
    (report) => report.populatedViewports.pop(),
    (report) => delete report.populatedViewports,
    (report) => Object.assign(report.populatedViewports[0], { emptyState: true }),
    (report) => Object.assign(report.populatedViewports[1], { rowCount: 0 }),
    (report) => Object.assign(report.populatedViewports[2], { noHorizontalOverflow: false }),
    (report) => Object.assign(report.populatedViewports[1], { hasInvoiceAmount: false }),
    (report) => Object.assign(report.populatedViewports[0], { hasUnreadState: false }),
    (report) => Object.assign(report.populatedViewports[0], { actionsVisible: false }),
    (report) => Object.assign(report.populatedZoom, { actionsWithinViewport: false }),
    (report) => Object.assign(report.populatedActions, { restoredReadState: false }),
    (report) => Object.assign(report.populatedActions, { profilePreserved: false }),
    (report) => Object.assign(report.fixtureCleanup, { passed: false }),
    (report) => Object.assign(report, { route: "/inbox" }),
    (report) => Object.assign(report, { result: "failed" }),
    (report) => Object.assign(report.viewports[0], { noHorizontalOverflow: false }),
    (report) => Object.assign(report.viewports[1], { preferenceCount: 0 }),
    (report) => Object.assign(report.viewports[1], { unreadCount: "1 não lidas" }),
    (report) => Object.assign(report.preference, { persistsAcrossReload: false }),
    (report) => Object.assign(report.preference, { changedAndRestored: false }),
    (report) => Object.assign(report.navigation, { preservesProfileId: false }),
    (report) => Object.assign(report.navigation, { preservesAnchor: false }),
  ]) {
    const report = validReport();
    modify(report);
    assert.throws(() => collectNotifications693Evidence(report));
  }
});
