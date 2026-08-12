import { randomUUID } from "node:crypto";

import type { FinancialAssistantAnswer, FinancialAssistantEvidence, FinancialAssistantIntent } from "@solverfin/ai";
import type { TenantContext } from "@solverfin/domain";

import { query, withTransaction, type QueryExecutor } from "./db.js";

export type FinancialAssistantConversationStatus =
  | "ACTIVE"
  | "PROCESSING"
  | "AWAITING_CLARIFICATION"
  | "ANSWERED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

export type FinancialAssistantTurnStatus =
  | "PROCESSING"
  | "AWAITING_CLARIFICATION"
  | "ANSWERED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

export interface FinancialAssistantConversationRecord {
  id: string;
  organizationId: string;
  financialProfileId: string;
  userId: string;
  status: FinancialAssistantConversationStatus;
  version: number;
  currency: string | null;
  pendingIntent: string | null;
  pendingQuestion: string | null;
  pendingFilters: Record<string, unknown>;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface FinancialAssistantTurnRecord {
  id: string;
  conversationId: string;
  organizationId: string;
  financialProfileId: string;
  userId: string;
  sequence: number;
  conversationVersion: number;
  idempotencyKey: string;
  status: FinancialAssistantTurnStatus;
  normalizedQuestion: string;
  intent: string;
  filters: Record<string, unknown>;
  evidence: FinancialAssistantEvidence | null;
  safeResponse: FinancialAssistantAnswer | null;
  failureCode: string | null;
  createdAt: Date;
  answeredAt: Date | null;
}

export interface FinancialAssistantConversationView {
  conversation: FinancialAssistantConversationRecord;
  turns: FinancialAssistantTurnRecord[];
}

export class FinancialAssistantRepositoryError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "FinancialAssistantRepositoryError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const OPEN_STATUSES = ["ACTIVE", "PROCESSING", "AWAITING_CLARIFICATION", "ANSWERED", "FAILED"] as const;
const PROCESSING_LEASE_MS = 2 * 60 * 1000;

export function resolveFinancialAssistantTtlMinutes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.FINANCIAL_ASSISTANT_TTL_MINUTES?.trim();
  if (!raw) return 120;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 5 || value > 1440) {
    throw new FinancialAssistantRepositoryError(
      "ASSISTANT_TTL_INVALID",
      "FINANCIAL_ASSISTANT_TTL_MINUTES deve ser um inteiro entre 5 e 1440.",
      500,
    );
  }
  return value;
}

export async function getFinancialAssistantConversationForContext(
  context: TenantContext,
  now = new Date(),
): Promise<FinancialAssistantConversationView | undefined> {
  await withTransaction(async (executeQuery) => {
    await lockAssistantScope(executeQuery, context);
    await expireOtherProfileContexts(executeQuery, context, now);
  });
  await recoverInterruptedConversation(context, now);
  const rows = await query<FinancialAssistantConversationRecord>(
    `select * from "FinancialAssistantConversation"
      where "organizationId" = $1 and "financialProfileId" = $2 and "userId" = $3
        and "status" = any($4::text[])
      order by "updatedAt" desc, "id" desc
      limit 1`,
    [context.organizationId, context.financialProfileId, context.userId, [...OPEN_STATUSES]],
  );
  const conversation = rows[0];
  if (!conversation) return undefined;
  if (conversation.expiresAt.getTime() <= now.getTime()) {
    await expireConversation(context, conversation.id, now);
    return undefined;
  }
  return {
    conversation: mapConversation(conversation),
    turns: await listTurns(context, conversation.id),
  };
}

export async function startFinancialAssistantConversation(
  context: TenantContext,
  now = new Date(),
): Promise<FinancialAssistantConversationView> {
  const ttlMinutes = resolveFinancialAssistantTtlMinutes();
  const conversation = await withTransaction(async (executeQuery) => {
    await lockAssistantScope(executeQuery, context);
    await expireOtherProfileContexts(executeQuery, context, now);
    const existing = await findOpenConversation(executeQuery, context, true);
    if (existing) {
      if (existing.expiresAt.getTime() > now.getTime()) return mapConversation(existing);
      await markConversationExpired(executeQuery, context, existing.id, now);
    }
    const id = randomUUID();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000);
    const rows = await executeQuery<FinancialAssistantConversationRecord>(
      `insert into "FinancialAssistantConversation"
        ("id", "organizationId", "financialProfileId", "userId", "status", "version", "currency",
         "pendingIntent", "pendingQuestion", "pendingFilters", "expiresAt", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, 'ACTIVE', 0, null, null, null, '{}'::jsonb, $5, $6, $6)
       returning *`,
      [id, context.organizationId, context.financialProfileId, context.userId, expiresAt, now],
    );
    const created = rows[0];
    if (!created) throw new Error("Financial assistant conversation insert returned no row.");
    return mapConversation(created);
  });
  return { conversation, turns: [] };
}

export async function claimFinancialAssistantTurn(input: {
  context: TenantContext;
  conversationId: string;
  normalizedQuestion: string;
  idempotencyKey: string;
  intent: FinancialAssistantIntent;
  filters: Readonly<Record<string, unknown>>;
  currency?: string;
  now?: Date;
}): Promise<
  | { kind: "claimed"; conversation: FinancialAssistantConversationRecord; turn: FinancialAssistantTurnRecord }
  | { kind: "existing"; conversation: FinancialAssistantConversationRecord; turn: FinancialAssistantTurnRecord }
> {
  const now = input.now ?? new Date();
  return withTransaction(async (executeQuery) => {
    const conversation = await requireConversation(
      executeQuery,
      input.context,
      input.conversationId,
      true,
    );
    if (conversation.expiresAt.getTime() <= now.getTime()) {
      await markConversationExpired(executeQuery, input.context, conversation.id, now);
      throw new FinancialAssistantRepositoryError(
        "ASSISTANT_CONVERSATION_EXPIRED",
        "Esta conversa expirou. Inicie um novo contexto para continuar.",
        409,
      );
    }
    const existing = await findTurnByIdempotency(
      executeQuery,
      input.context,
      conversation.id,
      input.idempotencyKey,
    );
    if (existing) {
      if (existing.normalizedQuestion !== input.normalizedQuestion) {
        throw new FinancialAssistantRepositoryError(
          "ASSISTANT_IDEMPOTENCY_CONFLICT",
          "A mesma chave de idempotencia nao pode ser reutilizada para outra pergunta.",
          409,
        );
      }
      return { kind: "existing", conversation: mapConversation(conversation), turn: mapTurn(existing) };
    }
    if (conversation.status === "PROCESSING") {
      throw new FinancialAssistantRepositoryError(
        "ASSISTANT_CONVERSATION_BUSY",
        "Ja existe uma resposta em processamento nesta conversa. Aguarde a conclusao ou cancele o contexto.",
        409,
      );
    }
    if (conversation.status === "CANCELLED" || conversation.status === "EXPIRED") {
      throw new FinancialAssistantRepositoryError(
        "ASSISTANT_CONVERSATION_CLOSED",
        "Esta conversa nao aceita novas mensagens. Inicie um novo contexto.",
        409,
      );
    }
    if (conversation.currency && input.currency && conversation.currency !== input.currency) {
      await markConversationExpired(executeQuery, input.context, conversation.id, now);
      throw new FinancialAssistantRepositoryError(
        "ASSISTANT_CONTEXT_CURRENCY_CHANGED",
        "A moeda mudou. O contexto anterior foi encerrado para evitar misturar valores.",
        409,
      );
    }
    const [sequenceRow] = await executeQuery<{ nextSequence: number | string }>(
      `select coalesce(max("sequence"), 0)::int + 1 as "nextSequence"
         from "FinancialAssistantTurn"
        where "conversationId" = $1 and "organizationId" = $2 and "financialProfileId" = $3 and "userId" = $4`,
      [conversation.id, input.context.organizationId, input.context.financialProfileId, input.context.userId],
    );
    const nextVersion = conversation.version + 1;
    const nextSequence = Number(sequenceRow?.nextSequence ?? 1);
    const turnId = randomUUID();
    const turnRows = await executeQuery<FinancialAssistantTurnRecord>(
      `insert into "FinancialAssistantTurn"
        ("id", "conversationId", "organizationId", "financialProfileId", "userId", "sequence",
         "conversationVersion", "idempotencyKey", "status", "normalizedQuestion", "intent", "filters",
         "evidence", "safeResponse", "failureCode", "createdAt", "answeredAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'PROCESSING', $9, $10, $11::jsonb, null, null, null, $12, null)
       returning *`,
      [
        turnId,
        conversation.id,
        input.context.organizationId,
        input.context.financialProfileId,
        input.context.userId,
        nextSequence,
        nextVersion,
        input.idempotencyKey,
        input.normalizedQuestion,
        input.intent,
        JSON.stringify(input.filters),
        now,
      ],
    );
    const updatedRows = await executeQuery<FinancialAssistantConversationRecord>(
      `update "FinancialAssistantConversation"
          set "status" = 'PROCESSING', "version" = $5, "currency" = coalesce($6, "currency"),
              "pendingIntent" = $7, "pendingQuestion" = $8, "pendingFilters" = $9::jsonb, "updatedAt" = $10
        where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3 and "userId" = $4
        returning *`,
      [
        conversation.id,
        input.context.organizationId,
        input.context.financialProfileId,
        input.context.userId,
        nextVersion,
        input.currency ?? null,
        input.intent,
        input.normalizedQuestion,
        JSON.stringify(input.filters),
        now,
      ],
    );
    const turn = turnRows[0];
    const updated = updatedRows[0];
    if (!turn || !updated) throw new Error("Financial assistant turn claim returned no row.");
    return { kind: "claimed", conversation: mapConversation(updated), turn: mapTurn(turn) };
  });
}

export async function bindFinancialAssistantTurnResolution(input: {
  context: TenantContext;
  conversationId: string;
  turnId: string;
  conversationVersion: number;
  intent: FinancialAssistantIntent;
  filters: Readonly<Record<string, unknown>>;
  currency?: string;
  evidence?: FinancialAssistantEvidence;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  await withTransaction(async (executeQuery) => {
    const conversation = await requireConversation(executeQuery, input.context, input.conversationId, true);
    await requireTurn(executeQuery, input.context, input.conversationId, input.turnId, true);
    if (conversation.version !== input.conversationVersion || conversation.status !== "PROCESSING") {
      throw new FinancialAssistantRepositoryError(
        "ASSISTANT_CONTEXT_CHANGED",
        "O contexto mudou enquanto a pergunta era preparada. Recarregue a conversa antes de continuar.",
        409,
      );
    }
    if (conversation.currency && input.currency && conversation.currency !== input.currency) {
      await markConversationExpired(executeQuery, input.context, conversation.id, now);
      throw new FinancialAssistantRepositoryError(
        "ASSISTANT_CONTEXT_CURRENCY_CHANGED",
        "A moeda mudou. O contexto anterior foi encerrado para evitar misturar valores.",
        409,
      );
    }
    await executeQuery(
      `update "FinancialAssistantTurn"
          set "intent" = $6, "filters" = $7::jsonb, "evidence" = $8::jsonb
        where "id" = $1 and "conversationId" = $2 and "organizationId" = $3 and "financialProfileId" = $4 and "userId" = $5`,
      [
        input.turnId,
        conversation.id,
        input.context.organizationId,
        input.context.financialProfileId,
        input.context.userId,
        input.intent,
        JSON.stringify(input.filters),
        input.evidence ? JSON.stringify(input.evidence) : null,
      ],
    );
    await executeQuery(
      `update "FinancialAssistantConversation"
          set "currency" = coalesce($5, "currency"), "pendingIntent" = $6,
              "pendingFilters" = $7::jsonb, "updatedAt" = $8
        where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3 and "userId" = $4`,
      [
        conversation.id,
        input.context.organizationId,
        input.context.financialProfileId,
        input.context.userId,
        input.currency ?? null,
        input.intent,
        JSON.stringify(input.filters),
        now,
      ],
    );
  });
}

export async function finalizeFinancialAssistantTurn(input: {
  context: TenantContext;
  conversationId: string;
  turnId: string;
  conversationVersion: number;
  status: Exclude<FinancialAssistantTurnStatus, "PROCESSING">;
  evidence?: FinancialAssistantEvidence;
  safeResponse?: FinancialAssistantAnswer;
  failureCode?: string;
  pendingIntent?: FinancialAssistantIntent;
  pendingQuestion?: string;
  pendingFilters?: Readonly<Record<string, unknown>>;
  now?: Date;
}): Promise<FinancialAssistantConversationView> {
  const now = input.now ?? new Date();
  await withTransaction(async (executeQuery) => {
    const conversation = await requireConversation(
      executeQuery,
      input.context,
      input.conversationId,
      true,
    );
    const turn = await requireTurn(executeQuery, input.context, input.conversationId, input.turnId, true);
    const stale =
      conversation.version !== input.conversationVersion ||
      conversation.status === "CANCELLED" ||
      conversation.status === "EXPIRED";
    if (stale) {
      const terminal = conversation.status === "EXPIRED" ? "EXPIRED" : "CANCELLED";
      await executeQuery(
        `update "FinancialAssistantTurn"
            set "status" = $6, "failureCode" = 'ASSISTANT_CONTEXT_CHANGED', "answeredAt" = $7
          where "id" = $1 and "conversationId" = $2 and "organizationId" = $3 and "financialProfileId" = $4 and "userId" = $5`,
        [turn.id, conversation.id, input.context.organizationId, input.context.financialProfileId, input.context.userId, terminal, now],
      );
      return;
    }
    const conversationStatus = mapTurnStatusToConversationStatus(input.status);
    await executeQuery(
      `update "FinancialAssistantTurn"
          set "status" = $6, "evidence" = $7::jsonb, "safeResponse" = $8::jsonb,
              "failureCode" = $9, "answeredAt" = $10
        where "id" = $1 and "conversationId" = $2 and "organizationId" = $3 and "financialProfileId" = $4 and "userId" = $5`,
      [
        turn.id,
        conversation.id,
        input.context.organizationId,
        input.context.financialProfileId,
        input.context.userId,
        input.status,
        input.evidence ? JSON.stringify(input.evidence) : null,
        input.safeResponse ? JSON.stringify(input.safeResponse) : null,
        input.failureCode ?? null,
        now,
      ],
    );
    const keepPending = input.status === "AWAITING_CLARIFICATION";
    await executeQuery(
      `update "FinancialAssistantConversation"
          set "status" = $5,
              "pendingIntent" = $6,
              "pendingQuestion" = $7,
              "pendingFilters" = $8::jsonb,
              "updatedAt" = $9
        where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3 and "userId" = $4`,
      [
        conversation.id,
        input.context.organizationId,
        input.context.financialProfileId,
        input.context.userId,
        conversationStatus,
        keepPending ? (input.pendingIntent ?? turn.intent) : null,
        keepPending ? (input.pendingQuestion ?? turn.normalizedQuestion) : null,
        JSON.stringify(keepPending ? (input.pendingFilters ?? turn.filters) : {}),
        now,
      ],
    );
  });
  const view = await getConversationById(input.context, input.conversationId, true);
  if (!view) throw new Error("Finalized financial assistant conversation was not found.");
  return view;
}

export async function cancelFinancialAssistantConversation(
  context: TenantContext,
  conversationId: string,
  now = new Date(),
): Promise<FinancialAssistantConversationView> {
  await withTransaction(async (executeQuery) => {
    const conversation = await requireConversation(executeQuery, context, conversationId, true);
    if (conversation.status === "CANCELLED" || conversation.status === "EXPIRED") return;
    if (conversation.expiresAt.getTime() <= now.getTime()) {
      await markConversationExpired(executeQuery, context, conversation.id, now);
      return;
    }
    await executeQuery(
      `update "FinancialAssistantConversation"
          set "status" = 'CANCELLED', "version" = "version" + 1, "pendingIntent" = null,
              "pendingQuestion" = null, "pendingFilters" = '{}'::jsonb, "updatedAt" = $5
        where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3 and "userId" = $4`,
      [conversation.id, context.organizationId, context.financialProfileId, context.userId, now],
    );
    await executeQuery(
      `update "FinancialAssistantTurn"
          set "status" = 'CANCELLED', "failureCode" = 'ASSISTANT_CANCELLED', "answeredAt" = coalesce("answeredAt", $5)
        where "conversationId" = $1 and "organizationId" = $2 and "financialProfileId" = $3 and "userId" = $4
          and "status" = 'PROCESSING'`,
      [conversation.id, context.organizationId, context.financialProfileId, context.userId, now],
    );
  });
  const view = await getConversationById(context, conversationId, true);
  if (!view) throw new Error("Cancelled financial assistant conversation was not found.");
  return view;
}

export async function clearFinancialAssistantConversation(
  context: TenantContext,
  conversationId: string,
  now = new Date(),
): Promise<void> {
  await cancelFinancialAssistantConversation(context, conversationId, now);
}

export async function getConversationById(
  context: TenantContext,
  conversationId: string,
  includeTerminal = false,
): Promise<FinancialAssistantConversationView | undefined> {
  const statusClause = includeTerminal ? "" : ` and "status" = any($5::text[])`;
  const params: unknown[] = [context.organizationId, context.financialProfileId, context.userId, conversationId];
  if (!includeTerminal) params.push([...OPEN_STATUSES]);
  const rows = await query<FinancialAssistantConversationRecord>(
    `select * from "FinancialAssistantConversation"
      where "organizationId" = $1 and "financialProfileId" = $2 and "userId" = $3 and "id" = $4${statusClause}
      limit 1`,
    params,
  );
  const conversation = rows[0];
  if (!conversation) return undefined;
  return { conversation: mapConversation(conversation), turns: await listTurns(context, conversationId) };
}

async function listTurns(
  context: TenantContext,
  conversationId: string,
): Promise<FinancialAssistantTurnRecord[]> {
  const rows = await query<FinancialAssistantTurnRecord>(
    `select * from "FinancialAssistantTurn"
      where "conversationId" = $1 and "organizationId" = $2 and "financialProfileId" = $3 and "userId" = $4
      order by "sequence" asc`,
    [conversationId, context.organizationId, context.financialProfileId, context.userId],
  );
  return rows.map(mapTurn);
}

async function recoverInterruptedConversation(context: TenantContext, now: Date): Promise<void> {
  await withTransaction(async (executeQuery) => {
    const conversation = await findOpenConversation(executeQuery, context, true);
    if (!conversation) return;
    if (conversation.expiresAt.getTime() <= now.getTime()) {
      await markConversationExpired(executeQuery, context, conversation.id, now);
      return;
    }
    if (
      conversation.status !== "PROCESSING" ||
      now.getTime() - conversation.updatedAt.getTime() < PROCESSING_LEASE_MS
    ) {
      return;
    }
    await executeQuery(
      `update "FinancialAssistantTurn"
          set "status" = 'FAILED', "failureCode" = 'ASSISTANT_PROCESS_INTERRUPTED', "answeredAt" = $5
        where "conversationId" = $1 and "organizationId" = $2 and "financialProfileId" = $3 and "userId" = $4
          and "status" = 'PROCESSING'`,
      [conversation.id, context.organizationId, context.financialProfileId, context.userId, now],
    );
    await executeQuery(
      `update "FinancialAssistantConversation"
          set "status" = 'FAILED', "pendingIntent" = null, "pendingQuestion" = null,
              "pendingFilters" = '{}'::jsonb, "updatedAt" = $5
        where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3 and "userId" = $4`,
      [conversation.id, context.organizationId, context.financialProfileId, context.userId, now],
    );
  });
}

async function expireConversation(context: TenantContext, conversationId: string, now: Date): Promise<void> {
  await withTransaction((executeQuery) => markConversationExpired(executeQuery, context, conversationId, now));
}

async function markConversationExpired(
  executeQuery: QueryExecutor,
  context: TenantContext,
  conversationId: string,
  now: Date,
): Promise<void> {
  await executeQuery(
    `update "FinancialAssistantConversation"
        set "status" = 'EXPIRED', "version" = "version" + 1, "pendingIntent" = null,
            "pendingQuestion" = null, "pendingFilters" = '{}'::jsonb, "updatedAt" = $5
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3 and "userId" = $4
        and "status" <> 'EXPIRED'`,
    [conversationId, context.organizationId, context.financialProfileId, context.userId, now],
  );
  await executeQuery(
    `update "FinancialAssistantTurn"
        set "status" = 'EXPIRED', "failureCode" = 'ASSISTANT_EXPIRED', "answeredAt" = coalesce("answeredAt", $5)
      where "conversationId" = $1 and "organizationId" = $2 and "financialProfileId" = $3 and "userId" = $4
        and "status" = 'PROCESSING'`,
    [conversationId, context.organizationId, context.financialProfileId, context.userId, now],
  );
}

async function expireOtherProfileContexts(
  executeQuery: QueryExecutor,
  context: TenantContext,
  now: Date,
): Promise<void> {
  await executeQuery(
    `with expired as (
       update "FinancialAssistantConversation"
          set "status" = 'EXPIRED', "version" = "version" + 1, "pendingIntent" = null,
              "pendingQuestion" = null, "pendingFilters" = '{}'::jsonb, "updatedAt" = $4
        where "organizationId" = $1 and "userId" = $2 and "financialProfileId" <> $3
          and "status" = any($5::text[])
        returning "id", "financialProfileId"
     )
     update "FinancialAssistantTurn" as turn
        set "status" = 'EXPIRED', "failureCode" = 'ASSISTANT_PROFILE_CONTEXT_CHANGED',
            "answeredAt" = coalesce(turn."answeredAt", $4)
       from expired
      where turn."conversationId" = expired."id"
        and turn."organizationId" = $1 and turn."userId" = $2
        and turn."financialProfileId" = expired."financialProfileId"
        and turn."status" = 'PROCESSING'`,
    [context.organizationId, context.userId, context.financialProfileId, now, [...OPEN_STATUSES]],
  );
}

async function lockAssistantScope(executeQuery: QueryExecutor, context: TenantContext): Promise<void> {
  await executeQuery(`select pg_advisory_xact_lock(hashtext($1), hashtext($2))`, [
    `${context.organizationId}:${context.userId}`,
    "financial-assistant-context",
  ]);
}

async function findOpenConversation(
  executeQuery: QueryExecutor,
  context: TenantContext,
  forUpdate: boolean,
): Promise<FinancialAssistantConversationRecord | undefined> {
  const rows = await executeQuery<FinancialAssistantConversationRecord>(
    `select * from "FinancialAssistantConversation"
      where "organizationId" = $1 and "financialProfileId" = $2 and "userId" = $3
        and "status" = any($4::text[])
      order by "updatedAt" desc, "id" desc
      limit 1${forUpdate ? " for update" : ""}`,
    [context.organizationId, context.financialProfileId, context.userId, [...OPEN_STATUSES]],
  );
  return rows[0] ? mapConversation(rows[0]) : undefined;
}

async function requireConversation(
  executeQuery: QueryExecutor,
  context: TenantContext,
  conversationId: string,
  forUpdate: boolean,
): Promise<FinancialAssistantConversationRecord> {
  const rows = await executeQuery<FinancialAssistantConversationRecord>(
    `select * from "FinancialAssistantConversation"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3 and "userId" = $4
      limit 1${forUpdate ? " for update" : ""}`,
    [conversationId, context.organizationId, context.financialProfileId, context.userId],
  );
  const row = rows[0];
  if (!row) {
    throw new FinancialAssistantRepositoryError(
      "ASSISTANT_CONVERSATION_NOT_FOUND",
      "Conversa nao encontrada no perfil financeiro ativo.",
      404,
    );
  }
  return mapConversation(row);
}

async function requireTurn(
  executeQuery: QueryExecutor,
  context: TenantContext,
  conversationId: string,
  turnId: string,
  forUpdate: boolean,
): Promise<FinancialAssistantTurnRecord> {
  const rows = await executeQuery<FinancialAssistantTurnRecord>(
    `select * from "FinancialAssistantTurn"
      where "id" = $1 and "conversationId" = $2 and "organizationId" = $3 and "financialProfileId" = $4 and "userId" = $5
      limit 1${forUpdate ? " for update" : ""}`,
    [turnId, conversationId, context.organizationId, context.financialProfileId, context.userId],
  );
  const row = rows[0];
  if (!row) throw new Error("Financial assistant turn not found after claim.");
  return mapTurn(row);
}

async function findTurnByIdempotency(
  executeQuery: QueryExecutor,
  context: TenantContext,
  conversationId: string,
  idempotencyKey: string,
): Promise<FinancialAssistantTurnRecord | undefined> {
  const rows = await executeQuery<FinancialAssistantTurnRecord>(
    `select * from "FinancialAssistantTurn"
      where "conversationId" = $1 and "organizationId" = $2 and "financialProfileId" = $3 and "userId" = $4
        and "idempotencyKey" = $5
      limit 1`,
    [conversationId, context.organizationId, context.financialProfileId, context.userId, idempotencyKey],
  );
  return rows[0] ? mapTurn(rows[0]) : undefined;
}

function mapTurnStatusToConversationStatus(
  status: Exclude<FinancialAssistantTurnStatus, "PROCESSING">,
): FinancialAssistantConversationStatus {
  switch (status) {
    case "AWAITING_CLARIFICATION":
      return "AWAITING_CLARIFICATION";
    case "ANSWERED":
      return "ANSWERED";
    case "FAILED":
      return "FAILED";
    case "CANCELLED":
      return "CANCELLED";
    case "EXPIRED":
      return "EXPIRED";
  }
}

function mapConversation(row: FinancialAssistantConversationRecord): FinancialAssistantConversationRecord {
  return {
    ...row,
    version: Number(row.version),
    pendingFilters: asObject(row.pendingFilters),
    expiresAt: new Date(row.expiresAt),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function mapTurn(row: FinancialAssistantTurnRecord): FinancialAssistantTurnRecord {
  return {
    ...row,
    sequence: Number(row.sequence),
    conversationVersion: Number(row.conversationVersion),
    filters: asObject(row.filters),
    evidence: (row.evidence ?? null) as FinancialAssistantEvidence | null,
    safeResponse: (row.safeResponse ?? null) as FinancialAssistantAnswer | null,
    createdAt: new Date(row.createdAt),
    answeredAt: row.answeredAt ? new Date(row.answeredAt) : null,
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
