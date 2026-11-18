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
      preferredChannels: 12,
      preferencePersistence: true,
      navigationContext: report.navigation,
    },
  };
}
