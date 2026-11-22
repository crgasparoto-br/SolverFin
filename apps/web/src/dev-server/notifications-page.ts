import { renderPageContainer, renderPageHeader, renderTabs } from "../design-system/primitives.js";

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
const NOTIFICATION_TITLES: Record<string, string> = {
  insight_available: "Insight disponível",
  budget_threshold: "Limite do orçamento",
  invoice_due: "Vencimento de fatura",
  balance_warning: "Atenção ao saldo",
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
    Number.isSafeInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;
  const profileId = url.searchParams.get("profileId");
  const profileSuffix = profileId ? "&profileId=" + encodeURIComponent(profileId) : "";
  const activeView = url.searchParams.get("tab") === "preferencias" ? "preferencias" : "recebidas";
  const [feed, preferences] = await Promise.all([
    apiGet<NotificationPage>(token, "/api/notifications?limit=20&offset=" + offset + profileSuffix),
    apiGet<{ preferences: NotificationPreference[] }>(
      token,
      "/api/notifications/preferences?" + profileSuffix.slice(1),
    ),
  ]);
  const tabs = renderTabs({
    label: "Áreas de notificações",
    items: [
      {
        label: "Recebidas",
        href: "/notificacoes?offset=" + offset + profileSuffix,
        active: activeView === "recebidas",
      },
      {
        label: "Preferências",
        href: "/notificacoes?tab=preferencias&offset=" + offset + profileSuffix,
        active: activeView === "preferencias",
      },
    ],
  });
  const feedSection = [
    '<section class="notifications-section notifications-feed" aria-label="Notificações recebidas">',
    '<header class="notifications-section-header">',
    '<div><h2>Caixa de entrada</h2><p aria-live="polite">',
    feed.ok ? String(feed.data.unreadCount) + " não lidas" : "Não foi possível carregar",
    "</p></div>",
    "</header>",
    feed.ok
      ? renderFeed(feed.data, offset, profileId)
      : '<p class="notifications-error" role="alert">' + escapeHtml(feed.error) + "</p>",
    "</section>",
  ].join("");
  const preferencesSection = [
    '<section class="notifications-section notifications-preferences" aria-label="Preferências de notificações">',
    '<header class="notifications-section-header"><div><h2>Preferências de canais</h2>',
    "<p>Escolha como deseja receber cada tipo de aviso.</p></div></header>",
    preferences.ok
      ? renderPreferences(preferences.data.preferences)
      : '<p class="notifications-error" role="alert">' + escapeHtml(preferences.error) + "</p>",
    '<p class="notifications-channels-note">',
    icon("info", 16),
    "<span>Push e e-mail ainda não enviam mensagens. Suas escolhas ficam salvas para quando esses canais forem ativados.</span>",
    "</p>",
    "</section>",
  ].join("");
  const content = [
    '<section class="notifications-panel" data-financial-notifications data-notifications-view="' +
      activeView +
      '">',
    renderPageHeader({
      eyebrow: "Atividade financeira",
      title: "Notificações",
      description: "Acompanhe seus avisos financeiros e escolha como recebê-los.",
    }),
    '<div class="notifications-navigation">' + tabs + "</div>",
    activeView === "recebidas" ? feedSection : preferencesSection,
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
    return [
      '<div class="notifications-empty">',
      '<span class="notifications-empty-icon">' + icon("inbox", 26) + "</span>",
      "<h3>Nenhuma notificação por enquanto</h3>",
      "<p>Os avisos do seu perfil aparecerão aqui quando houver novos eventos financeiros.</p>",
      "</div>",
    ].join("");
  }
  const currentProfile = profileId ? "&amp;profileId=" + encodeURIComponent(profileId) : "";
  const previous = offset > 0 ? Math.max(offset - 20, 0) : null;
  return [
    '<ol class="notifications-list">',
    page.items.map(renderNotification).join(""),
    "</ol>",
    '<nav class="notifications-pagination" aria-label="Paginação de notificações">',
    previous === null
      ? ""
      : '<a class="sf-focus-ring" href="/notificacoes?offset=' +
        previous +
        currentProfile +
        '">Anterior</a>',
    "<span>" + (offset + 1) + "–" + (offset + page.items.length) + " de " + page.total + "</span>",
    page.nextOffset === null
      ? ""
      : '<a class="sf-focus-ring" href="/notificacoes?offset=' +
        page.nextOffset +
        currentProfile +
        '">Próxima</a>',
    "</nav>",
  ].join("");
}

function renderNotification(item: NotificationItem): string {
  const title = NOTIFICATION_TITLES[item.facts.code] ?? "Notificação indisponível";
  const description =
    FACT_LABELS[item.facts.code] ?? "Os detalhes deste aviso estão indisponíveis.";
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
  const entryIcon =
    item.facts.code === "budget_threshold"
      ? "pie-chart"
      : item.facts.code === "invoice_due"
        ? "calendar"
        : item.facts.code === "balance_warning"
          ? "alert-triangle"
          : "info";
  const id = escapeHtml(item.id);
  const read = Boolean(item.readAt);
  return [
    '<li class="notifications-entry" data-read-state="' + (read ? "read" : "unread") + '">',
    '<span class="notifications-entry-icon">' + icon(entryIcon, 18) + "</span>",
    '<div class="notifications-entry-body">',
    '<div class="notifications-entry-title"><h3>' + escapeHtml(title) + "</h3>",
    '<span class="notifications-read-label">' + (read ? "Lida" : "Não lida") + "</span></div>",
    '<p class="notifications-description">' + escapeHtml(description) + "</p>",
    '<p class="notifications-metadata">',
    Number.isNaN(occurredAt.getTime())
      ? escapeHtml(dateText)
      : '<time datetime="' + escapeHtml(item.occurredAt) + '">' + escapeHtml(dateText) + "</time>",
    item.facts.effectiveOn ? " · Referência: " + escapeHtml(item.facts.effectiveOn) : "",
    "</p></div>",
    '<div class="notifications-entry-aside">',
    amount ? '<strong class="notifications-amount">' + escapeHtml(amount) + "</strong>" : "",
    '<div class="notifications-entry-actions">',
    '<button type="button" class="sf-button sf-button-secondary sf-focus-ring notifications-action" data-notification-target="' +
      id +
      '">',
    icon("link", 16) + "<span>Ver origem</span></button>",
    '<button type="button" class="sf-button sf-button-ghost sf-focus-ring notifications-action" data-notification-read="' +
      (read ? "false" : "true") +
      '" data-id="' +
      id +
      '">',
    icon(read ? "eye-off" : "check", 16) +
      "<span>" +
      (read ? "Marcar não lida" : "Marcar lida") +
      "</span></button>",
    "</div></div></li>",
  ].join("");
}

function renderPreferences(preferences: NotificationPreference[]): string {
  const grouped = Object.entries(EVENT_LABELS).map(([type, title]) => {
    const channels = preferences.filter((preference) => preference.type === type);
    if (channels.length === 0) return "";
    return [
      '<fieldset class="notifications-preference-group">',
      "<legend>" + escapeHtml(title) + "</legend>",
      '<div class="notifications-preference-options">',
      ...channels.map((preference) => {
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
      }),
      "</div></fieldset>",
    ].join("");
  });
  return grouped.some(Boolean)
    ? '<div class="notifications-preference-list">' + grouped.join("") + "</div>"
    : '<p class="notifications-empty-preferences">Nenhuma preferência disponível.</p>';
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
    ".notifications-panel { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--sf-space-5); min-width: 0; max-width: 1200px; margin: 0 auto; }",
    ".notifications-navigation { min-width: 0; border-bottom: 1px solid var(--sf-color-border); }",
    ".notifications-section { min-width: 0; border: 1px solid var(--sf-color-border); border-radius: var(--sf-radius-lg); background: var(--sf-color-surface); padding: var(--sf-space-5); }",
    ".notifications-section-header { display: flex; align-items: center; justify-content: space-between; gap: var(--sf-space-3); margin-bottom: var(--sf-space-3); }",
    ".notifications-section-header h2 { margin: 0 0 var(--sf-space-1); font-size: var(--sf-font-size-lg); }",
    ".notifications-section-header p { margin: 0; color: var(--sf-color-muted-text); }",
    ".notifications-list { list-style: none; margin: 0; padding: 0; }",
    ".notifications-entry { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: var(--sf-space-3); padding: var(--sf-space-4) var(--sf-space-2); border-bottom: 1px solid var(--sf-color-border); }",
    ".notifications-entry:last-child { border-bottom: none; }",
    ".notifications-entry[data-read-state='unread'] { background: var(--sf-color-primary-soft); }",
    ".notifications-entry-icon { display: grid; place-items: center; width: 38px; height: 38px; border-radius: var(--sf-radius-md); color: var(--sf-color-primary); background: var(--sf-color-surface-soft); }",
    ".notifications-entry-body, .notifications-entry-aside { min-width: 0; }",
    ".notifications-entry-title { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sf-space-2); }",
    ".notifications-entry-title h3 { margin: 0; min-width: 0; overflow-wrap: anywhere; font-size: var(--sf-font-size-lg); }",
    ".notifications-read-label { min-width: 0; overflow-wrap: anywhere; color: var(--sf-color-muted-text); font-size: var(--sf-font-size-sm); }",
    ".notifications-entry[data-read-state='unread'] .notifications-read-label { color: var(--sf-color-primary); font-weight: var(--sf-font-weight-semibold); }",
    ".notifications-description { margin: var(--sf-space-1) 0; color: var(--sf-color-muted-text); font-size: var(--sf-font-size-md); overflow-wrap: anywhere; }",
    ".notifications-metadata { margin: 0; color: var(--sf-color-muted-text); font-size: var(--sf-font-size-sm); overflow-wrap: anywhere; }",
    ".notifications-entry-aside { display: flex; flex-direction: column; align-items: flex-end; gap: var(--sf-space-2); }",
    ".notifications-amount { color: var(--sf-color-text); font-variant-numeric: tabular-nums; max-width: 100%; overflow-wrap: anywhere; text-align: right; }",
    ".notifications-entry-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--sf-space-1); min-width: 0; max-width: 100%; }",
    ".notifications-action { padding-inline: var(--sf-space-3); min-height: var(--sf-density-interactive-target-min); max-width: 100%; white-space: normal; overflow-wrap: anywhere; text-align: center; font-weight: var(--sf-font-weight-semibold); }",
    ".notifications-pagination { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--sf-space-3); padding-top: var(--sf-space-4); }",
    ".notifications-pagination span { color: var(--sf-color-muted-text); font-variant-numeric: tabular-nums; }",
    ".notifications-pagination a { display: inline-flex; min-height: var(--sf-density-interactive-target-min); align-items: center; padding: 0 var(--sf-space-2); color: var(--sf-color-primary); }",
    ".notifications-preference-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sf-space-4); margin-top: var(--sf-space-5); }",
    ".notifications-preference-group { min-width: 0; margin: 0; border: 1px solid var(--sf-color-border); border-radius: var(--sf-radius-md); padding: var(--sf-space-3) var(--sf-space-4); }",
    ".notifications-preference-group legend { padding: 0 var(--sf-space-2); font-weight: var(--sf-font-weight-semibold); }",
    ".notifications-preference-options { display: grid; }",
    ".notifications-preference { display: grid; grid-template-columns: minmax(0, 1fr) 24px; align-items: center; gap: var(--sf-space-3); min-height: var(--sf-density-interactive-target-min); }",
    ".notifications-preference + .notifications-preference { border-top: 1px solid var(--sf-color-border); }",
    ".notifications-preference-channel { min-width: 0; line-height: 1.35; overflow-wrap: anywhere; }",
    ".notifications-preference input { width: 20px; height: 20px; margin: 0; accent-color: var(--sf-color-primary); cursor: pointer; }",
    ".notifications-preference input:focus-visible { outline: 2px solid var(--sf-color-primary); outline-offset: 3px; }",
    ".notifications-channels-note { display: flex; gap: var(--sf-space-2); margin: var(--sf-space-4) 0 0; color: var(--sf-color-muted-text); font-size: var(--sf-font-size-sm); }",
    ".notifications-channels-note svg { flex-shrink: 0; }",
    ".notifications-empty { display: grid; justify-items: center; gap: var(--sf-space-2); padding: var(--sf-space-8) var(--sf-space-4); text-align: center; }",
    ".notifications-empty-icon { display: grid; place-items: center; color: var(--sf-color-muted-text); }",
    ".notifications-empty h3, .notifications-empty p { margin: 0; }",
    ".notifications-empty p { max-width: 36rem; color: var(--sf-color-muted-text); }",
    ".notifications-error { color: var(--sf-color-danger); }",
    "[data-notifications-status] { min-height: 1rem; margin: 0; }",
    "@media (max-width: 780px) { .notifications-section { padding: var(--sf-space-4); } .notifications-entry { grid-template-columns: auto minmax(0, 1fr); } .notifications-entry-aside { grid-column: 2; align-items: flex-start; } .notifications-amount { text-align: left; } .notifications-entry-actions { justify-content: flex-start; } .notifications-preference-list { grid-template-columns: minmax(0, 1fr); } }",
    "@media (max-width: 360px) { .notifications-section { padding: 12px; } .notifications-entry { display: flex; flex-direction: column; align-items: stretch; gap: 8px; padding: 12px 0; } .notifications-entry-icon { width: 32px; height: 32px; } .notifications-entry-body, .notifications-entry-aside { width: 100%; } .notifications-entry-aside { align-items: stretch; } .notifications-entry-actions { flex-direction: column; align-items: stretch; width: 100%; } .notifications-action { justify-content: center; width: 100%; padding-inline: 8px; } }",
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
