import {
  renderDetailLayout,
  renderFilterBar,
  renderPageContainer,
  renderPageHeader,
} from "../design-system/primitives.js";
import { enhanceInboxOfxImport } from "./inbox-ofx-import-enhancement.js";

export interface CategoryRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
  parentCategoryId?: string | null;
}

export interface InboxCategoryChoice extends CategoryRecord {
  path: string;
  selectable: boolean;
  hierarchyState: "valid" | "missing_parent" | "cycle";
}

export interface InboxCategorySelection {
  categoryId: string | undefined;
  removedBecauseIncompatible: boolean;
  unavailable: boolean;
}

const CATEGORY_PATH_SEPARATOR = " › ";
const MISSING_PARENT_LABEL = "Sem grupo";
const INVALID_HIERARCHY_LABEL = "Hierarquia inválida";

export function buildInboxCategoryChoices(
  categories: readonly CategoryRecord[],
): InboxCategoryChoice[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const hierarchyById = new Map(
    categories.map((category) => [category.id, resolveCategoryPath(category, categoryById)]),
  );
  const childrenByParentId = new Map<string, CategoryRecord[]>();

  for (const category of categories) {
    if (!category.parentCategoryId || !categoryById.has(category.parentCategoryId)) continue;
    const children = childrenByParentId.get(category.parentCategoryId) ?? [];
    children.push(category);
    childrenByParentId.set(category.parentCategoryId, children);
  }

  const compareCategories = (left: CategoryRecord, right: CategoryRecord): number =>
    left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" }) ||
    left.id.localeCompare(right.id);
  for (const children of childrenByParentId.values()) children.sort(compareCategories);

  const rootCategories = categories
    .filter((category) => {
      const hierarchy = hierarchyById.get(category.id);
      return (
        !category.parentCategoryId ||
        !categoryById.has(category.parentCategoryId) ||
        hierarchy?.hierarchyState === "cycle"
      );
    })
    .sort(compareCategories);

  const ordered: CategoryRecord[] = [];
  const visited = new Set<string>();
  const appendCategory = (category: CategoryRecord): void => {
    if (visited.has(category.id)) return;
    visited.add(category.id);
    ordered.push(category);
    for (const child of childrenByParentId.get(category.id) ?? []) appendCategory(child);
  };

  for (const root of rootCategories) appendCategory(root);
  for (const category of [...categories].sort((left, right) => {
    const leftPath = hierarchyById.get(left.id)?.path ?? left.name;
    const rightPath = hierarchyById.get(right.id)?.path ?? right.name;
    return (
      leftPath.localeCompare(rightPath, "pt-BR", { sensitivity: "base" }) ||
      compareCategories(left, right)
    );
  })) {
    appendCategory(category);
  }

  return ordered.map((category) => {
    const hierarchy = hierarchyById.get(category.id) ?? {
      path: category.name,
      hierarchyState: "valid" as const,
    };
    return {
      ...category,
      path: hierarchy.path,
      hierarchyState: hierarchy.hierarchyState,
      selectable:
        category.status === "active" &&
        (category.kind === "income" || category.kind === "expense" || category.kind === "transfer"),
    };
  });
}

export function resolveInboxCategorySelection(
  choices: readonly InboxCategoryChoice[],
  categoryId: string | undefined,
  kind: string,
): InboxCategorySelection {
  if (!categoryId) {
    return { categoryId: undefined, removedBecauseIncompatible: false, unavailable: false };
  }

  const category = choices.find((choice) => choice.id === categoryId);
  if (!category) {
    return { categoryId, removedBecauseIncompatible: false, unavailable: true };
  }
  if (!category.selectable) {
    return { categoryId, removedBecauseIncompatible: false, unavailable: true };
  }
  if (category.kind !== kind) {
    return { categoryId: undefined, removedBecauseIncompatible: true, unavailable: false };
  }

  return { categoryId, removedBecauseIncompatible: false, unavailable: false };
}

export function enhanceInboxReviewArchetype(html: string): string {
  if (html.includes("data-inbox-review-archetype")) return html;

  const headingPattern =
    /<section class="page-heading">[\s\S]*?<div class="heading-actions">([\s\S]*?)<\/div>\s*<\/section>/;
  const headingMatch = html.match(headingPattern);
  if (!headingMatch) return html;

  const importPattern =
    /<section class="panel import-workspace" aria-labelledby="csv-import-title">[\s\S]*?<\/section>/;
  const suggestionsPattern =
    /<section class="panel list-panel">\s*<div class="section-heading">\s*<h2>Outras sugestões<\/h2>[\s\S]*?<\/section>/;
  const messagesPattern =
    /<section class="panel list-panel">\s*<div class="section-heading">\s*<h2>Mensagens recebidas<\/h2>[\s\S]*?<\/section>/;

  const importMatch = html.match(importPattern);
  const suggestionsMatch = html.match(suggestionsPattern);
  const messagesMatch = html.match(messagesPattern);
  if (!importMatch || !suggestionsMatch || !messagesMatch) return html;

  const headerHtml = renderPageHeader({
    eyebrow: "Entradas e revisão",
    title: "Inbox",
    description:
      "Revise mensagens, sugestões e importações com evidência antes de confirmar qualquer efeito financeiro.",
    actionsHtml: headingMatch[1]?.trim() ?? "",
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

  const suggestionsHtml = suggestionsMatch[0]
    .replace(
      'class="panel list-panel"',
      'class="panel list-panel inbox-review-group" aria-labelledby="inbox-review-suggestions-title"',
    )
    .replace(
      "<h2>Outras sugestões</h2>",
      '<h2 id="inbox-review-suggestions-title">Outras sugestões</h2>',
    );
  const messagesHtml = messagesMatch[0]
    .replace(
      'class="panel list-panel"',
      'class="panel list-panel inbox-review-group" aria-labelledby="inbox-review-messages-title"',
    )
    .replace(
      "<h2>Mensagens recebidas</h2>",
      '<h2 id="inbox-review-messages-title">Mensagens recebidas</h2>',
    );
  const evidenceHtml = importMatch[0].replace(
    'class="panel import-workspace"',
    'class="panel import-workspace inbox-review-evidence" data-inbox-review-evidence',
  );

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
        ${suggestionsHtml}
        ${messagesHtml}
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
        ${evidenceHtml}
      </section>
    `,
  });
  const reviewRuntimeHtml = String.raw`
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
          counter.textContent = visible + " de " + rows.length + " linha(s)";
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

  const cockpitHtml = renderPageContainer({
    className: "inbox-review-cockpit",
    childrenHtml: `${filterBarHtml}${reviewLayoutHtml}${reviewRuntimeHtml}`,
  });

  let enhanced = html.replace(importMatch[0], "");
  enhanced = enhanced.replace(suggestionsMatch[0], "");
  enhanced = enhanced.replace(messagesMatch[0], "");
  enhanced = enhanced.replace(headingPattern, `${headerHtml}${cockpitHtml}`);
  enhanced = enhanced.replace("<main", '<main data-inbox-review-archetype="A6"');
  enhanced = enhanced.replace(
    "</style>",
    `
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
    </style>`,
  );

  return enhanced;
}

export function enhanceInboxCategoryHierarchy(
  html: string,
  categories: readonly CategoryRecord[],
): string {
  const ofxEnhanced = enhanceInboxOfxImport(html);
  if (!ofxEnhanced.includes('id="csv-line-edit-dialog"')) {
    return enhanceInboxReviewArchetype(ofxEnhanced);
  }
  if (ofxEnhanced.includes("data-inbox-category-hierarchy-enhanced")) {
    return enhanceInboxReviewArchetype(ofxEnhanced);
  }

  const choices = buildInboxCategoryChoices(categories);
  const choicesJson = JSON.stringify(choices).replace(/</g, "\\u003c");
  const selectionResolverSource = resolveInboxCategorySelection.toString();
  const categoryOptionsPattern =
    / {8}function categoryOptions\(payload\) \{[\s\S]*?\n {8}\}\n {8}function accountOptions\(payload\) \{/;
  const categoryOptionsReplacement = `        const inboxCategoryChoices = ${choicesJson};
        const inboxCategoryById = new Map(inboxCategoryChoices.map((category) => [category.id, category]));
        const resolveInboxCategorySelection = ${selectionResolverSource};
        function categoryOptions(payload) {
          const selectedId = payload.categoryId || "";
          const compatible = inboxCategoryChoices.filter((category) => category.selectable && category.kind === payload.kind);
          const selectedAvailable = !selectedId || compatible.some((category) => category.id === selectedId);
          const options = '<option value="">Sem categoria</option>' + compatible.map((category) =>
            '<option value="' + escapeHtml(category.id) + '" ' + (selectedId === category.id ? "selected" : "") + '>' + escapeHtml(category.path) + '</option>'
          ).join("");
          if (!selectedId || selectedAvailable) return options;
          const selected = inboxCategoryById.get(selectedId);
          const label = selected ? selected.path + " (indisponível)" : "Categoria indisponível";
          return options + '<option value="' + escapeHtml(selectedId) + '" selected disabled>' + escapeHtml(label) + '</option>';
        }
        function accountOptions(payload) {`;

  const statusAnchor =
    '          setStatus(lineEditStatus, "Revise os campos e salve para executar uma nova análise de duplicidade.", "muted");';
  const statusReplacement = `          const selectedCategory = payload.categoryId ? inboxCategoryById.get(payload.categoryId) : undefined;
          const selectedCategoryAvailable = !payload.categoryId || Boolean(selectedCategory && selectedCategory.selectable && selectedCategory.kind === payload.kind);
          lineEditForm.elements.categoryId.setCustomValidity(selectedCategoryAvailable ? "" : "Escolha uma categoria disponível ou Sem categoria.");
          setStatus(
            lineEditStatus,
            selectedCategoryAvailable
              ? "Revise os campos e salve para executar uma nova análise de duplicidade."
              : "A categoria atual não está disponível. Escolha outra categoria ou Sem categoria antes de salvar.",
            selectedCategoryAvailable ? "muted" : "warning"
          );`;

  const kindListenerPattern =
    / {8}lineEditForm\.elements\.kind\.addEventListener\("change", \(\) => \{[\s\S]*?\n {8}\}\);/;
  const kindListenerReplacement = `        lineEditForm.elements.kind.addEventListener("change", () => {
          const categorySelect = lineEditForm.elements.categoryId;
          const previousCategoryId = categorySelect.value || undefined;
          const nextKind = lineEditForm.elements.kind.value;
          const selection = resolveInboxCategorySelection(inboxCategoryChoices, previousCategoryId, nextKind);
          const categoryIdToPreserve = selection.unavailable ? undefined : selection.categoryId;
          categorySelect.innerHTML = categoryOptions({ kind: nextKind, categoryId: categoryIdToPreserve });
          categorySelect.value = categoryIdToPreserve || "";
          categorySelect.setCustomValidity("");
          refreshLineEditTransferFields({ kind: nextKind, categoryId: categoryIdToPreserve });
          setStatus(
            lineEditStatus,
            selection.removedBecauseIncompatible || selection.unavailable
              ? "A categoria foi removida porque não é compatível ou não está disponível para o novo tipo. Escolha outra ou mantenha Sem categoria."
              : "Revise os campos e salve para executar uma nova análise de duplicidade.",
            selection.removedBecauseIncompatible || selection.unavailable ? "warning" : "muted"
          );
        });
        lineEditForm.elements.categoryId.addEventListener("change", () => {
          lineEditForm.elements.categoryId.setCustomValidity("");
          setStatus(lineEditStatus, "Revise os campos e salve para executar uma nova análise de duplicidade.", "muted");
        });`;

  let enhanced = ofxEnhanced.replace(categoryOptionsPattern, categoryOptionsReplacement);
  if (enhanced === ofxEnhanced) return enhanceInboxReviewArchetype(ofxEnhanced);

  const withStatus = enhanced.replace(statusAnchor, statusReplacement);
  if (withStatus === enhanced) return enhanceInboxReviewArchetype(ofxEnhanced);
  enhanced = withStatus;

  const withKindListener = enhanced.replace(kindListenerPattern, kindListenerReplacement);
  if (withKindListener === enhanced) return enhanceInboxReviewArchetype(ofxEnhanced);
  enhanced = withKindListener;

  enhanced = enhanced.replace("<main", "<main data-inbox-category-hierarchy-enhanced");
  enhanced = enhanced.replace(
    "</style>",
    `
      .line-edit-dialog select[name="categoryId"] { max-width: 100%; min-width: 0; text-overflow: ellipsis; }
    </style>`,
  );

  return enhanceInboxReviewArchetype(enhanced);
}

function resolveCategoryPath(
  category: CategoryRecord,
  categoryById: ReadonlyMap<string, CategoryRecord>,
): { path: string; hierarchyState: InboxCategoryChoice["hierarchyState"] } {
  const segments = [category.name];
  const visited = new Set<string>([category.id]);
  let parentCategoryId = category.parentCategoryId;

  while (parentCategoryId) {
    if (visited.has(parentCategoryId)) {
      return {
        path: [INVALID_HIERARCHY_LABEL, ...segments].join(CATEGORY_PATH_SEPARATOR),
        hierarchyState: "cycle",
      };
    }

    const parent = categoryById.get(parentCategoryId);
    if (!parent) {
      return {
        path: [MISSING_PARENT_LABEL, ...segments].join(CATEGORY_PATH_SEPARATOR),
        hierarchyState: "missing_parent",
      };
    }

    segments.unshift(parent.name);
    visited.add(parent.id);
    parentCategoryId = parent.parentCategoryId;
  }

  return { path: segments.join(CATEGORY_PATH_SEPARATOR), hierarchyState: "valid" };
}
