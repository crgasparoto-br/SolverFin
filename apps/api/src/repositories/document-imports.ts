import { randomUUID } from "node:crypto";

import {
  buildImportPayloadFingerprint,
  buildSecureImportHash,
  buildStructuredContentHash,
  decodeStructuredImportBase64,
  parsePdfImport,
  parseXlsxImport,
  type AiSuggestion,
  type EntityId,
  type ImportBatch,
  type ImportProblemSnapshot,
  type ImportSourceKind,
  type StructuredImportPreview,
  type TenantContext,
  type TransactionExtractionPayloadV2,
  type XlsxImportMapping,
} from "@solverfin/domain";

import { query, withSharedTransaction } from "../db.js";
import { buildInsertAiSuggestionSql } from "./ai-suggestion-sql.js";
import { insertAuditLogEntry } from "./audit.js";
import {
  getImportBatchDetailForContext,
  ImportReviewError,
  type CreateImportBatchResult,
} from "./imports.js";

export interface StructuredImportPayload {
  originalFileName: string;
  contentBase64: string;
  documentClass: "bank_statement" | "credit_card_invoice";
  consentAccepted: true;
  accountId?: EntityId;
  cardId?: EntityId;
  sheetName?: string;
  xlsxMapping?: XlsxImportMapping;
}

export interface StructuredImportPreviewResult {
  persisted: false;
  sourceKind: Extract<ImportSourceKind, "xlsx" | "pdf">;
  contentHash: string;
  sourceHash: string;
  preview: StructuredImportPreview;
  suggestions: readonly AiSuggestion[];
}

interface FinancialTarget {
  id: EntityId;
  currency: string;
}

interface InstrumentRow {
  id: string;
  maskedIdentifier: string | null;
}

export async function previewStructuredImportForContext(
  context: TenantContext,
  sourceKind: Extract<ImportSourceKind, "xlsx" | "pdf">,
  payload: StructuredImportPayload,
): Promise<StructuredImportPreviewResult> {
  assertConsent(payload);
  const bytes = decodeStructuredImportBase64(payload.contentBase64);
  const contentHash = buildStructuredContentHash(bytes);
  const target = await resolveTarget(context, payload);
  const parsed =
    sourceKind === "xlsx"
      ? parseXlsxImport({
          contentBase64: payload.contentBase64,
          documentClass: payload.documentClass,
          ...(payload.sheetName === undefined ? {} : { sheetName: payload.sheetName }),
          ...(payload.xlsxMapping === undefined ? {} : { mapping: payload.xlsxMapping }),
          defaultCurrency: target.currency,
        })
      : parsePdfImport({
          contentBase64: payload.contentBase64,
          documentClass: payload.documentClass,
        });

  const problems: ImportProblemSnapshot[] = [...parsed.problems];
  const suggestions: AiSuggestion[] = [];
  const now = new Date().toISOString();
  for (const row of parsed.rows) {
    if (row.currency.toUpperCase() !== target.currency.toUpperCase()) {
      problems.push({
        rowNumber: row.rowNumber,
        severity: "error",
        code:
          payload.documentClass === "credit_card_invoice"
            ? "IMPORT_CARD_CURRENCY_MISMATCH"
            : "IMPORT_ACCOUNT_CURRENCY_MISMATCH",
        message:
          payload.documentClass === "credit_card_invoice"
            ? "A moeda da compra nao corresponde a moeda do cartao selecionado."
            : "A moeda da linha nao corresponde a moeda da conta selecionada.",
      });
      continue;
    }

    let cardInstrumentId: string | undefined;
    if (payload.documentClass === "credit_card_invoice" && payload.cardId && row.maskedInstrument) {
      const matches = await findMatchingInstruments(context, payload.cardId, row.maskedInstrument);
      if (matches.length === 1) cardInstrumentId = matches[0]!.id;
      else {
        problems.push({
          rowNumber: row.rowNumber,
          severity: "warning",
          code:
            matches.length > 1
              ? "IMPORT_CARD_INSTRUMENT_AMBIGUOUS"
              : "IMPORT_CARD_INSTRUMENT_NOT_FOUND",
          message:
            matches.length > 1
              ? "Mais de um instrumento corresponde ao identificador mascarado; revise antes de aprovar."
              : "O identificador mascarado nao encontrou instrumento ativo; revise antes de aprovar.",
        });
      }
    }

    const reviewPayload: TransactionExtractionPayloadV2 = {
      payloadVersion: 2,
      sourceRowNumber: row.rowNumber,
      sourceHash: row.sourceHash,
      occurredOn: row.occurredOn,
      kind: row.kind,
      direction: row.direction,
      amountMinor: row.amountMinor,
      currency: row.currency,
      description: row.description,
      ...(row.externalId === undefined ? {} : { externalId: row.externalId }),
      ...(payload.documentClass === "bank_statement"
        ? { targetKind: "account" as const, accountId: requireAccountId(payload) }
        : {
            targetKind: "card" as const,
            cardId: requireCardId(payload),
            ...(cardInstrumentId === undefined ? {} : { cardInstrumentId }),
            ...(row.maskedInstrument === undefined
              ? {}
              : { cardInstrumentHint: row.maskedInstrument }),
            ...(row.invoicePeriod === undefined ? {} : { invoicePeriod: row.invoicePeriod }),
            ...(row.installmentAmountMinor === undefined
              ? {}
              : { installmentAmountMinor: row.installmentAmountMinor }),
            ...(row.installmentSequence === undefined
              ? {}
              : { installmentSequence: row.installmentSequence }),
            ...(row.installmentTotal === undefined
              ? {}
              : { installmentTotal: row.installmentTotal }),
          }),
    };
    suggestions.push({
      id: randomUUID(),
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      kind: "transaction_extraction",
      status: "pending_review",
      sourceEntityId: "preview",
      confidence: 1,
      explanation: `Linha ${row.rowNumber} importada e pronta para revisao humana.`,
      payload: reviewPayload,
      provider: `solverfin-import-${sourceKind}`,
      model:
        sourceKind === "pdf"
          ? `${parsed.pdf?.parserId ?? "pdf-parser"}@${parsed.pdf?.parserVersion ?? "unknown"}`
          : "xlsx-mapper-v1",
      createdAt: now,
      updatedAt: now,
    });
  }

  const sourceHash = buildSecureImportHash(
    [
      contentHash,
      sourceKind,
      payload.documentClass,
      target.id,
      parsed.pdf?.parserId ?? "",
      parsed.pdf?.parserVersion ?? "",
      parsed.xlsx?.selectedSheet ?? "",
      JSON.stringify(payload.xlsxMapping ?? {}),
    ].join(":"),
  );
  const state =
    parsed.state === "mapping_required"
      ? "mapping_required"
      : problems.some((problem) => problem.severity === "error") || suggestions.length === 0
        ? "blocked"
        : "ready";

  return {
    persisted: false,
    sourceKind,
    contentHash,
    sourceHash,
    preview: { ...parsed, state, problems },
    suggestions,
  };
}

export async function createStructuredImportBatchForContext(
  context: TenantContext,
  sourceKind: Extract<ImportSourceKind, "xlsx" | "pdf">,
  payload: StructuredImportPayload,
): Promise<CreateImportBatchResult> {
  const prepared = await previewStructuredImportForContext(context, sourceKind, payload);
  if (prepared.preview.state === "mapping_required") {
    throw new ImportReviewError(
      "IMPORT_XLSX_MAPPING_REQUIRED",
      "Selecione a aba e mapeie data, descricao e valor antes de criar o lote.",
      422,
    );
  }
  if (prepared.preview.state !== "ready") {
    throw new ImportReviewError(
      "IMPORT_DOCUMENT_BLOCKED",
      "O documento possui inconsistencias que precisam ser corrigidas antes da criacao do lote.",
      422,
      { problems: prepared.preview.problems },
    );
  }

  const duplicateRows = await query<{ id: string }>(
    `select "id" from "ImportBatch"
     where "organizationId" = $1 and "financialProfileId" = $2 and "sourceHash" = $3
     order by "createdAt" asc limit 1`,
    [context.organizationId, context.financialProfileId, prepared.sourceHash],
  );
  if (duplicateRows[0]) {
    const detail = await getImportBatchDetailForContext(context, duplicateRows[0].id);
    return {
      ...detail,
      duplicateBatch: true,
      problems: [
        ...detail.problems,
        {
          rowNumber: 0,
          severity: "warning",
          code: "IMPORT_BATCH_DUPLICATE",
          message: "Este documento ja foi importado com a mesma configuracao e recurso financeiro.",
        },
      ],
    };
  }

  const now = new Date().toISOString();
  const batch: ImportBatch = {
    id: randomUUID(),
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    sourceKind,
    status: "reviewing",
    originalFileName: payload.originalFileName,
    sourceHash: prepared.sourceHash,
    contentHash: prepared.contentHash,
    receivedAt: now,
    createdAt: now,
    updatedAt: now,
    totalRows: prepared.preview.rows.length,
    validRows: prepared.suggestions.length,
    duplicateRows: 0,
    problemRows: new Set(
      prepared.preview.problems
        .filter((problem) => problem.severity === "error")
        .map((problem) => problem.rowNumber),
    ).size,
    problems: prepared.preview.problems,
    documentClass: payload.documentClass,
    ...(payload.accountId === undefined ? {} : { defaultAccountId: payload.accountId }),
    ...(payload.cardId === undefined ? {} : { defaultCardId: payload.cardId }),
    ...(prepared.preview.pdf === undefined
      ? {}
      : {
          parserId: prepared.preview.pdf.parserId,
          parserVersion: prepared.preview.pdf.parserVersion,
        }),
    ...(prepared.preview.xlsx?.selectedSheet === undefined
      ? {}
      : { xlsxSheetName: prepared.preview.xlsx.selectedSheet }),
    ...(payload.xlsxMapping === undefined
      ? {}
      : {
          xlsxMapping: payload.xlsxMapping as unknown as Record<
            string,
            string | number | boolean | undefined
          >,
        }),
  };
  const suggestions = prepared.suggestions.map((suggestion) => ({
    ...suggestion,
    sourceEntityId: batch.id,
    createdAt: now,
    updatedAt: now,
  }));

  const inserted = await withSharedTransaction(async (executeQuery) => {
    const rows = await executeQuery<{ id: string }>(
      `insert into "ImportBatch"
        ("id", "organizationId", "financialProfileId", "defaultAccountId", "defaultCardId", "sourceKind", "status",
         "originalFileName", "sourceHash", "contentHash", "totalRows", "validRows", "duplicateRows", "problemRows", "problems",
         "documentClass", "parserId", "parserVersion", "xlsxSheetName", "xlsxMapping",
         "receivedAt", "completedAt", "createdAt", "updatedAt")
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19,$20::jsonb,$21,$22,$23,$24)
       on conflict ("organizationId", "financialProfileId", "sourceHash") do nothing
       returning "id"`,
      [
        batch.id,
        batch.organizationId,
        batch.financialProfileId,
        batch.defaultAccountId ?? null,
        batch.defaultCardId ?? null,
        batch.sourceKind.toUpperCase(),
        batch.status.toUpperCase(),
        batch.originalFileName ?? null,
        batch.sourceHash,
        batch.contentHash ?? null,
        batch.totalRows ?? 0,
        batch.validRows ?? 0,
        0,
        batch.problemRows ?? 0,
        JSON.stringify(batch.problems ?? []),
        batch.documentClass ?? null,
        batch.parserId ?? null,
        batch.parserVersion ?? null,
        batch.xlsxSheetName ?? null,
        batch.xlsxMapping === undefined ? null : JSON.stringify(batch.xlsxMapping),
        batch.receivedAt,
        null,
        batch.createdAt,
        batch.updatedAt,
      ],
    );
    if (rows.length === 0) return false;

    await insertAuditLogEntry(executeQuery, {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      occurredAt: now,
      actorKind: "import",
      action: "create",
      entityKind: "import_batch",
      entityId: batch.id,
      reason: `Lote ${sourceKind.toUpperCase()} criado para revisao humana; arquivo bruto nao foi persistido.`,
      redactedChanges: { status: "added", sourceKind: "added", documentClass: "added" },
    });
    await insertAuditLogEntry(executeQuery, {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      occurredAt: now,
      actorKind: "user",
      actorId: context.userId,
      action: "create",
      entityKind: "privacy_consent",
      entityId: batch.id,
      reason: "Usuario confirmou autorizacao de processamento do documento financeiro.",
      redactedChanges: { consentAccepted: "added" },
    });

    for (const suggestion of suggestions) {
      const parsedPayload = suggestion.payload as TransactionExtractionPayloadV2;
      await executeQuery(buildInsertAiSuggestionSql(), [
        suggestion.id,
        suggestion.organizationId,
        suggestion.financialProfileId,
        "TRANSACTION_EXTRACTION",
        "PENDING_REVIEW",
        batch.id,
        null,
        suggestion.confidence,
        suggestion.explanation,
        JSON.stringify(parsedPayload),
        null,
        buildImportPayloadFingerprint(parsedPayload),
        suggestion.provider ?? null,
        suggestion.model ?? null,
        null,
        null,
        now,
        now,
      ]);
      await insertAuditLogEntry(executeQuery, {
        organizationId: context.organizationId,
        financialProfileId: context.financialProfileId,
        occurredAt: now,
        actorKind: "import",
        action: "create",
        entityKind: "ai_suggestion",
        entityId: suggestion.id,
        reason: "Linha de documento financeiro preparada para revisao humana.",
        redactedChanges: { status: "added", payload: "added" },
      });
    }
    return true;
  });

  if (!inserted) {
    const concurrent = await query<{ id: string }>(
      `select "id" from "ImportBatch"
       where "organizationId" = $1 and "financialProfileId" = $2 and "sourceHash" = $3
       order by "createdAt" asc limit 1`,
      [context.organizationId, context.financialProfileId, prepared.sourceHash],
    );
    if (!concurrent[0]) throw new Error("Concurrent structured import did not converge.");
    const detail = await getImportBatchDetailForContext(context, concurrent[0].id);
    return { ...detail, duplicateBatch: true };
  }

  return {
    ...(await getImportBatchDetailForContext(context, batch.id)),
    duplicateBatch: false,
  };
}

function assertConsent(payload: StructuredImportPayload): void {
  if (payload.consentAccepted !== true) {
    throw new ImportReviewError(
      "IMPORT_CONSENT_REQUIRED",
      "Confirme que o arquivo pode ser processado neste perfil financeiro.",
    );
  }
}

async function resolveTarget(
  context: TenantContext,
  payload: StructuredImportPayload,
): Promise<FinancialTarget> {
  if (payload.documentClass === "bank_statement") {
    const accountId = requireAccountId(payload);
    const rows = await query<{ id: string; status: string; currency: string }>(
      `select "id", "status", "currency" from "Account"
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
      [accountId, context.organizationId, context.financialProfileId],
    );
    const target = rows[0];
    if (!target) {
      throw new ImportReviewError(
        "TENANT_RESOURCE_NOT_FOUND",
        "Conta nao encontrada neste perfil.",
        404,
      );
    }
    if (target.status !== "ACTIVE") {
      throw new ImportReviewError(
        "IMPORT_ACCOUNT_INVALID",
        "Conta selecionada precisa estar ativa.",
      );
    }
    return target;
  }

  const cardId = requireCardId(payload);
  const rows = await query<{ id: string; status: string; currency: string | null }>(
    `select "id", "status", "currency" from "Card"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [cardId, context.organizationId, context.financialProfileId],
  );
  const target = rows[0];
  if (!target) {
    throw new ImportReviewError(
      "TENANT_RESOURCE_NOT_FOUND",
      "Cartao nao encontrado neste perfil.",
      404,
    );
  }
  if (target.status !== "ACTIVE") {
    throw new ImportReviewError("IMPORT_CARD_INVALID", "Cartao selecionado precisa estar ativo.");
  }
  if (!target.currency) {
    throw new ImportReviewError(
      "IMPORT_CARD_CURRENCY_REQUIRED",
      "Cartao precisa possuir moeda canonica antes da importacao.",
    );
  }
  return { id: target.id, currency: target.currency };
}

async function findMatchingInstruments(
  context: TenantContext,
  cardId: EntityId,
  maskedIdentifier: string,
): Promise<InstrumentRow[]> {
  return query<InstrumentRow>(
    `select "id", "maskedIdentifier" from "CardInstrument"
     where "organizationId" = $1 and "financialProfileId" = $2 and "cardId" = $3
       and "status" = 'ACTIVE' and "maskedIdentifier" = $4
     order by "createdAt" asc`,
    [context.organizationId, context.financialProfileId, cardId, maskedIdentifier],
  );
}

function requireAccountId(payload: StructuredImportPayload): EntityId {
  if (!payload.accountId) {
    throw new ImportReviewError(
      "IMPORT_ACCOUNT_REQUIRED",
      "Selecione a conta canonica do extrato antes de processar o documento.",
    );
  }
  return payload.accountId;
}

function requireCardId(payload: StructuredImportPayload): EntityId {
  if (!payload.cardId) {
    throw new ImportReviewError(
      "IMPORT_CARD_REQUIRED",
      "Selecione o cartao agrupador da fatura antes de processar o documento.",
    );
  }
  return payload.cardId;
}
