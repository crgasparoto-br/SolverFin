import type {
  PublicCategorizationProposal,
  PublicDeterministicReviewProposal,
  PublicInsightProposal,
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
  return payloads.reduce(
    (currentHtml, payload) => injectStructuredPayload(currentHtml, payload),
    html,
  );
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
  return `
      <div class="message-preview structured-payload-preview" data-ai-structured-payload="true">
        <p><span class="eyebrow">Dados estruturados ${escapeHtml(payload.versionLabel)}</span></p>
        <p><strong>${escapeHtml(details.title)}</strong></p>
        <p>${escapeHtml(details.description)}</p>
      </div>
      `;
}

function resolvePayloadDetails(payload: AiSuggestionPayloadViewModel): {
  title: string;
  description: string;
} {
  switch (payload.kind) {
    case "transaction_extraction":
      return transactionDetails(payload.proposal as PublicTransactionExtractionProposal);
    case "categorization":
      return categorizationDetails(payload.proposal as PublicCategorizationProposal);
    case "deduplication":
      return deterministicDetails(
        "Possível duplicidade",
        payload.proposal as PublicDeterministicReviewProposal,
      );
    case "reconciliation":
      return deterministicDetails(
        "Possível conciliação",
        payload.proposal as PublicDeterministicReviewProposal,
      );
    case "insight":
      return insightDetails(payload.proposal as PublicInsightProposal);
    default:
      throw new Error("Unsupported AI suggestion payload kind.");
  }
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
} {
  return {
    title: proposal.title,
    description: `${proposal.summary} Período: ${proposal.periodStartOn} a ${proposal.periodEndOn}.`,
  };
}

function formatMinorCurrency(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
    }).format(amountMinor / 100);
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
