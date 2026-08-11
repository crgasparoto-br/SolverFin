import type {
  InsightNavigationV2,
  PublicCategorizationProposal,
  PublicDeterministicReviewProposal,
  PublicInsightProposal,
  PublicInsightProposalV2,
  PublicTransactionExtractionProposal,
} from "@solverfin/domain/ai-suggestion-payloads";

import {
  parseAiSuggestionPayloadResponse,
  type AiSuggestionPayloadViewModel,
} from "./ai-suggestion-payload-contract.js";
import { apiGet } from "./api.js";

const AI_REVIEW_APPROVAL_PATH = /data-api-path="\/api\/ai-review-queue\/([0-9a-f-]+)\/approve"/gi;

export async function enhanceInboxWithStructuredPayloads(
  html: string,
  credential: string,
): Promise<string> {
  const suggestionIds = collectAiReviewSuggestionIds(html);
  if (suggestionIds.length === 0) return html;

  const payloads = await Promise.all(
    suggestionIds.map(async (suggestionId) => {
      const response = await apiGet<unknown>(
        credential,
        `/api/ai-review-queue/${encodeURIComponent(suggestionId)}/payload`,
      );
      if (!response.ok) return undefined;

      try {
        return parseAiSuggestionPayloadResponse(response.data);
      } catch {
        return undefined;
      }
    }),
  );

  return enhanceInboxHtmlWithStructuredPayloads(html, payloads.filter(isStructuredPayload));
}

export function enhanceInboxHtmlWithStructuredPayloads(
  html: string,
  payloads: readonly AiSuggestionPayloadViewModel[],
): string {
  const enhanced = payloads.reduce(
    (currentHtml, payload) => injectStructuredPayload(currentHtml, payload),
    html,
  );
  return injectStructuredPayloadRuntime(enhanced, payloads);
}

function injectStructuredPayloadRuntime(
  html: string,
  payloads: readonly AiSuggestionPayloadViewModel[],
): string {
  if (payloads.length === 0 || !html.includes("</body>")) return html;
  const summaries = Object.fromEntries(
    payloads.map((payload) => [payload.suggestionId, renderStructuredPayloadSummary(payload)]),
  );
  const serializedSummaries = JSON.stringify(summaries).replaceAll("<", "\\u003c");
  const script = `
    <script data-ai-structured-payload-runtime="true">
      (() => {
        const summaries = ${serializedSummaries};
        let scheduled = false;

        function hydrateStructuredPayloads() {
          document.querySelectorAll("[data-review-id]").forEach((card) => {
            if (card.querySelector('[data-ai-structured-payload="true"]')) return;
            const summary = summaries[card.dataset.reviewId || ""];
            const actions = card.querySelector(".maintenance-actions");
            if (!summary || !actions) return;
            actions.insertAdjacentHTML("beforebegin", summary);
          });
        }

        const observer = new MutationObserver(() => {
          if (scheduled) return;
          scheduled = true;
          queueMicrotask(() => {
            scheduled = false;
            hydrateStructuredPayloads();
          });
        });

        hydrateStructuredPayloads();
        observer.observe(document.body, { childList: true, subtree: true });
      })();
    </script>`;
  return html.replace("</body>", `${script}\n</body>`);
}

function collectAiReviewSuggestionIds(html: string): string[] {
  const suggestionIds = new Set<string>();
  for (const match of html.matchAll(AI_REVIEW_APPROVAL_PATH)) {
    const suggestionId = match[1];
    if (suggestionId !== undefined) suggestionIds.add(suggestionId);
  }
  return [...suggestionIds];
}

function injectStructuredPayload(html: string, payload: AiSuggestionPayloadViewModel): string {
  const label = `aria-label="Ações da sugestão ${escapeHtml(payload.suggestionId)}"`;
  const labelIndex = html.indexOf(label);
  if (labelIndex < 0) return html;

  const actionsIndex = html.lastIndexOf('<div class="maintenance-actions"', labelIndex);
  if (actionsIndex < 0) return html;

  const articleIndex = html.lastIndexOf('<article class="maintenance-item">', actionsIndex);
  const existingEnhancementIndex = html.lastIndexOf(
    'data-ai-structured-payload="true"',
    actionsIndex,
  );
  if (existingEnhancementIndex > articleIndex) return html;

  const summary = renderStructuredPayloadSummary(payload);
  return `${html.slice(0, actionsIndex)}${summary}${html.slice(actionsIndex)}`;
}

function renderStructuredPayloadSummary(payload: AiSuggestionPayloadViewModel): string {
  const details = resolvePayloadDetails(payload);
  const confidence =
    payload.confidence === undefined
      ? ""
      : `<p><strong>Confiança:</strong> ${Math.round(payload.confidence * 100)}%</p>`;
  return `
      <div class="message-preview structured-payload-preview" data-ai-structured-payload="true">
        <p><span class="eyebrow">Dados estruturados ${escapeHtml(payload.versionLabel)}</span></p>
        <p><strong>${escapeHtml(details.title)}</strong></p>
        <p>${escapeHtml(details.description)}</p>
        ${confidence}
        ${details.additionalHtml}
      </div>
      `;
}

function resolvePayloadDetails(payload: AiSuggestionPayloadViewModel): {
  title: string;
  description: string;
  additionalHtml: string;
} {
  switch (payload.kind) {
    case "transaction_extraction":
      return withNoAdditional(
        transactionDetails(payload.proposal as PublicTransactionExtractionProposal),
      );
    case "categorization":
      return withNoAdditional(
        categorizationDetails(payload.proposal as PublicCategorizationProposal),
      );
    case "deduplication":
      return withNoAdditional(
        deterministicDetails(
          "Possível duplicidade",
          payload.proposal as PublicDeterministicReviewProposal,
        ),
      );
    case "reconciliation":
      return withNoAdditional(
        deterministicDetails(
          "Possível conciliação",
          payload.proposal as PublicDeterministicReviewProposal,
        ),
      );
    case "insight":
      return insightDetails(payload.proposal as PublicInsightProposal);
    default:
      throw new Error("Unsupported AI suggestion payload kind.");
  }
}

function withNoAdditional(details: { title: string; description: string }): {
  title: string;
  description: string;
  additionalHtml: string;
} {
  return { ...details, additionalHtml: "" };
}

function transactionDetails(proposal: PublicTransactionExtractionProposal): {
  title: string;
  description: string;
} {
  const kindLabel =
    proposal.kind === "income"
      ? "Receita"
      : proposal.kind === "expense"
        ? "Despesa"
        : "Transferência";
  return {
    title: `${kindLabel} de ${formatMinorCurrency(proposal.amountMinor, proposal.currency)}`,
    description: `${proposal.occurredOn} · ${proposal.description}`,
  };
}

function categorizationDetails(proposal: PublicCategorizationProposal): {
  title: string;
  description: string;
} {
  const fields = [
    proposal.proposedCategoryId === undefined ? undefined : "categoria",
    proposal.proposedAccountId === undefined ? undefined : "conta",
    proposal.proposedCardId === undefined ? undefined : "cartão",
    proposal.proposedStatus === undefined ? undefined : "situação",
  ].filter(isString);
  return {
    title: "Classificação sugerida",
    description:
      fields.length === 0
        ? "A proposta estruturada está disponível para revisão."
        : `Campos propostos: ${fields.join(", ")}.`,
  };
}

function deterministicDetails(
  title: string,
  proposal: PublicDeterministicReviewProposal,
): { title: string; description: string } {
  const conflictCount = proposal.conflicts.length;
  return {
    title,
    description:
      conflictCount === 0
        ? "Nenhum conflito estrutural adicional foi informado."
        : `${conflictCount} ${conflictCount === 1 ? "conflito estruturado" : "conflitos estruturados"} para revisar.`,
  };
}

function insightDetails(proposal: PublicInsightProposal): {
  title: string;
  description: string;
  additionalHtml: string;
} {
  if (!isInsightV2(proposal)) {
    return {
      title: proposal.title,
      description: `${proposal.summary} Período: ${proposal.periodStartOn} a ${proposal.periodEndOn}.`,
      additionalHtml: "",
    };
  }

  const criterion = resolveInsightCriterion(proposal);
  const filters = renderInsightFilters(proposal);
  const evidence = proposal.evidence
    .map(
      (item) =>
        `<li>${escapeHtml(item.label)}: ${escapeHtml(formatEvidence(item, proposal.currency))}</li>`,
    )
    .join("");
  const limitations = proposal.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const navigation =
    proposal.navigation === undefined
      ? ""
      : renderInsightNavigation(proposal.navigation, proposal.periodStartOn);
  return {
    title: proposal.title,
    description: `${proposal.summary} Período: ${proposal.periodStartOn} a ${proposal.periodEndOn}.`,
    additionalHtml: `
        <div data-insight-criterion="true">
          <p><strong>Critério</strong></p>
          <p>${escapeHtml(criterion)}</p>
        </div>
        <div data-insight-filters="true">
          <p><strong>Filtros aplicados</strong></p>
          <ul>${filters}</ul>
        </div>
        <div data-insight-evidence="true">
          <p><strong>Evidências verificáveis</strong></p>
          <ul>${evidence}</ul>
        </div>
        ${limitations.length === 0 ? "" : `<div data-insight-limitations="true"><p><strong>Limitações</strong></p><ul>${limitations}</ul></div>`}
        ${navigation}
      `,
  };
}

function isInsightV2(proposal: PublicInsightProposal): proposal is PublicInsightProposalV2 {
  return "evidence" in proposal && "calculationVersion" in proposal;
}

function formatEvidence(
  evidence: PublicInsightProposalV2["evidence"][number],
  currency: string,
): string {
  if (evidence.unit === "minor_currency") {
    return formatMinorCurrency(evidence.value, evidence.currency ?? currency);
  }
  if (evidence.unit === "percentage") return `${evidence.value}%`;
  return String(evidence.value);
}

function resolveInsightCriterion(proposal: PublicInsightProposalV2): string {
  switch (proposal.insightKind) {
    case "category_spending_increase":
    case "merchant_spending_increase":
      return "Aumento de pelo menos 25% com no mínimo 2 lançamentos realizados em cada período comparável.";
    case "probable_subscription":
      return "Pelo menos 3 meses consecutivos com variação de valor de até 20% em relação à média dos meses observados.";
    case "negative_balance_risk":
      return "Saldo agregado projetado abaixo de zero até o fim do horizonte mensal.";
    case "budget_exceeded":
      return "Despesas realizadas confirmadas da categoria acima do orçamento ativo, na mesma moeda e dentro da janela do orçamento.";
    case "monthly_summary":
      return "Existe ao menos um lançamento realizado no período; o resumo usa apenas lançamentos confirmados ou conciliados.";
  }
}

function renderInsightFilters(proposal: PublicInsightProposalV2): string {
  const items = [`<li>Moeda: ${escapeHtml(proposal.filters.currency)}</li>`];
  if (proposal.filters.categoryId !== undefined) {
    items.push("<li>Categoria: a categoria indicada no título e na navegação deste insight.</li>");
  }
  if (proposal.filters.merchantKey !== undefined) {
    items.push(`<li>Estabelecimento normalizado: ${escapeHtml(proposal.filters.merchantKey)}</li>`);
  }
  if (proposal.filters.categoryId === undefined && proposal.filters.merchantKey === undefined) {
    items.push(
      proposal.insightKind === "negative_balance_risk"
        ? "<li>Escopo: contas e lançamentos elegíveis do perfil na moeda informada.</li>"
        : "<li>Escopo: lançamentos realizados elegíveis do perfil no período.</li>",
    );
  }
  return items.join("");
}

function renderInsightNavigation(navigation: InsightNavigationV2, periodStartOn: string): string {
  const destination =
    navigation.view === "budgets"
      ? { href: "/orcamentos", label: "Abrir orçamentos" }
      : navigation.view === "cash_flow"
        ? { href: "/relatorios", label: "Abrir relatórios" }
        : { href: "/lancamentos", label: "Abrir lançamentos" };
  const params = new URLSearchParams();

  if (navigation.view === "transactions") {
    const month = periodStartOn.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(month)) params.set("month", month);
    if (navigation.categoryId !== undefined) params.set("categoryId", navigation.categoryId);
    if (navigation.merchantKey !== undefined) params.set("merchantKey", navigation.merchantKey);
  } else if (navigation.view === "budgets" && navigation.categoryId !== undefined) {
    params.set("categoryId", navigation.categoryId);
  }

  const query = params.toString();
  const href = query.length === 0 ? destination.href : `${destination.href}?${query}`;
  return `<p><a href="${escapeHtml(href)}" data-insight-navigation="true">${destination.label}</a></p>`;
}

function formatMinorCurrency(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(
      amountMinor / 100,
    );
  } catch {
    return `${currency} ${(amountMinor / 100).toFixed(2)}`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isStructuredPayload(
  value: AiSuggestionPayloadViewModel | undefined,
): value is AiSuggestionPayloadViewModel {
  return value !== undefined;
}

function isString(value: string | undefined): value is string {
  return value !== undefined;
}
