import assert from "node:assert/strict";

import { renderNotificationsPage } from "./notifications-page.js";

const profileId = "33333333-3333-4333-8333-333333333331";
const originalFetch = globalThis.fetch;
const types = [
  "financial.insight.available.v1",
  "financial.budget.threshold.v1",
  "financial.invoice.due.v1",
  "financial.balance.warning.v1",
];
const preferences = types.flatMap((type) =>
  ["in_app", "push", "email"].map((channel) => ({
    type,
    channel,
    enabled: channel === "in_app",
  })),
);
const entryId = "00000000-0000-4000-8000-000000000808";
let failFeed = false;
let failPreferences = false;

globalThis.fetch = (async (input: string | URL | Request) => {
  const url = new URL(String(input));
  assert.equal(url.searchParams.get("profileId"), profileId);
  if (url.pathname === "/api/notifications/preferences") {
    return failPreferences
      ? Response.json({ error: { message: "Preferências indisponíveis." } }, { status: 503 })
      : Response.json({ preferences });
  }
  assert.equal(url.pathname, "/api/notifications");
  assert.equal(url.searchParams.get("limit"), "20");
  assert.equal(url.searchParams.get("offset"), "20");
  return failFeed
    ? Response.json({ error: { message: "Avisos indisponíveis." } }, { status: 503 })
    : Response.json({
        items: [
          {
            id: entryId,
            occurredAt: "2026-11-19T12:00:00.000Z",
            readAt: null,
            facts: {
              code: "budget_threshold",
              severity: "warning",
              currency: "USD",
              amountMinor: 12345,
              effectiveOn: "2026-11-30",
            },
          },
          {
            id: "00000000-0000-4000-8000-000000000809",
            occurredAt: "2026-11-18T12:00:00.000Z",
            readAt: "2026-11-19T13:00:00.000Z",
            facts: { code: "insight_available", severity: "info", effectiveOn: "<svg/onload=alert(1)>" },
          },
        ],
        total: 22,
        unreadCount: 1,
        nextOffset: null,
      });
}) as typeof fetch;

try {
  const base = "https://solverfin.invalid/notificacoes?offset=20&profileId=" + profileId;
  const received = await renderNotificationsPage("demo", new URL(base));
  assert.ok(received.includes('data-notifications-view="recebidas"'));
  assert.ok(received.includes('aria-label="Áreas de notificações"'));
  assert.ok(
    received.includes(
      'href="/notificacoes?offset=20&amp;profileId=' + profileId + '" aria-current="page"',
    ),
    "Active received tab must retain the offset and profile",
  );
  assert.ok(received.includes("Caixa de entrada"));
  assert.ok(received.includes("1 não lidas"));
  assert.ok(received.includes("Limite do orçamento"));
  assert.ok(received.includes("Um orçamento atingiu seu limite configurado."));
  assert.ok(received.includes('data-read-state="unread"'));
  assert.ok(received.includes('data-read-state="read"'));
  assert.ok(received.includes("Marcar lida"));
  assert.ok(received.includes("Marcar não lida"));
  assert.ok(received.includes("123,45"), "Original USD currency minor-unit value is kept");
  assert.ok(received.includes("Referência: 2026-11-30"));
  assert.ok(received.includes("&lt;svg/onload=alert(1)&gt;"));
  assert.ok(!received.includes("<svg/onload="), "Untrusted reference must be escaped");
  assert.ok(received.includes('data-notification-target="' + entryId + '"'));
  assert.ok(!received.includes('class="notifications-section notifications-preferences"'));
  assert.ok(!received.includes('data-preference-event="'), "Inactive preferences are not mounted");
  assert.ok(
    received.includes('href="/notificacoes?tab=preferencias&amp;offset=20&amp;profileId=' + profileId + '"'),
    "Preferences tab must preserve the selected financial profile",
  );

  const configured = await renderNotificationsPage(
    "demo",
    new URL(base + "&tab=preferencias"),
  );
  assert.ok(configured.includes('data-notifications-view="preferencias"'));
  assert.ok(configured.includes("Preferências de canais"));
  assert.ok(configured.includes('aria-current="page"'));
  assert.equal((configured.match(/class="notifications-preference-group"/g) ?? []).length, 4);
  assert.equal((configured.match(/data-preference-event=/g) ?? []).length, 12);
  assert.ok(configured.includes('data-preference-channel="in_app"'));
  assert.ok(configured.includes('data-preference-channel="push"'));
  assert.ok(configured.includes('data-preference-channel="email"'));
  assert.ok(configured.includes("Push e e-mail ainda não enviam mensagens"));
  assert.ok(!configured.includes('class="notifications-section notifications-feed"'));
  assert.ok(!configured.includes('data-notification-read="'));
  assert.ok(
    configured.includes('href="/notificacoes?offset=20&amp;profileId=' + profileId + '"'),
    "Returning to received notifications must keep pagination and the profile",
  );

  failFeed = true;
  const failedFeed = await renderNotificationsPage("demo", new URL(base));
  assert.ok(failedFeed.includes('role="alert">Avisos indisponíveis.</p>'));
  assert.ok(!failedFeed.includes("Limite do orçamento"));
  failFeed = false;

  failPreferences = true;
  const failedPreferences = await renderNotificationsPage(
    "demo",
    new URL(base + "&tab=preferencias"),
  );
  assert.ok(failedPreferences.includes('role="alert">Preferências indisponíveis.</p>'));
  assert.ok(!failedPreferences.includes('data-preference-event="'));
  failPreferences = false;

  console.log(
    "Notifications: SSR tabs, profile/deep links, read states, currency, preferences and independent errors.",
  );
} finally {
  globalThis.fetch = originalFetch;
}
