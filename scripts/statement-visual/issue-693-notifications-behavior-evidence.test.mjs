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
    preference: { changedAndRestored: true, persistsAcrossReload: true },
  };
}

test("notifications behavior proof derives layout and preference assertions from both viewports", () => {
  const evidence = collectNotifications693Evidence(validReport());
  assert.deepEqual(evidence.assertions, ["behavior:layout:desktop", "behavior:layout:mobile"]);
  assert.deepEqual(evidence.observations.widths, [390, 1366]);
  assert.equal(evidence.observations.preferencePersistence, true);
});

test("notifications proof rejects missing mobile, wrong route and page errors", () => {
  for (const modify of [
    (report) => report.viewports.pop(),
    (report) => Object.assign(report, { route: "/inbox" }),
    (report) => Object.assign(report, { result: "failed" }),
    (report) => Object.assign(report.viewports[0], { noHorizontalOverflow: false }),
    (report) => Object.assign(report.viewports[1], { preferenceCount: 0 }),
    (report) => Object.assign(report.viewports[1], { unreadCount: "1 não lidas" }),
    (report) => Object.assign(report.preference, { persistsAcrossReload: false }),
    (report) => Object.assign(report.preference, { changedAndRestored: false }),
  ]) {
    const report = validReport();
    modify(report);
    assert.throws(() => collectNotifications693Evidence(report));
  }
});
