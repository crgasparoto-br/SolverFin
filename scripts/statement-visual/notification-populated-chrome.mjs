import assert from "node:assert/strict";
import { join } from "node:path";

import { evaluate, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";

function profileUrl(baseUrl, fixtures) {
  return baseUrl + "/notificacoes?profileId=" + encodeURIComponent(fixtures.profileId);
}

export async function runPopulatedNotificationLayouts({ cdp, baseUrl, outputDir, fixtures }) {
  const viewports = [];
  for (const [width, height] of [
    [1366, 900],
    [390, 844],
    [320, 740],
  ]) {
    await setViewport(cdp, width, height);
    await navigate(cdp, profileUrl(baseUrl, fixtures));
    const result = await evaluate(
      cdp,
      [
        "(() => {",
        "const ids = " + JSON.stringify(fixtures.ids) + ";",
        "const root = document.querySelector('[data-financial-notifications]');",
        "const rows = [...(root?.querySelectorAll('.notifications-entry') ?? [])];",
        "const find = (id) => rows.find((row) => row.querySelector('[data-id=\"' + id + '\"]'));",
        "const budget = find(ids.budget), invoice = find(ids.invoice), insight = find(ids.insight);",
        "const actions = rows.flatMap((row) => [...row.querySelectorAll('.notifications-action')]);",
        "const within = (element) => { const rect = element.getBoundingClientRect();",
        "return rect.width > 0 && rect.height >= 36 && rect.left >= -1 && rect.right <= innerWidth + 1; };",
        "return {",
        "route: location.pathname, viewportWidth: innerWidth,",
        "profilePreserved: new URLSearchParams(location.search).get('profileId') === " +
          JSON.stringify(fixtures.profileId) +
          ",",
        "rootVisible: Boolean(root),",
        "receivedTabActive: root?.querySelector('.sf-tabs a[aria-current=\"page\"]')?.textContent?.trim() === 'Recebidas',",
        "emptyState: Boolean(root?.querySelector('.notifications-empty')),",
        "rowCount: rows.length,",
        "unreadCount: root?.querySelector('.notifications-feed header p')?.textContent?.trim(),",
        "hasReadState: insight?.dataset.readState === 'read',",
        "hasUnreadState: budget?.dataset.readState === 'unread' && invoice?.dataset.readState === 'unread',",
        "hasBudgetAmount: Boolean(budget?.querySelector('.notifications-amount')?.textContent.includes('R$')),",
        "hasInvoiceAmount: Boolean(invoice?.querySelector('.notifications-amount')?.textContent.includes('US$')),",
        "metadataCount: rows.filter((row) => row.querySelector('time[datetime]')).length,",
        "visibleTitles: rows.every((row) => Boolean(row.querySelector('h3')?.textContent?.trim())),",
        "actionCount: actions.length, actionsVisible: actions.every(within),",
        "noRowOverflow: rows.every((row) => { const rect = row.getBoundingClientRect();",
        "return rect.left >= -1 && rect.right <= innerWidth + 1; }),",
        "noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1",
        "}; })()",
      ].join("\n"),
    );
    for (const [name, expected] of Object.entries({
      route: "/notificacoes",
      viewportWidth: width,
      profilePreserved: true,
      rootVisible: true,
      receivedTabActive: true,
      emptyState: false,
      rowCount: fixtures.count,
      unreadCount: fixtures.unreadCount + " não lidas",
      hasReadState: true,
      hasUnreadState: true,
      hasBudgetAmount: true,
      hasInvoiceAmount: true,
      metadataCount: fixtures.count,
      visibleTitles: true,
      actionCount: fixtures.count * 2,
      actionsVisible: true,
      noRowOverflow: true,
      noHorizontalOverflow: true,
    })) {
      assert.equal(
        result[name],
        expected,
        "Populated notifications: " + name + " at " + width + "px",
      );
    }
    viewports.push({ width, height, ...result });
    await screenshot(cdp, join(outputDir, "issue-808-populated-" + width + ".png"));
  }

  await evaluate(cdp, "document.documentElement.style.fontSize = '200%'; true");
  const zoom = await evaluate(
    cdp,
    [
      "(() => {",
      "const actions = [...document.querySelectorAll('.notifications-entry .notifications-action')];",
      "const descriptions = [...document.querySelectorAll('.notifications-entry .notifications-description')];",
      "return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth,",
      "minDescriptionWidth: Math.min(...descriptions.map((element) => element.getBoundingClientRect().width)),",
      "noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,",
      "actionsWithinViewport: actions.every((button) => {",
      "const box = button.getBoundingClientRect();",
      "return box.left >= -1 && box.right <= innerWidth + 1; }),",
      "actionsComfortable: actions.every((button) => button.getBoundingClientRect().height >= 44)",
      "}; })()
    ].join("\n"),
  );
  // Keep the row title visible below the sticky header at 200% text scaling.
  await evaluate(
    cdp,
    "(() => { const row = document.querySelector('.notifications-entry'); if (!row) return false; window.scrollTo(0, Math.max(0, window.scrollY + row.getBoundingClientRect().top - 120)); return true; })()",
  );
  await screenshot(cdp, join(outputDir, "issue-808-populated-320-text200.png"));
  assert.equal(zoom.width, 320);
  assert.equal(
    zoom.noHorizontalOverflow,
    true,
    "Populated notifications overflow at 200% text: scrollWidth=" + zoom.scrollWidth,
  );
  assert.equal(zoom.actionsWithinViewport, true, "Notification actions clip at 200% text");
  assert.equal(zoom.actionsComfortable, true, "Notification actions must remain at least 44px high");
  assert.ok(
    zoom.minDescriptionWidth >= 180,
    "Notification text becomes a narrow letter-by-letter column at 200%: " +
      zoom.minDescriptionWidth,
  );
  return { viewports, zoom: { ...zoom, textScale: 200 } };
}

export async function verifyPopulatedNotificationActions({ cdp, baseUrl, fixtures }) {
  await setViewport(cdp, 390, 844);
  await navigate(cdp, profileUrl(baseUrl, fixtures));
  const unavailable = await evaluate(
    cdp,
    [
      "(async () => {",
      "const button = document.querySelector('[data-notification-target=\"" +
        fixtures.ids.invoice +
        "\"]');",
      "if (!button) return false;",
      "button.click();",
      "for (let i = 0; i < 60; i += 1) {",
      "const status = document.querySelector('[data-notifications-status]')?.textContent?.trim();",
      "if (status === 'Origem indisponível.' && !button.disabled) return true;",
      "await new Promise((resolve) => setTimeout(resolve, 50));",
      "}",
      "return false;",
      "})()",
    ].join("\n"),
  );
  assert.equal(unavailable, true, "Unlinked notification should recover without navigation");

  for (const shouldRead of [true, false]) {
    const clicked = await evaluate(
      cdp,
      [
        "(() => {",
        "const button = document.querySelector('[data-id=\"" +
          fixtures.ids.budget +
          '"][data-notification-read="' +
          shouldRead +
          "\"]');",
        "if (!button) return false; button.click(); return true;",
        "})()",
      ].join("\n"),
    );
    assert.equal(clicked, true, "Read/unread action missing");
    let persisted = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await sleep(150);
      const state = await evaluate(
        cdp,
        "document.querySelector('[data-id=\"" +
          fixtures.ids.budget +
          "\"]')?.closest('.notifications-entry')?.dataset.readState",
      ).catch(() => null);
      if (state === (shouldRead ? "read" : "unread")) {
        persisted = true;
        break;
      }
    }
    assert.equal(persisted, true, "Read/unread did not persist in reloaded SSR");
  }

  const clicked = await evaluate(
    cdp,
    "(() => { const button = document.querySelector('[data-notification-target=\"" +
      fixtures.ids.budget +
      "\"]'); if (!button) return false; button.click(); return true; })()",
  );
  assert.equal(clicked, true, "Budget notification has no origin action");
  let destination;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await sleep(150);
    destination = await evaluate(
      cdp,
      "({route: location.pathname, profileId: new URLSearchParams(location.search).get('profileId')})",
    ).catch(() => null);
    if (destination?.route === "/orcamentos") break;
  }
  assert.equal(destination?.route, "/orcamentos", "Real notification origin did not open");
  assert.equal(destination.profileId, fixtures.profileId, "Real origin lost financial profile");
  return {
    passed: true,
    restoredReadState: true,
    unavailableSourceHandled: unavailable,
    safeOriginNavigated: true,
    profilePreserved: true,
  };
}
