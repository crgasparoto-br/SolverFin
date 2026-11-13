import { renderPageContainer, renderPageHeader } from "../design-system/primitives.js";

import { apiGet } from "./api.js";
import { icon } from "./icons.js";
import { renderAuthenticatedShellDocument } from "./shell.js";
import { sharedShellStyles } from "./shared-styles.js";

interface NotificationItem {
  id: string;
  occurredAt: string;
  readAt: string | null;
  facts: {
    code: string;
    severity: string;
    currency?: string;
    amountMinor?: number;
    effectiveOn?: string;
  };
}

interface NotificationPage {
  items: NotificationItem[];
  total: number;
  unreadCount: number;
  nextOffset: number | null;
}

interface NotificationPreference {
  type: string;
  channel: string;
  enabled: boolean;
}

const EVENT_LABELS: Record<string, string> = {
  "financial.insight.available.v1": "Insight disponível",
  "financial.budget.threshold.v1": "Limite do orçamento",
  "financial.invoice.due.v1": "Vencimento de fatura",
  "financial.balance.warning.v1": "Atenção ao saldo",
};
const CHANNEL_LABELS: Record<string, string> = {
  in_app: "No aplicativo",
  push: "Push · indisponível",
  email: "E-mail · indisponível",
};
const FACT_LABELS: Record<string, string> = {
  insight_available: "Um insight financeiro está disponível para revisão.",
  budget_threshold: "Um orçamento atingiu seu limite configurado.",
  invoice_due: "Existe uma fatura com vencimento informado.",
  balance_warning: "Existe um alerta de saldo calculado pelo sistema.",
};

export async function renderNotificationsPage(
  token: string,
  url: URL = new URL("https://solverfin.invalid/notificacoes"),
): Promise<string> {
  const requestedOffset = Number(url.searchParams.get("offset") ?? 0);
  const offset =
    Number.isSafeInteger(requestedOffset) && requestedOffset >= 0
      ? requestedOffset
      : 0;
  const profileId = url.searchParams.get("profileId");
  const profileSuffix = profileId ? "&profileId=" + encodeURIComponent(profileId) : "";
  const [feed, preferences] = await Promise.all([
    apiGet<NotificationPage>(token, "/api/notifications?limit=20&offset=" + offset + profileSuffix),
    apiGet<{ preferences: NotificationPreference[] }>(
      token,
      "/api/notifications/preferences?" + profileSuffix.slice(1),
    ),
  ]);
  const content = [
    '<section class="notifications-panel" data-financial-notifications>',
    renderPageHeader({
      eyebrow: "Atividade financeira",
      title: "Notificações",
      description: "Avisos derivados de fatos financeiros verificáveis no seu perfil ativo.",
    }),
    '<div class="notifications-layout">',
    '<section class="panel notifications-feed" aria-label="Notificações recebidas">',
    '<header><h2>Recebidas</h2><p aria-live="polite">',
    feed.ok ? String(feed.data.unreadCount) + " não lidas" : "Não foi possível carregar",
    "</p></header>",
    feed.ok
      ? renderFeed(feed.data, offset, profileId)
      : '<p role="alert">' + escapeHtml(feed.error) + "</p>",
    "</section>",
    '<aside class="panel notifications-preferences" aria-label="Preferências de notificações">',
    "<h2>Preferências</h2>",
    '<p class="muted">Defina quais eventos deseja receber em cada canal.</p>',
    preferences.ok
      ? renderPreferences(preferences.data.preferences)
      : '<p role="alert">' + escapeHtml(preferences.error) + "</p>",
    '<p class="muted">Push e e-mail ainda não realizam envios. A preferência será preservada.</p>',
    "</aside>",
    "</div>",
    '<p role="status" aria-live="polite" data-notifications-status></p>',
    "</section>",
    "<script>" + notificationsControllerScript() + "</script>",
  ].join("");
  return renderAuthenticatedShellDocument({
    activePathname: "/notificacoes",
    currentLabel: "Notificações",
    styles: sharedShellStyles() + "\n" + notificationsPageStyles(),
    content: renderPageContainer({ className: "notifications-page", childrenHtml: content }),
  });
}

function renderFeed(page: NotificationPage, offset: number, profileId: string | null): string {
  if (page.items.length === 0) {
    return (
      '<div class="notifications-empty"><h3>Nenhuma notificação</h3>' +
      "<p>Os eventos financeiros disponíveis aparecerão aqui, sem preencher com dados fictícios.</p></div>"
    );
  }
  const currentProfile = profileId ? "&profileId=" + encodeURIComponent(profileId) : "";
  const previous = offset > 0 ? Math.max(offset - 20, 0) : null;
  return [
    '<ol class="notifications-list">',
    page.items.map(renderNotification).join(""),
    "</ol>",
    '<nav class="notifications-pagination" aria-label="Paginação de notificações">',
    previous === null
      ? ""
      : '<a href="/notificacoes?offset=' + previous + currentProfile + '">Anterior</a>',
    "<span>" + (offset + 1) + "–" + (offset + page.items.length) + " de " + page.total + "</span>",
    page.nextOffset === null
      ? ""
      : '<a href="/notificacoes?offset=' + page.nextOffset + currentProfile + '">Próxima</a>',
    "</nav>",
  ].join("");
}

function renderNotification(item: NotificationItem): string {
  const title = FACT_LABELS[item.facts.code] ?? "Notificação indisponível";
  const occurredAt = new Date(item.occurredAt);
  const dateText = Number.isNaN(occurredAt.getTime())
    ? "Data indisponível"
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(occurredAt);
  const hasAmount =
    item.facts.currency &&
    typeof item.facts.amountMinor === "number" &&
    Number.isSafeInteger(item.facts.amountMinor);
  const amount = hasAmount
    ? formatMinorAmount(item.facts.amountMinor as number, item.facts.currency as string)
    : null;
  const id = escapeHtml(item.id);
  return [
    '<li class="notifications-entry" data-read-state="' + (item.readAt ? "read" : "unread") + '">',
    "<div><h3>" + escapeHtml(title) + "</h3>",
    "<p>" + escapeHtml(dateText) + (amount ? " · " + escapeHtml(amount) : "") + "</p>",
    item.facts.effectiveOn ? "<p>Referência: " + escapeHtml(item.facts.effectiveOn) + "</p>" : "",
    "</div>",
    '<div class="notifications-entry-actions">',
    '<button type="button" class="button-neutral" data-notification-target="' + id + '">',
    icon("link", 14) + " Ver origem</button>",
    '<button type="button" class="button-neutral" data-notification-read="' +
      (item.readAt ? "false" : "true") +
      '" data-id="' +
      id +
      '">',
    item.readAt ? "Marcar não lida" : "Marcar lida",
    "</button></div></li>",
  ].join("");
}

function renderPreferences(preferences: NotificationPreference[]): string {
  const grouped = Object.entries(EVENT_LABELS).map(([type, title]) => {
    const channels = preferences.filter((preference) => preference.type === type);
    if (channels.length === 0) return "";
    return (
      '<fieldset class="notifications-preference-group">' +
      "<legend>" +
      escapeHtml(title) +
      "</legend>" +
      channels
        .map((preference) => {
          const channel = CHANNEL_LABELS[preference.channel];
          if (!channel) return "";
          return [
            '<label class="notifications-preference">',
            '<span class="notifications-preference-channel">' + escapeHtml(channel) + "</span>",
            '<input type="checkbox" data-preference-event="' +
              escapeHtml(preference.type) +
              '" data-preference-channel="' +
              escapeHtml(preference.channel) +
              '" ' +
              (preference.enabled ? "checked" : "") +
              " />",
            "</label>",
          ].join("");
        })
        .join("") +
      "</fieldset>"
    );
  });
  return '<div class="notifications-preference-list">' + grouped.join("") + "</div>";
}

function notificationsControllerScript(): string {
  return [
    "(function () {",
    "const root = document.querySelector('[data-financial-notifications]');",
    "if (!root) return;",
    "const status = document.querySelector('[data-notifications-status]');",
    "const suffix = new URLSearchParams(location.search).get('profileId');",
    "const profile = suffix ? '?profileId=' + encodeURIComponent(suffix) : '';",
    "async function send(path, method, body) {",
    "  const response = await fetch(path + profile, { method, headers: { 'content-type': 'application/json' },",
    "    body: JSON.stringify(body), credentials: 'same-origin' });",
    "  if (!response.ok) throw new Error('Não foi possível salvar a alteração.');",
    "  return response.json();",
    "}",
    "root.addEventListener('click', async (event) => {",
    "  const target = event.target;",
    "  if (!(target instanceof Element)) return;",
    "  const read = target.closest('[data-notification-read]');",
    "  const navigation = target.closest('[data-notification-target]');",
    "  if (!read && !navigation) return;",
    "  const id = (read || navigation).getAttribute(read ? 'data-id' : 'data-notification-target');",
    "  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;",
    "  const button = read || navigation;",
    "  button.setAttribute('disabled', '');",
    "  try {",
    "    if (read) {",
    "      await send('/api/notifications/' + encodeURIComponent(id) + '/read', 'PATCH', { read: read.getAttribute('data-notification-read') === 'true' });",
    "      location.reload();",
    "      return;",
    "    }",
    "    const response = await fetch('/api/notifications/' + encodeURIComponent(id) + '/navigation' + profile, { credentials: 'same-origin' });",
    "    if (!response.ok) throw new Error('Origem indisponível.');",
    "    const data = await response.json();",
    "    const safe = ['/inbox#financial-insights', '/orcamentos', '/cartoes'];",
    "    if (!data.available || !safe.includes(data.href)) throw new Error('Origem indisponível.');",
    "    const destination = new URL(data.href, location.origin);",
    "    if (suffix) destination.searchParams.set('profileId', suffix);",
    "    location.assign(destination.pathname + destination.search + destination.hash);",
    "  } catch (error) {",
    "    if (status) status.textContent = error instanceof Error ? error.message : 'Operação indisponível.';",
    "    button.removeAttribute('disabled');",
    "  }",
    "});",
    "root.addEventListener('change', async (event) => {",
    "  const target = event.target;",
    "  if (!(target instanceof HTMLInputElement) || !target.matches('[data-preference-event]')) return;",
    "  target.disabled = true;",
    "  try {",
    "    await send('/api/notifications/preferences', 'PUT', {",
    "      type: target.dataset.preferenceEvent, channel: target.dataset.preferenceChannel, enabled: target.checked,",
    "    });",
    "    if (status) status.textContent = 'Preferência atualizada.';",
    "  } catch (error) {",
    "    target.checked = !target.checked;",
    "    if (status) status.textContent = error instanceof Error ? error.message : 'Preferência indisponível.';",
    "  } finally { target.disabled = false; }",
    "});",
    "})();",
  ].join("\n");
}

function notificationsPageStyles(): string {
  return [
    ".notifications-panel { display: grid; gap: 1.25rem; max-width: 1200px; margin: 0 auto; }",
    ".notifications-layout { display: grid; grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr); gap: 1rem; align-items: start; }",
    ".notifications-feed, .notifications-preferences { padding: 1.25rem; }",
    ".notifications-feed header { display: flex; justify-content: space-between; flex-wrap: wrap; gap: .5rem; }",
    ".notifications-list { padding: 0; margin: .75rem 0; list-style: none; }",
    ".notifications-entry { padding: .9rem 0; border-bottom: 1px solid var(--border, #dadfe7); display: flex; align-items: center; justify-content: space-between; gap: 1rem; }",
    ".notifications-entry[data-read-state='unread'] { border-left: 3px solid var(--accent, #145d93); padding-left: .75rem; }",
    ".notifications-entry h3 { margin: 0 0 .4rem; font-size: 1rem; }",
    ".notifications-entry p { margin: 0; color: var(--muted, #5f6572); }",
    ".notifications-entry-actions { display: flex; flex-wrap: wrap; gap: .4rem; }",
    ".notifications-entry-actions button { white-space: nowrap; }",
    ".notifications-pagination { display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; }",
    ".notifications-preference-list { display: grid; gap: .75rem; }",
    ".notifications-preference-group { min-width: 0; margin: 0; padding: .75rem .875rem .5rem; border: 1px solid var(--border, #dadfe7); border-radius: var(--sf-radius-md, .625rem); }",
    ".notifications-preference-group legend { padding: 0 .25rem; font-size: .9rem; font-weight: 700; }",
    ".notifications-preference { display: grid; grid-template-columns: minmax(0, 1fr) 1.5rem; align-items: center; gap: .75rem; min-height: 44px; font-weight: 500; }",
    ".notifications-preference + .notifications-preference { border-top: 1px solid var(--border, #dadfe7); }",
    ".notifications-preference-channel { min-width: 0; line-height: 1.35; overflow-wrap: normal; }",
    ".notifications-preference input { width: 20px; height: 20px; margin: 0; accent-color: var(--accent, #145d93); cursor: pointer; }",
    ".notifications-empty { padding: 1.5rem 0; }",
    "[data-notifications-status] { min-height: 1rem; }",
    "@media (max-width: 780px) { .notifications-layout { grid-template-columns: minmax(0, 1fr); } .notifications-entry { flex-wrap: wrap; } }",
  ].join("\n");
}

function formatMinorAmount(value: number, currency: string): string {
  const formatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency });
  const minorDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(value / 10 ** minorDigits);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
