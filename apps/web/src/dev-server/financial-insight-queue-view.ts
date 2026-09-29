import { renderMoney } from "../design-system/money.js";
import {
  renderBadge,
  renderEmptyState,
  renderText,
  renderUnavailableState,
  type SemanticTone,
} from "../design-system/primitives.js";
import {
  FINANCIAL_INSIGHTS_INBOX_ANCHOR,
  type FinancialInsightItemViewModel,
  type FinancialInsightQueueViewModel,
  type FinancialInsightSeverity,
} from "./financial-insight-queue-presenter.js";
import { icon } from "./icons.js";

const SEVERITY_TONES: Readonly<Record<FinancialInsightSeverity, SemanticTone>> = {
  critical: "negative",
  warning: "attention",
  info: "information",
};

export const FINANCIAL_INSIGHTS_INBOX_HREF = `/inbox#${FINANCIAL_INSIGHTS_INBOX_ANCHOR}`;

/** Dashboard: at most three canonical items plus navigation to the complete queue. */
export function renderDashboardFinancialInsights(model: FinancialInsightQueueViewModel): string {
  const body =
    model.status === "unavailable"
      ? renderUnavailableState({
          title: "Insights temporariamente indisponíveis",
          description: "Os demais indicadores continuam válidos. Tente novamente em instantes.",
        })
      : model.items.length === 0
        ? renderEmptyState({
            title: "Nenhum insight ativo agora.",
            description: "Insights resolvidos ou adiados ficam disponíveis na Inbox.",
          })
        : `<ol class="insight-queue-list" data-insight-surface="dashboard">${model.items
            .map((item) => renderInsightItem(item, { actions: false }))
            .join("")}</ol>`;
  const seeAll =
    model.status === "ready" && model.total > model.items.length
      ? `<a class="button-link secondary-link" href="${FINANCIAL_INSIGHTS_INBOX_HREF}">Ver todos os insights (${model.total})</a>`
      : `<a class="text-link" href="${FINANCIAL_INSIGHTS_INBOX_HREF}">Abrir fila de insights</a>`;

  return `
    <section class="panel insight-queue-panel" aria-labelledby="dashboard-insights-title" data-financial-insight-queue="dashboard">
      <div class="section-heading">
        <div><p class="eyebrow">Prioridades</p><h2 id="dashboard-insights-title">Principais insights</h2></div>
        ${seeAll}
      </div>
      ${body}
    </section>
  `;
}

/** Inbox: complete active queue with progressive loading and explicit decisions. */
export function renderInboxFinancialInsights(
  model: FinancialInsightQueueViewModel,
  options: { moreHref?: string },
): string {
  const count =
    model.status === "ready"
      ? `<span>${model.total} ativo${model.total === 1 ? "" : "s"}</span>`
      : "";
  const body =
    model.status === "unavailable"
      ? renderUnavailableState({
          title: "Insights temporariamente indisponíveis",
          description: "A revisão das demais sugestões continua disponível.",
          actionHtml: `<a class="button-link secondary-button" href="${FINANCIAL_INSIGHTS_INBOX_HREF}">Tentar novamente</a>`,
        })
      : model.items.length === 0
        ? renderEmptyState({
            title: "Nenhum insight ativo.",
            description: "Novos insights aparecem aqui quando os dados mudarem.",
          })
        : `<ol class="insight-queue-list" data-insight-surface="inbox">${model.items
            .map((item) => renderInsightItem(item, { actions: true }))
            .join("")}</ol>`;
  const more =
    model.status === "ready" && model.hasMore && options.moreHref !== undefined
      ? `<a class="button-link secondary-button insight-queue-more" href="${renderText(options.moreHref)}">Mostrar mais insights</a>`
      : "";

  return `
    <section id="${FINANCIAL_INSIGHTS_INBOX_ANCHOR}" class="panel list-panel inbox-review-group insight-queue-panel" aria-labelledby="inbox-insights-title" data-financial-insight-queue="inbox">
      <div class="section-heading">
        <h2 id="inbox-insights-title">Insights financeiros</h2>
        ${count}
      </div>
      <p class="form-status muted" data-insight-queue-status role="status" aria-live="polite"></p>
      ${body}
      ${more}
    </section>
    ${renderSnoozeDialog()}
    ${financialInsightQueueScript()}
  `;
}

function renderInsightItem(
  item: FinancialInsightItemViewModel,
  options: { actions: boolean },
): string {
  const evidence = item.evidence.length
    ? `<dl class="insight-queue-evidence">${item.evidence
        .map(
          (entry) =>
            `<div><dt>${renderText(entry.label)}</dt><dd>${
              entry.value.kind === "money"
                ? renderMoney({
                    amountMinor: entry.value.money.amountMinor,
                    currency: entry.value.money.currency,
                  })
                : renderText(entry.value.text)
            }</dd></div>`,
        )
        .join("")}</dl>`
    : "";
  const link = item.href
    ? `<a class="insight-queue-link" href="${renderText(item.href)}" data-insight-evidence-link>${icon("link", 13)} ${renderText(item.hrefLabel)}</a>`
    : "";
  const actions = options.actions
    ? `<span class="insight-queue-decisions"><button type="button" class="secondary-button" data-insight-resolve="${renderText(item.id)}" data-insight-fingerprint="${renderText(item.fingerprint)}" title="Marcar como resolvido; nenhum lançamento é alterado">${icon("check", 13)} Resolver</button>
       <button type="button" class="secondary-button" data-insight-snooze="${renderText(item.id)}" data-insight-fingerprint="${renderText(item.fingerprint)}" title="Ocultar temporariamente">${icon("clock", 13)} Adiar</button></span>`
    : "";

  return `
    <li class="insight-queue-item" data-insight-id="${renderText(item.id)}" data-severity="${item.severity}">
      <div class="insight-queue-heading">
        ${renderBadge({ label: item.severityLabel, tone: SEVERITY_TONES[item.severity] })}
        <span class="insight-queue-kind">${renderText(item.kindLabel)}</span>
        <span class="insight-queue-currency" aria-label="Moeda ${renderText(item.currency)}">${renderText(item.currency)}</span>
      </div>
      <strong class="insight-queue-title">${renderText(item.title)}</strong>
      ${options.actions ? `<p class="insight-queue-summary">${renderText(item.summary)}</p>` : ""}
      <span class="insight-queue-period">Período: ${renderText(item.periodLabel)}</span>
      ${evidence}
      <div class="insight-queue-actions">${link}${actions}</div>
    </li>
  `;
}

function renderSnoozeDialog(): string {
  return `
    <dialog id="financial-insight-snooze-dialog" class="master-dialog insight-snooze-dialog" aria-labelledby="financial-insight-snooze-title">
      <form class="insight-snooze-form" data-insight-snooze-form>
        <div class="dialog-heading">
          <p class="eyebrow">Insight</p>
          <h2 id="financial-insight-snooze-title">Adiar insight</h2>
        </div>
        <fieldset>
          <legend>Ocultar até</legend>
          <label class="insight-snooze-option"><input type="radio" name="durationDays" value="1" checked> <span>1 dia</span></label>
          <label class="insight-snooze-option"><input type="radio" name="durationDays" value="7"> <span>7 dias</span></label>
          <label class="insight-snooze-option"><input type="radio" name="durationDays" value="30"> <span>30 dias</span></label>
        </fieldset>
        <p class="muted small-note">Se os dados mudarem, um novo insight pode aparecer antes do prazo.</p>
        <p class="form-status muted" data-insight-snooze-status role="status" aria-live="polite"></p>
        <div class="dialog-actions">
          <button type="button" class="secondary-button" data-insight-snooze-cancel>Cancelar</button>
          <button type="submit">Adiar</button>
        </div>
      </form>
    </dialog>
  `;
}

function financialInsightQueueScript(): string {
  return `
    <script data-financial-insight-queue-runtime>
      (() => {
        const section = document.getElementById("${FINANCIAL_INSIGHTS_INBOX_ANCHOR}");
        const dialog = document.getElementById("financial-insight-snooze-dialog");
        if (!section || !dialog) return;
        const status = section.querySelector("[data-insight-queue-status]");
        const form = dialog.querySelector("[data-insight-snooze-form]");
        const dialogStatus = dialog.querySelector("[data-insight-snooze-status]");
        let pending = null;
        const withProfile = (path) => {
          const profileId = new URL(window.location.href).searchParams.get("profileId");
          if (!profileId) return path;
          const url = new URL(path, window.location.origin);
          url.searchParams.set("profileId", profileId);
          return url.pathname + url.search;
        };
        const conflictMessage = "Este insight mudou. Atualize a página antes de tentar novamente.";
        async function decide(id, action, body) {
          const response = await fetch(withProfile("/api/financial-insights/" + encodeURIComponent(id) + "/" + action), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body)
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            const error = new Error(response.status === 409 ? conflictMessage : (payload && payload.error && payload.error.message) || "Não foi possível concluir a ação.");
            throw error;
          }
          return payload;
        }
        function done(message) {
          if (status) { status.className = "form-status success"; status.textContent = message; }
          window.setTimeout(() => window.location.reload(), 400);
        }
        section.querySelectorAll("[data-insight-resolve]").forEach((button) => {
          button.addEventListener("click", async () => {
            if (!window.confirm("Marcar este insight como resolvido? Nenhum lançamento será alterado.")) return;
            button.disabled = true;
            try {
              await decide(button.dataset.insightResolve, "resolve", { expectedFingerprint: button.dataset.insightFingerprint });
              done("Insight resolvido. Ele continua disponível no histórico.");
            } catch (error) {
              if (status) { status.className = "form-status error"; status.textContent = error.message; }
              button.disabled = false;
            }
          });
        });
        section.querySelectorAll("[data-insight-snooze]").forEach((button) => {
          button.addEventListener("click", () => {
            pending = button;
            if (dialogStatus) dialogStatus.textContent = "";
            dialog.showModal();
            dialog.querySelector('input[name="durationDays"]:checked')?.focus();
          });
        });
        dialog.querySelector("[data-insight-snooze-cancel]")?.addEventListener("click", () => dialog.close());
        dialog.addEventListener("close", () => { pending?.focus?.(); });
        form?.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (!pending) return;
          const submit = form.querySelector('button[type="submit"]');
          submit.disabled = true;
          try {
            const durationDays = Number(new FormData(form).get("durationDays"));
            await decide(pending.dataset.insightSnooze, "snooze", { expectedFingerprint: pending.dataset.insightFingerprint, durationDays });
            dialog.close();
            done("Insight adiado por " + durationDays + (durationDays === 1 ? " dia." : " dias."));
          } catch (error) {
            if (dialogStatus) { dialogStatus.className = "form-status error"; dialogStatus.textContent = error.message; }
          } finally {
            submit.disabled = false;
          }
        });
      })();
    </script>
  `;
}

export function financialInsightQueueStyles(): string {
  return `
    .insight-queue-panel { display: grid; gap: 10px; }
    .insight-queue-list { display: grid; gap: 0; list-style: none; margin: 0; padding: 0; }
    .insight-queue-item { border-top: 1px solid var(--line); display: grid; gap: 4px; min-width: 0; padding: 10px 0; }
    .insight-queue-item:first-child { border-top: 0; padding-top: 0; }
    .insight-queue-heading { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; }
    .insight-queue-kind { color: var(--muted); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
    .insight-queue-currency { border: 1px solid var(--line); border-radius: 999px; font-size: 0.6875rem; font-weight: 700; padding: 1px 7px; }
    .insight-queue-title { font-size: 0.9375rem; overflow-wrap: anywhere; }
    .insight-queue-summary { color: var(--text, inherit); font-size: 0.8125rem; line-height: 1.4; margin: 0; }
    .insight-queue-period { color: var(--muted); font-size: 0.75rem; }
    .insight-queue-evidence { display: grid; gap: 4px 12px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin: 2px 0 0; }
    .insight-queue-evidence div { display: grid; gap: 1px; min-width: 0; }
    .insight-queue-evidence dt { color: var(--muted); font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; }
    .insight-queue-evidence dd { font-size: 0.8125rem; margin: 0; overflow-wrap: anywhere; }
    .insight-queue-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; margin-top: 2px; }
    .insight-queue-link { align-items: center; color: var(--primary); display: inline-flex; font-size: 0.8125rem; font-weight: 700; gap: 4px; margin-right: auto; text-underline-offset: 3px; }
    .insight-queue-link:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
    .insight-queue-decisions { display: inline-flex; flex-wrap: nowrap; gap: 6px; }
    .insight-queue-more { justify-self: start; }
    .insight-snooze-dialog { width: min(420px, calc(100vw - 24px)); }
    .insight-snooze-form { display: grid; gap: 10px; }
    .insight-snooze-form fieldset { border: 1px solid var(--line); border-radius: var(--radius); display: grid; gap: 6px; margin: 0; padding: 8px 12px; }
    .insight-snooze-form .insight-snooze-option { align-items: center; cursor: pointer; display: flex; font-weight: 600; gap: 8px; min-height: 32px; }
    .insight-snooze-form .insight-snooze-option input { flex: 0 0 auto; height: 16px; margin: 0; min-height: 0; padding: 0; width: 16px; }
    .insight-snooze-form .dialog-actions { display: flex; gap: 8px; justify-content: flex-end; }
    @media (max-width: 640px) {
      .insight-queue-decisions { flex: 1 1 100%; }
      .insight-queue-decisions > button { flex: 1 1 0; justify-content: center; }
      .insight-snooze-form .dialog-actions { display: grid; }
    }
  `;
}
