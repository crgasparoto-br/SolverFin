import type { TenantContext, Transaction, TransactionKind, TransactionStatus } from "./index.js";

export type GroupableTransaction = Transaction & {
  cardId?: string;
  invoiceId?: string;
  transactionGroupId?: string;
};

export interface TransactionGroupProjection {
  id: string;
  organizationId: string;
  financialProfileId: string;
  accountId: string;
  description: string;
  displayOn: string;
  kind: Extract<TransactionKind, "income" | "expense">;
  status: TransactionStatus;
  currency: string;
  totalAmountMinor: number;
  members: readonly GroupableTransaction[];
}

export class TransactionGroupError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 422,
  ) {
    super(message);
  }
}

export function validateTransactionGroupMembers(
  context: TenantContext,
  members: readonly GroupableTransaction[],
): {
  accountId: string;
  kind: Extract<TransactionKind, "income" | "expense">;
  status: TransactionStatus;
  currency: string;
  totalAmountMinor: number;
} {
  if (members.length < 2) {
    throw new TransactionGroupError(
      "TRANSACTION_GROUP_MIN_MEMBERS",
      "Selecione ao menos dois lançamentos.",
    );
  }

  const first = members[0];
  if (!first) throw new TransactionGroupError("TRANSACTION_GROUP_MIN_MEMBERS", "Seleção vazia.");
  if (!first.accountId || (first.kind !== "income" && first.kind !== "expense")) {
    throw ineligible();
  }

  let totalAmountMinor = 0;
  for (const member of members) {
    if (
      member.organizationId !== context.organizationId ||
      member.financialProfileId !== context.financialProfileId
    ) {
      throw new TransactionGroupError(
        "TENANT_RESOURCE_NOT_FOUND",
        "Lançamento não encontrado para este perfil.",
        404,
      );
    }
    if (
      !member.accountId ||
      member.kind === "transfer" ||
      member.status === "suggested" ||
      member.status === "voided" ||
      member.cardId ||
      member.invoiceId
    ) {
      throw ineligible();
    }
    if (member.transactionGroupId) {
      throw new TransactionGroupError(
        "TRANSACTION_ALREADY_GROUPED",
        "Um dos lançamentos já pertence a outro grupo.",
        409,
      );
    }
    if (
      member.accountId !== first.accountId ||
      member.kind !== first.kind ||
      member.status !== first.status ||
      member.currency !== first.currency
    ) {
      throw new TransactionGroupError(
        "TRANSACTION_GROUP_INCOMPATIBLE",
        "Os lançamentos selecionados precisam ter conta, tipo, moeda e situação iguais.",
      );
    }
    if (!Number.isSafeInteger(member.amountMinor)) throw ineligible();
    totalAmountMinor += member.amountMinor;
    if (!Number.isSafeInteger(totalAmountMinor)) throw ineligible();
  }

  return {
    accountId: first.accountId,
    kind: first.kind,
    status: first.status,
    currency: first.currency,
    totalAmountMinor,
  };
}

function ineligible(): TransactionGroupError {
  return new TransactionGroupError(
    "TRANSACTION_GROUP_MEMBER_INELIGIBLE",
    "A seleção contém um lançamento que não pode ser unificado.",
  );
}
