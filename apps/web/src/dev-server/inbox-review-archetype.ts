import {
  renderAlert,
  renderDetailLayout,
  renderFilterBar,
  renderPageContainer,
  renderPageHeader,
  renderUnavailableState,
} from "../design-system/primitives.js";

export interface FinancialInsightFallbackView {
  currency: string;
  title: string;
  explanation: string;
  periodStartOn: string;
  periodEndOn: string;
  limitations: readonly string[];
}

export interface InboxReviewArchetypeProps {
  actionsHtml: string;
  suggestionsHtml: string;
  messagesHtml: string;
  evidenceHtml: string;
  statusHtml?: string;
}

export function renderInboxReviewArchetype(props: InboxReviewArchetypeProps): string {
  const headerHtml = renderPageHeader({
    eyebrow: "Entradas e revisão",
    title: "Inbox",
    description:
      "Revise mensagens, sugestões e importações com evidência antes de confirmar qualquer efeito financeiro.",
    actionsHtml: props.actionsHtml,
  });
  const filterBarHtml = renderFilterBar({
    label: "Navegação da triagem",
    childrenHtml: `
      <nav class="inbox-section-nav" aria-label="Seções da Inbox">
        <a class="secondary-button inbox-review-nav" href="#inbox-review-queue">Fila de revisão</a>
        <a class="secondary-button inbox-review-nav" href="#csv-import-title">Evidência da importação</a>
      </nav>
      <span class="muted small-note" role="status">Decisões continuam explícitas e dependem da evidência atual.</span>
    `,
  });
  const reviewLayoutHtml = renderDetailLayout({
    masterHtml: `
      <section id="inbox-review-queue" class="inbox-review-queue" aria-labelledby="inbox-review-queue-title">
        <div class="inbox-review-queue-heading">
          <div>
            <p class="eyebrow">Triagem</p>
            <h2 id="inbox-review-queue-title">Fila de revisão</h2>
          </div>
          <p class="muted small-note">Origem, estado e confiança permanecem visíveis em cada item.</p>
        </div>
        ${props.suggestionsHtml}
        ${props.messagesHtml}
      </section>
    `,
    detailHtml: `
      <section class="inbox-review-detail" aria-labelledby="inbox-review-detail-title">
        <div class="inbox-review-detail-heading">
          <div>
            <p class="eyebrow">Evidência e decisão</p>
            <h2 id="inbox-review-detail-title">Item em revisão</h2>
          </div>
          <p class="muted small-note">Selecione um lote ou item e confirme somente depois de revisar a evidência.</p>
        </div>
        ${props.statusHtml ?? ""}
        ${props.evidenceHtml}
      </section>
    `,
  });
  const cockpitHtml = renderPageContainer({
    className: "inbox-review-cockpit",
    childrenHtml: `${filterBarHtml}${reviewLayoutHtml}${inboxReviewRuntimeScript()}`,
  });

  return `<div data-inbox-review-archetype="A6">${headerHtml}${cockpitHtml}</div>`;
}

export function renderFinancialInsightFallback(
  fallbacks: readonly FinancialInsightFallbackView[],
): string {
  if (fallbacks.length === 0) return "";
  const currencies = [...new Set(fallbacks.map((item) => item.currency))].sort().join(", ");
  return `<div data-financial-insight-fallback="true">${renderAlert({
    tone: "information",
    title: "Insights financeiros aguardando dados",
    description: `Ainda não há lançamentos realizados suficientes em ${currencies} para gerar conclusões verificáveis. Nenhum insight artificial foi criado.`,
  })}</div>`;
}

export function renderInboxCategoriesUnavailable(error: string): string {
  return `<div data-inbox-categories-unavailable="true">${renderUnavailableState({
    title: "Categorias temporariamente indisponíveis",
    description: `A Inbox continua disponível para triagem e importações. Classificação e correção por categoria ficam limitadas até recarregar. ${error}`,
    actionHtml: '<a class="button-link secondary-button" href="/inbox">Tentar novamente</a>',
  })}</div>`;
}

export function inboxReviewArchetypeStyles(): string {
  return `
    .inbox-review-cockpit { display: grid; gap: 12px; max-width: none; padding: 0; }
    .inbox-review-cockpit .sf-filter-bar { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; }
    .inbox-section-nav { display: flex; flex: 1 1 auto; flex-wrap: nowrap; gap: 8px; min-width: 0; overflow-x: auto; scrollbar-width: thin; }
    .inbox-review-nav { flex: 0 0 auto; text-decoration: none; }
    .inbox-review-cockpit .sf-detail-layout { align-items: start; display: grid; gap: 14px; grid-template-columns: minmax(300px, .72fr) minmax(0, 1.28fr); }
    .inbox-review-queue, .inbox-review-detail, .inbox-review-group, .inbox-review-evidence { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); min-width: 0; }
    .inbox-review-queue, .inbox-review-detail { display: grid; gap: 12px; padding: 12px; }
    .inbox-review-group { padding: 10px; }
    .inbox-review-group + .inbox-review-group { margin-top: 2px; }
    .inbox-review-evidence { padding: 10px; }
    .inbox-review-queue-heading, .inbox-review-detail-heading { align-items: start; display: flex; gap: 12px; justify-content: space-between; }
    .inbox-review-queue-heading > div, .inbox-review-detail-heading > div { display: grid; gap: 3px; }
    .inbox-review-detail { position: sticky; top: 12px; }
    .inbox-review-evidence .import-workspace { gap: 10px; }
    .inbox-review-evidence .import-heading { align-items: center; }
    .inbox-review-evidence .import-layout { gap: 10px; grid-template-columns: minmax(205px, 250px) minmax(0, 1fr); }
    .inbox-review-evidence .batch-item { align-items: flex-start; align-self: start; display: flex; flex-direction: column; height: auto; justify-content: flex-start; min-height: 54px; white-space: normal; }
    .inbox-review-evidence .batch-item > strong, .inbox-review-evidence .batch-item > span { max-width: 100%; min-width: 0; overflow-wrap: anywhere; width: 100%; }
    .inbox-review-evidence .import-detail { gap: 8px; min-width: 0; }
    .inbox-review-evidence .detail-heading { align-items: center; gap: 8px; padding-bottom: 7px; }
    .inbox-review-evidence .detail-heading h3 { font-size: 1rem; }
    .inbox-review-evidence .import-summary { gap: 4px; }
    .inbox-review-evidence .import-summary span { border-radius: 999px; font-size: .68rem; padding: 4px 7px; }
    .inbox-review-evidence .bulk-actions { gap: 8px; min-height: 38px; padding: 6px 8px; }
    .inbox-review-evidence .bulk-actions > div { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
    .inbox-review-evidence .import-rows { gap: 0; }
    .inbox-review-evidence .import-row { align-items: start; border-radius: 0; display: grid; gap: 6px; grid-template-columns: 26px minmax(0, 1fr); padding: 5px 8px; }
    .inbox-review-evidence .row-editor { display: grid; gap: 4px; min-width: 0; }
    .inbox-review-evidence .row-heading { align-items: center; display: flex; gap: 7px; justify-content: space-between; }
    .inbox-review-evidence .row-heading strong { font-size: .78rem; }
    .inbox-review-evidence .row-summary { display: grid; gap: 3px 8px; grid-template-columns: minmax(82px, .62fr) minmax(68px, .5fr) minmax(90px, .65fr) minmax(150px, 1.45fr) minmax(118px, .9fr); margin: 0; }
    .inbox-review-evidence .row-summary > div { align-content: start; display: grid; gap: 1px; min-width: 0; }
    .inbox-review-evidence .row-summary dt { color: var(--muted); font-size: .7rem; font-weight: 700; letter-spacing: .02em; line-height: 1.15; text-transform: uppercase; }
    .inbox-review-evidence .row-summary dd { font-size: .75rem; line-height: 1.2; margin: 0; min-width: 0; overflow-wrap: anywhere; }
    .inbox-review-evidence .inline-actions, .inbox-review-evidence .maintenance-actions { gap: 4px; }
    .inbox-review-evidence .candidate-list { display: grid; gap: 4px; grid-column: 2; }
    .inbox-review-evidence .candidate-card { align-items: center; gap: 8px; padding: 6px 8px; }
    .inbox-date-filter-controls { align-items: end; display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0; }
    .inbox-date-filter-controls label { display: grid; font-size: .72rem; gap: 2px; }
    .inbox-date-filter-controls input { min-height: 34px; min-width: 132px; }
    #apply-inbox-date-filters { min-height: 34px; min-width: 112px; }
    #clear-inbox-date-filters { min-height: 34px; }
    .structured-payload-preview { display: grid; gap: 6px; min-width: 0; }
    .structured-payload-preview ul { margin: 0; padding-left: 18px; }
    @media (max-width: 1120px) {
      .inbox-review-evidence .import-layout { grid-template-columns: 1fr; }
      .inbox-review-evidence .row-summary { grid-template-columns: repeat(3, minmax(140px, 1fr)); }
    }
    @media (max-width: 900px) {
      .inbox-review-cockpit .sf-detail-layout { grid-template-columns: 1fr; }
      .inbox-review-detail { position: static; }
    }
    @media (max-width: 760px) {
      .inbox-review-evidence .row-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .inbox-review-evidence .detail-heading, .inbox-review-evidence .bulk-actions { align-items: stretch; display: grid; }
      .inbox-review-evidence .bulk-actions > div { justify-content: flex-start; }
    }
    @media (max-width: 600px) {
      .inbox-review-queue, .inbox-review-detail { padding: 9px; }
      .inbox-review-queue-heading, .inbox-review-detail-heading { display: grid; }
      .inbox-review-cockpit .sf-filter-bar { align-items: stretch; display: grid; }
      .inbox-section-nav { max-width: 100%; width: 100%; }
      .inbox-review-nav { justify-content: center; min-width: 190px; }
      .inbox-date-filter-controls { align-items: stretch; }
    }
    @media (max-width: 480px) {
      .inbox-review-evidence .row-summary { grid-template-columns: 1fr; }
    }
  `;
}

function inboxReviewRuntimeScript(): string {
  return String.raw`
    <script data-inbox-review-runtime="true">
      (() => {
        const profileId = new URLSearchParams(window.location.search).get("profileId");
        const withProfile = (path) => {
          if (!profileId) return path;
          const url = new URL(path, window.location.origin);
          url.searchParams.set("profileId", profileId);
          return url.pathname + url.search;
        };
        const escapeHtml = (value) => String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");
        const readRowDate = (row) => {
          const group = Array.from(row.querySelectorAll(".row-summary > div")).find(
            (item) => item.querySelector("dt")?.textContent?.trim() === "Data",
          );
          const value = group?.querySelector("dd");
          const text = value?.dataset.fullValue || value?.querySelector(".row-summary-value-preview")?.textContent?.trim() || value?.textContent?.trim() || "";
          const br = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if (br) return br[3] + "-" + br[2] + "-" + br[1];
          const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
          return iso ? iso[1] + "-" + iso[2] + "-" + iso[3] : "";
        };
        const syncDateUrl = (startsOn, endsOn) => {
          const url = new URL(window.location.href);
          if (startsOn) url.searchParams.set("lineStart", startsOn);
          else url.searchParams.delete("lineStart");
          if (endsOn) url.searchParams.set("lineEnd", endsOn);
          else url.searchParams.delete("lineEnd");
          window.history.replaceState({}, "", url.pathname + url.search + url.hash);
        };
        const applyDateFilters = (syncUrl) => {
          const start = document.getElementById("inbox-date-start");
          const end = document.getElementById("inbox-date-end");
          const counter = document.getElementById("inbox-visible-lines");
          const rows = Array.from(document.querySelectorAll(".import-row"));
          if (!start || !end || !counter || rows.length === 0) return;
          const startsOn = start.value || "";
          const endsOn = end.value || "";
          let visible = 0;
          rows.forEach((row) => {
            const occurredOn = readRowDate(row);
            const matches = (!startsOn || !occurredOn || occurredOn >= startsOn) && (!endsOn || !occurredOn || occurredOn <= endsOn);
            row.hidden = !matches;
            if (matches) visible += 1;
          });
          const nextCounterText = visible + " de " + rows.length + " linha(s)";
          if (counter.textContent !== nextCounterText) counter.textContent = nextCounterText;
          if (syncUrl) syncDateUrl(startsOn, endsOn);
        };
        const ensureDateFilters = () => {
          const detail = document.getElementById("import-batch-detail");
          if (!detail || detail.querySelectorAll(".import-row").length === 0) return;
          let controls = document.getElementById("inbox-date-filter-controls");
          if (!controls) {
            controls = document.createElement("div");
            controls.id = "inbox-date-filter-controls";
            controls.className = "compact-filters inbox-date-filter-controls";
            controls.innerHTML =
              '<label>De <input id="inbox-date-start" type="date" aria-label="Data inicial das linhas" /></label>' +
              '<label>Até <input id="inbox-date-end" type="date" aria-label="Data final das linhas" /></label>' +
              '<button id="apply-inbox-date-filters" class="secondary-button" type="button">Aplicar período</button>' +
              '<button id="clear-inbox-date-filters" class="button-link" type="button">Limpar</button>' +
              '<span id="inbox-visible-lines" class="muted small-note" role="status" aria-live="polite"></span>';
            const anchor = detail.querySelector(".compact-filters") || detail.querySelector(".bulk-actions");
            if (anchor) anchor.insertAdjacentElement("afterend", controls);
            else detail.prepend(controls);
            const url = new URL(window.location.href);
            const start = document.getElementById("inbox-date-start");
            const end = document.getElementById("inbox-date-end");
            if (start) start.value = url.searchParams.get("lineStart") || "";
            if (end) end.value = url.searchParams.get("lineEnd") || "";
            document.getElementById("apply-inbox-date-filters")?.addEventListener("click", () => applyDateFilters(true));
            document.getElementById("clear-inbox-date-filters")?.addEventListener("click", () => {
              if (start) start.value = "";
              if (end) end.value = "";
              applyDateFilters(true);
            });
          }
          applyDateFilters(false);
        };
        const formatMinorCurrency = (amountMinor, currency) => {
          try {
            return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(Number(amountMinor) / 100);
          } catch {
            return String(currency || "BRL") + " " + (Number(amountMinor) / 100).toFixed(2);
          }
        };
        const evidenceLabel = (proposal, label) => {
          const labels = {
            receitas: "Receitas",
            despesas: "Despesas",
            saldo: "Saldo realizado",
            despesas_periodo_anterior: "Despesas no período anterior",
            variacao_despesas_percentual: "Variação das despesas",
            diferenca: "Diferença",
          };
          if (labels[label]) return labels[label];
          if (label === "valor_atual") return proposal.insightKind === "budget_exceeded" ? "Despesas realizadas" : "Gasto no período atual";
          if (label === "valor_anterior_ou_planejado") return proposal.insightKind === "budget_exceeded" ? "Orçamento planejado" : "Gasto no período anterior";
          if (label === "variacao_percentual") return "Variação percentual";
          if (label === "amostra") return "Lançamentos considerados";
          if (label.startsWith("variacao_categoria:")) return "Variação em " + label.slice("variacao_categoria:".length);
          const text = label.replaceAll("_", " ").trim();
          return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Evidência";
        };
        const formatEvidence = (item, currency) => {
          if (item.unit === "minor_currency") return formatMinorCurrency(item.value, item.currency || currency);
          if (item.unit === "percentage") return String(item.value) + "%";
          return String(item.value);
        };
        const criterion = (proposal) => {
          if (proposal.insightKind === "monthly_summary") return "Existe ao menos um lançamento realizado no período; o resumo usa apenas lançamentos confirmados ou conciliados.";
          if (proposal.insightKind === "negative_balance_risk") return "Saldo agregado projetado abaixo de zero até o fim do horizonte mensal.";
          if (proposal.insightKind === "budget_exceeded") return "Despesas realizadas confirmadas da categoria acima do orçamento ativo, na mesma moeda e dentro da janela do orçamento.";
          if (proposal.insightKind === "probable_subscription") return "Pelo menos 3 meses consecutivos com variação de valor de até 20% em relação à média dos meses observados.";
          return "Aumento de pelo menos 25% com no mínimo 2 lançamentos realizados em cada período comparável.";
        };
        const insightNavigation = (proposal) => {
          const navigation = proposal.navigation;
          if (!navigation) return "";
          const params = new URLSearchParams();
          let path = "/lancamentos";
          let label = "Abrir lançamentos";
          if (navigation.view === "budgets") {
            path = "/orcamentos";
            label = "Abrir orçamentos";
            if (navigation.categoryId) params.set("categoryId", navigation.categoryId);
          } else if (navigation.view === "cash_flow") {
            path = "/relatorios";
            label = "Abrir relatórios";
          } else {
            const month = String(proposal.periodStartOn || "").slice(0, 7);
            if (/^\d{4}-\d{2}$/.test(month)) params.set("month", month);
            if (navigation.categoryId) params.set("categoryId", navigation.categoryId);
            if (navigation.merchantKey) params.set("merchantKey", navigation.merchantKey);
          }
          const query = params.toString();
          return '<p><a href="' + escapeHtml(query ? path + "?" + query : path) + '" data-insight-navigation="true">' + escapeHtml(label) + '</a></p>';
        };
        const renderInsight = (payload) => {
          const proposal = payload.proposal || {};
          const filters = ['<li>Moeda: ' + escapeHtml(proposal.filters?.currency || proposal.currency || "BRL") + '</li>'];
          if (proposal.filters?.categoryId) filters.push("<li>Categoria: conforme o título deste insight.</li>");
          if (proposal.filters?.merchantKey) filters.push('<li>Estabelecimento analisado: ' + escapeHtml(proposal.filters.merchantKey) + '</li>');
          if (!proposal.filters?.categoryId && !proposal.filters?.merchantKey) filters.push("<li>Escopo: lançamentos realizados elegíveis do perfil no período.</li>");
          const evidence = Array.isArray(proposal.evidence)
            ? proposal.evidence.map((item) => '<li>' + escapeHtml(evidenceLabel(proposal, String(item.label || ""))) + ': ' + escapeHtml(formatEvidence(item, proposal.currency || proposal.filters?.currency || "BRL")) + '</li>').join("")
            : "";
          const limitations = Array.isArray(proposal.limitations)
            ? proposal.limitations.map((item) => '<li>' + escapeHtml(item) + '</li>').join("")
            : "";
          const confidence = typeof payload.confidence === "number"
            ? '<p><strong>Confiança:</strong> ' + Math.round(payload.confidence * 100) + '%</p>'
            : "";
          return '<div class="message-preview structured-payload-preview" data-ai-structured-payload="true">' +
            '<p><span class="eyebrow">Insight verificável</span></p>' +
            '<p><strong>' + escapeHtml(proposal.title || "Insight financeiro") + '</strong></p>' +
            confidence +
            '<p class="muted"><strong>Período:</strong> ' + escapeHtml(proposal.periodStartOn || "") + ' a ' + escapeHtml(proposal.periodEndOn || "") + '</p>' +
            '<p>' + escapeHtml(proposal.summary || "") + '</p>' +
            '<div data-insight-criterion="true"><p><strong>Critério</strong></p><p>' + escapeHtml(criterion(proposal)) + '</p></div>' +
            '<div data-insight-filters="true"><p><strong>Filtros aplicados</strong></p><ul>' + filters.join("") + '</ul></div>' +
            '<div data-insight-evidence="true"><p><strong>Evidências verificáveis</strong></p><ul>' + evidence + '</ul></div>' +
            (limitations ? '<div data-insight-limitations="true"><p><strong>Limitações</strong></p><ul>' + limitations + '</ul></div>' : "") +
            insightNavigation(proposal) +
            '</div>';
        };
        const hydrateInsightCard = async (card) => {
          const suggestionId = card.dataset.reviewId || "";
          if (!suggestionId || card.dataset.a6PayloadState || card.querySelector('[data-ai-structured-payload="true"]')) return;
          card.dataset.a6PayloadState = "loading";
          try {
            const response = await fetch(withProfile("/api/ai-review-queue/" + encodeURIComponent(suggestionId) + "/payload"));
            if (!response.ok) {
              card.dataset.a6PayloadState = "unavailable";
              return;
            }
            const body = await response.json();
            const payload = body?.payload;
            if (!payload || payload.suggestionKind !== "insight") {
              card.dataset.a6PayloadState = "not-insight";
              return;
            }
            const actions = card.querySelector(".maintenance-actions");
            if (!actions) {
              card.dataset.a6PayloadState = "unavailable";
              return;
            }
            card.querySelector(".message-preview:not(.structured-payload-preview)")?.remove();
            actions.insertAdjacentHTML("beforebegin", renderInsight(payload));
            card.dataset.a6PayloadState = "ready";
          } catch {
            card.dataset.a6PayloadState = "unavailable";
          }
        };
        const hydrateInsights = () => {
          document.querySelectorAll("[data-review-id]").forEach((card) => {
            void hydrateInsightCard(card);
          });
        };
        let scheduled = false;
        const scheduleHydration = () => {
          if (scheduled) return;
          scheduled = true;
          queueMicrotask(() => {
            scheduled = false;
            ensureDateFilters();
            hydrateInsights();
          });
        };
        const observer = new MutationObserver(scheduleHydration);
        observer.observe(document.body, { childList: true, subtree: true });
        scheduleHydration();
      })();
    </script>
  `;
}
