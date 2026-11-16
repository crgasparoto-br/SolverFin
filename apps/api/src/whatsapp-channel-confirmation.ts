import { createHash, createHmac } from "node:crypto";

import type { TenantContext } from "@solverfin/domain";

import {
  approveAiReviewDecisionForContext,
  rejectAiReviewDecisionForContext,
} from "./ai-review-queue-public-decision-service.js";
import { withSharedTransaction, type QueryExecutor } from "./db.js";
import { getAiSuggestionPayloadForContext } from "./repositories/ai-suggestion-payloads.js";
import { type ActiveChannelLink, WhatsappChannelError } from "./whatsapp-channel-link-repository.js";

export const WHATSAPP_CONFIRMATION_TTL_MS = 15 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{12}$/;
const ACTION_PATTERN = /^(CONFIRMAR|REJEITAR|CANCELAR)\s+([A-Za-z0-9_-]{12})$/i;

type Decision = "confirm" | "reject" | "cancel";
type ConfirmationState = "pending_confirmation" | "confirmed" | "rejected" | "cancelled" | "expired";

interface ConfirmationRow {
  id: string;
  linkId: string;
  userId: string;
  organizationId: string;
  financialProfileId: string;
  suggestionId: string;
  sourceEventId: string;
  fingerprint: string;
  status: ConfirmationState;
  expiresAt: Date;
  transactionId: string | null;
}

interface CurrentSuggestion {
  status: string;
  kind: string;
  sourceEntityId: string | null;
  fingerprint: string | null;
  originalFileName: string | null;
}

/** The code is deterministically recoverable only with the server's Meta app secret.
 * A webhook retry after a crash can reconstruct the same prompt without storing
 * either a plaintext capability token or the original financial message.
 */
function confirmationToken(eventId: string, suggestionId: string, secret: string): string {
  if (secret.length < 16) throw new WhatsappChannelError("WHATSAPP_CONFIRMATION_UNAVAILABLE", 503);
  return createHmac("sha256", secret)
    .update("solverfin-whatsapp-confirmation-v1:")
    .update(eventId)
    .update(":")
    .update(suggestionId)
    .digest("base64url")
    .slice(0, 12);
}

function hashToken(token: string): string {
  return createHash("sha256")
    .update("solverfin-whatsapp-confirmation-token-v1:")
    .update(token)
    .digest("hex");
}

function isEligibleProposal(
  detail: Awaited<ReturnType<typeof getAiSuggestionPayloadForContext>>,
): detail is typeof detail & {
  payload: Extract<typeof detail.payload, { suggestionKind: "transaction_extraction" }>;
} {
  if (detail.legacyProjection || detail.payload.suggestionKind !== "transaction_extraction") {
    return false;
  }
  const proposal = detail.payload.proposal;
  return (
    (proposal.kind === "expense" || proposal.kind === "income") &&
    typeof proposal.accountId === "string" &&
    typeof proposal.description === "string" &&
    proposal.description.trim().length > 0 &&
    Number.isSafeInteger(proposal.amountMinor) &&
    proposal.amountMinor > 0 &&
    proposal.targetKind !== "card" &&
    proposal.otherAccountId === undefined &&
    proposal.cardId === undefined &&
    proposal.installmentTotal === undefined
  );
}

function safeDescription(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/\b\d{5,}\b/g, "****")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function publicSummary(
  proposal: Extract<
    Awaited<ReturnType<typeof getAiSuggestionPayloadForContext>>["payload"],
    { suggestionKind: "transaction_extraction" }
  >["proposal"],
  token: string,
): string {
  const amount = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(proposal.amountMinor / 100);
  const description = safeDescription(proposal.description);
  const kind = proposal.kind === "income" ? "Receita" : "Despesa";
  return [
    "Proposta de lançamento (ainda não criado):",
    kind + ": " + amount + " " + proposal.currency,
    "Data: " + proposal.occurredOn,
    "Descrição: " + description,
    "",
    "Revise os dados. Para decidir, responda exatamente:",
    "CONFIRMAR " + token,
    "REJEITAR " + token,
    "CANCELAR " + token,
    "A proposta expira em 15 minutos. O app SolverFin permite revisão de campos.",
  ].join("\n");
}

async function currentSuggestion(
  executeQuery: QueryExecutor,
  context: TenantContext,
  suggestionId: string,
): Promise<CurrentSuggestion | undefined> {
  const rows = await executeQuery<CurrentSuggestion>(
    'select s."status",s."kind",s."sourceEntityId",' +
      ' coalesce(s."payload"->>\\'fingerprint\\',s."payloadFingerprint") as "fingerprint",' +
      ' b."originalFileName" from "AiSuggestion" s' +
      ' join "ImportBatch" b on b."id"=s."sourceEntityId"' +
      ' and b."organizationId"=s."organizationId" and b."financialProfileId"=s."financialProfileId"' +
      ' and b."sourceKind"=\\'BANK_MESSAGE\\' and b."originalFileName"=\\'bank-message-whatsapp\\'' +
      ' where s."id"=$1 and s."organizationId"=$2 and s."financialProfileId"=$3',
    [suggestionId, context.organizationId, context.financialProfileId],
  );
  return rows[0];
}

async function lockAuthorizedLink(
  executeQuery: QueryExecutor,
  link: ActiveChannelLink,
): Promise<boolean> {
  const rows = await executeQuery<{ id: string }>(
    'select l."id" from "WhatsappChannelLink" l' +
      ' join "User" u on u."id"=l."userId" and u."status"=\\'ACTIVE\\'' +
      ' join "FinancialProfile" p on p."id"=l."financialProfileId"' +
      ' and p."organizationId"=l."organizationId" and p."ownerUserId"=l."userId"' +
      ' and p."status"=\\'ACTIVE\\'' +
      ' where l."id"=$1 and l."provider"=\\'meta_whatsapp\\' and l."state"=\\'active\\'' +
      ' and l."accountId"=$2 and l."senderId"=$3 and l."userId"=$4' +
      ' and l."organizationId"=$5 and l."financialProfileId"=$6 and l."version"=$7' +
      ' for share of l,u,p',
    [
      link.id,
      link.accountId,
      link.senderId,
      link.userId,
      link.organizationId,
      link.financialProfileId,
      link.version,
    ],
  );
  return rows.length === 1;
}

export async function prepareWhatsappFinancialConfirmation(
  context: TenantContext,
  sourceEventId: string,
  suggestionId: string,
  link: ActiveChannelLink,
  secret = process.env.WHATSAPP_META_APP_SECRET ?? "",
  now = new Date(),
): Promise<string | null> {
  const detail = await getAiSuggestionPayloadForContext(context, suggestionId);
  if (!isEligibleProposal(detail)) return null;
  const token = confirmationToken(sourceEventId, suggestionId, secret);
  const fingerprint = detail.payload.fingerprint;

  const persisted = await withSharedTransaction(async (executeQuery) => {
    if (!(await lockAuthorizedLink(executeQuery, link))) {
      throw new WhatsappChannelError("WHATSAPP_LINK_REVOKED", 403);
    }
    const suggestion = await currentSuggestion(executeQuery, context, suggestionId);
    if (
      !suggestion ||
      suggestion.kind.toLowerCase() !== "transaction_extraction" ||
      suggestion.status.toLowerCase() !== "pending_review" ||
      suggestion.fingerprint !== fingerprint
    ) {
      return false;
    }
    await executeQuery(
      'insert into "WhatsappChannelConfirmation"' +
        ' ("id","linkId","userId","organizationId","financialProfileId",' +
        ' "sourceEventId","suggestionId","fingerprint","tokenHash","status",' +
        ' "expiresAt","createdAt","updatedAt")' +
        ' values (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,\\'pending_confirmation\\',$9,$10,$10)' +
        ' on conflict ("sourceEventId","suggestionId") do nothing',
      [
        link.id,
        context.userId,
        context.organizationId,
        context.financialProfileId,
        sourceEventId,
        suggestionId,
        fingerprint,
        hashToken(token),
        new Date(now.getTime() + WHATSAPP_CONFIRMATION_TTL_MS),
        now,
      ],
    );
    const rows = await executeQuery<ConfirmationRow>(
      'select * from "WhatsappChannelConfirmation"' +
        ' where "sourceEventId"=$1 and "suggestionId"=$2 and "linkId"=$3' +
        ' and "userId"=$4 and "organizationId"=$5 and "financialProfileId"=$6',
      [
        sourceEventId,
        suggestionId,
        link.id,
        context.userId,
        context.organizationId,
        context.financialProfileId,
      ],
    );
    return (
      rows[0]?.status === "pending_confirmation" &&
      rows[0].fingerprint === fingerprint &&
      rows[0].expiresAt > now
    );
  });
  return persisted ? publicSummary(detail.payload.proposal, token) : null;
}

export async function decideWhatsappFinancialConfirmation(
  context: TenantContext,
  decisionEventId: string,
  text: string,
  link: ActiveChannelLink,
  now = new Date(),
): Promise<{ outcome: "confirmation_resolved" | "confirmation_incomplete"; reply: string } | null> {
  const match = ACTION_PATTERN.exec(text);
  if (!match || !TOKEN_PATTERN.test(match[2]!)) return null;
  const action: Decision =
    match[1]!.toUpperCase() === "CONFIRMAR"
      ? "confirm"
      : match[1]!.toUpperCase() === "REJEITAR"
        ? "reject"
        : "cancel";
  const tokenHash = hashToken(match[2]!);

  return withSharedTransaction(async (executeQuery) => {
    if (!(await lockAuthorizedLink(executeQuery, link))) {
      return { outcome: "confirmation_incomplete", reply: "Vincule este canal novamente no SolverFin." };
    }
    const rows = await executeQuery<ConfirmationRow>(
      'select * from "WhatsappChannelConfirmation"' +
        ' where "tokenHash"=$1 and "linkId"=$2 and "userId"=$3' +
        ' and "organizationId"=$4 and "financialProfileId"=$5 for update',
      [
        tokenHash,
        link.id,
        context.userId,
        context.organizationId,
        context.financialProfileId,
      ],
    );
    const current = rows[0];
    if (!current) {
      return {
        outcome: "confirmation_incomplete",
        reply: "Código não encontrado neste canal. Consulte as propostas pendentes no SolverFin.",
      };
    }
    const intendedStatus: ConfirmationState =
      action === "confirm" ? "confirmed" : action === "reject" ? "rejected" : "cancelled";
    if (current.status !== "pending_confirmation") {
      const replay = current.status === intendedStatus;
      return {
        outcome: replay ? "confirmation_resolved" : "confirmation_incomplete",
        reply: replay
          ? action === "confirm"
            ? "Proposta já confirmada. Nenhum lançamento adicional foi criado."
            : "Essa decisão já foi registrada. Nenhum lançamento foi criado por esta resposta."
          : "Esta proposta já foi resolvida ou expirou. Inicie uma nova proposta no SolverFin.",
      };
    }
    if (current.expiresAt <= now) {
      await executeQuery(
        'update "WhatsappChannelConfirmation" set "status"=\\'expired\\',"resolvedAt"=$2,' +
          ' "decisionEventId"=$3,"updatedAt"=$2 where "id"=$1',
        [current.id, now, decisionEventId],
      );
      return {
        outcome: "confirmation_incomplete",
        reply: "Proposta expirada. Envie uma nova captura; nenhum lançamento foi criado.",
      };
    }
    if (action !== "cancel") {
      const suggestion = await currentSuggestion(executeQuery, context, current.suggestionId);
      const detail = suggestion
        ? await getAiSuggestionPayloadForContext(context, current.suggestionId)
        : null;
      if (
        !suggestion ||
        suggestion.kind.toLowerCase() !== "transaction_extraction" ||
        suggestion.status.toLowerCase() !== "pending_review" ||
        suggestion.fingerprint !== current.fingerprint ||
        !detail ||
        !isEligibleProposal(detail) ||
        detail.payload.fingerprint !== current.fingerprint
      ) {
        await executeQuery(
          'update "WhatsappChannelConfirmation" set "status"=\\'expired\\',"resolvedAt"=$2,' +
            ' "decisionEventId"=$3,"updatedAt"=$2 where "id"=$1',
          [current.id, now, decisionEventId],
        );
        return {
          outcome: "confirmation_incomplete",
          reply: "A proposta mudou ou não está mais disponível. Revise no SolverFin.",
        };
      }
    }

    let transactionId: string | null = null;
    if (action === "confirm" || action === "reject") {
      try {
        const input = {
          expectedFingerprint: current.fingerprint,
          correlationId: decisionEventId,
        };
        if (action === "confirm") {
          const result = await approveAiReviewDecisionForContext(
            context,
            current.suggestionId,
            input,
          );
          transactionId =
            "transaction" in result && result.transaction ? result.transaction.id : null;
        } else {
          await rejectAiReviewDecisionForContext(context, current.suggestionId, input);
        }
      } catch (error) {
        const controlled =
          error !== null &&
          typeof error === "object" &&
          "statusCode" in error &&
          typeof error.statusCode === "number" &&
          error.statusCode >= 400 &&
          error.statusCode < 500;
        if (!controlled) throw error;
        await executeQuery(
          'update "WhatsappChannelConfirmation" set "status"=\\'expired\\',"resolvedAt"=$2,' +
            ' "decisionEventId"=$3,"updatedAt"=$2 where "id"=$1',
          [current.id, now, decisionEventId],
        );
        return {
          outcome: "confirmation_incomplete",
          reply: "A proposta não pode mais ser aplicada. Revise no SolverFin.",
        };
      }
    }
    await executeQuery(
      'update "WhatsappChannelConfirmation" set "status"=$2,"resolvedAt"=$3,' +
        ' "decisionEventId"=$4,"transactionId"=$5,"updatedAt"=$3' +
        ' where "id"=$1 and "status"=\\'pending_confirmation\\'',
      [current.id, intendedStatus, now, decisionEventId, transactionId],
    );
    return {
      outcome: "confirmation_resolved",
      reply:
        action === "confirm"
          ? "Proposta confirmada. O lançamento foi processado pela revisão do SolverFin."
          : action === "reject"
            ? "Proposta rejeitada. Nenhum lançamento foi criado."
            : "Confirmação cancelada neste canal. Nenhum lançamento foi criado.",
    };
  });
}
