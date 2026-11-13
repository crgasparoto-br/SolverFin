import assert from "node:assert/strict";

import { renderNotificationsPage } from "./notifications-page.js";

const profileId = "33333333-3333-4333-8333-333333333331";
const originalFetch = globalThis.fetch;
const requestedOffsets: number[] = [];
const entry = (index: number) => ({
  id: "00000000-0000-4000-8000-" + String(index).padStart(12, "0"),
  occurredAt: "2026-11-12T12:00:00.000Z",
  readAt: null,
  facts: { code: "insight_available", severity: "info" },
});

globalThis.fetch = (async (input: string | URL | Request) => {
  const url = new URL(String(input));
  if (url.pathname === "/api/notifications/preferences") {
    return Response.json({ preferences: [] });
  }
  assert.equal(url.pathname, "/api/notifications");
  assert.equal(url.searchParams.get("profileId"), profileId);
  const offset = Number(url.searchParams.get("offset"));
  requestedOffsets.push(offset);
  assert.ok(offset === 10000 || offset === 10020, "use the requested deep page");
  return Response.json({
    items: offset === 10000 ? Array.from({ length: 20 }, (_, i) => entry(i)) : [entry(20)],
    total: 10021,
    unreadCount: 10021,
    nextOffset: offset === 10000 ? 10020 : null,
  });
}) as typeof fetch;

try {
  const page = await renderNotificationsPage(
    "demo",
    new URL("https://solverfin.invalid/notificacoes?offset=10000&profileId=" + profileId),
  );
  const nextUrl = "/notificacoes?offset=10020&profileId=" + profileId;
  assert.ok(page.includes('href="' + nextUrl + '"'), "Next must retain profile and offset");
  const lastPage = await renderNotificationsPage(
    "demo",
    new URL("https://solverfin.invalid" + nextUrl),
  );
  assert.deepEqual(requestedOffsets, [10000, 10020]);
  assert.ok(lastPage.includes("10021–10021 de 10021"));
  assert.ok(lastPage.includes('href="/notificacoes?offset=10000&profileId=' + profileId + '"'));
  assert.ok(!lastPage.includes(">Próxima</a>"), "last page must not offer another link");
  console.log("Notifications: deep history links preserve offset and profile across SSR pages.");
} finally {
  globalThis.fetch = originalFetch;
}
