import type {
  TransactionContext,
  TransactionDataSet,
  TransactionFilterOptions,
  TransactionFilters,
  TransactionFormInput,
  TransactionRecord,
  TransactionStateKind,
  TransactionSummary,
  TransactionType,
  TransactionValidationIssue,
  TransactionValidationResult,
  TransactionViewModel,
} from "./types.js";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export function buildTransactionViewModel(
  dataSet: TransactionDataSet | undefined,
  state: TransactionStateKind = "ready",
): TransactionViewModel {
  if (dataSet === undefined) {
    return buildUnavailableTransactions(state);
  }

  const scopedTransactions = filterTransactionsByContext(dataSet.transactions, dataSet.context);
  const filteredTransactions = applyTransactionFilters(scopedTransactions, dataSet.filters);
  const sortedTransactions = sortTransactions(filteredTransactions);
  const hasTransactions = scopedTransactions.length > 0;

  if (!hasTransactions && state === "ready") {
    return {
      state: "empty",
      title: "Registre seu primeiro lancamento",
      description: "Adicione receitas, despesas ou transferencias para acompanhar sua rotina.",
      context: dataSet.context,
      filters: dataSet.filters,
      summary: calculateTransactionSummary([]),
      transactions: [],
      filterOptions: buildTransactionFilterOptions(scopedTransactions),
    };
  }

  const viewModel: TransactionViewModel = {
    state,
    title: "Lancamentos",
    description: "Registre, filtre e acompanhe receitas, despesas e transferencias.",
    context: dataSet.context,
    filters: dataSet.filters,
    summary: calculateTransactionSummary(sortedTransactions),
    transactions: sortedTransactions,
    filterOptions: buildTransactionFilterOptions(scopedTransactions),
  };

  if (state === "success") {
    viewModel.feedbackMessage = "Lancamento salvo. O resumo ja considera a alteracao.";
  }

  return viewModel;
}

export function validateTransactionForm(input: TransactionFormInput): TransactionValidationResult {
  const issues: TransactionValidationIssue[] = [];

  addRequiredTextIssue(issues, "description", input.description, "Informe uma descricao.");

  if (!isoDatePattern.test(input.date)) {
    issues.push({ field: "date", message: "Informe uma data valida no formato AAAA-MM-DD." });
  }

  if (input.type === "") {
    issues.push({ field: "type", message: "Escolha receita, despesa ou transferencia." });
  }

  if (input.amountInCents === undefined || !Number.isInteger(input.amountInCents) || input.amountInCents <= 0) {
    issues.push({ field: "amountInCents", message: "Informe um valor maior que zero." });
  }

  if (input.accountId === undefined || input.accountId.trim().length === 0) {
    issues.push({ field: "accountId", message: "Escolha a conta de origem." });
  }

  if (input.type === "transfer") {
    if (input.destinationAccountId === undefined || input.destinationAccountId.trim().length === 0) {
      issues.push({ field: "destinationAccountId", message: "Escolha a conta de destino." });
    }

    if (input.destinationAccountId !== undefined && input.destinationAccountId === input.accountId) {
      issues.push({ field: "destinationAccountId", message: "A conta de destino deve ser diferente da origem." });
    }
  }

  return toValidationResult(issues);
}

export function applyTransactionFilters(
  transactions: readonly TransactionRecord[],
  filters: TransactionFilters,
): TransactionRecord[] {
  return transactions.filter((transaction) => {
    if (filters.startsOn !== undefined && transaction.date < filters.startsOn) {
      return false;
    }

    if (filters.endsOn !== undefined && transaction.date > filters.endsOn) {
      return false;
    }

    if (filters.accountId !== undefined && !matchesAccountFilter(transaction, filters.accountId)) {
      return false;
    }

    if (filters.type !== undefined && transaction.type !== filters.type) {
      return false;
    }

    if (filters.categoryId !== undefined && transaction.categoryId !== filters.categoryId) {
      return false;
    }

    if (filters.status !== undefined && transaction.status !== filters.status) {
      return false;
    }

    return true;
  });
}

export function calculateTransactionSummary(
  transactions: readonly TransactionRecord[],
): TransactionSummary {
  const incomeInCents = sumTransactions(transactions, "income");
  const expenseInCents = sumTransactions(transactions, "expense");
  const transferInCents = sumTransactions(transactions, "transfer");

  return {
    incomeInCents,
    expenseInCents,
    transferInCents,
    resultInCents: incomeInCents - expenseInCents,
    filteredCount: transactions.length,
  };
}

export function archiveTransaction(transaction: TransactionRecord): TransactionRecord {
  return {
    ...transaction,
    status: "archived",
  };
}

export function filterTransactionsByContext(
  transactions: readonly TransactionRecord[],
  context: TransactionContext,
): TransactionRecord[] {
  return transactions.filter(
    (transaction) =>
      transaction.tenantId === context.tenantId &&
      transaction.financialProfileId === context.financialProfileId,
  );
}

function buildUnavailableTransactions(state: TransactionStateKind): TransactionViewModel {
  const fallbackContext = {
    tenantId: "tenant-pendente",
    financialProfileId: "profile-pendente",
  };

  return {
    state,
    title: state === "error" ? "Nao foi possivel carregar os lancamentos" : "Carregando lancamentos",
    description:
      state === "error"
        ? "Tente novamente para registrar e acompanhar seus movimentos."
        : "Estamos preparando sua lista e os filtros.",
    context: fallbackContext,
    filters: {},
    summary: calculateTransactionSummary([]),
    transactions: [],
    filterOptions: buildTransactionFilterOptions([]),
  };
}

function buildTransactionFilterOptions(
  transactions: readonly TransactionRecord[],
): TransactionFilterOptions {
  return {
    accounts: buildUniqueOptions(
      transactions.flatMap((transaction) =>
        transaction.destinationAccountId === undefined
          ? [transaction.accountId]
          : [transaction.accountId, transaction.destinationAccountId],
      ),
      "Conta",
    ),
    categories: buildUniqueOptions(
      transactions.map((transaction) => transaction.categoryId),
      "Categoria",
    ),
    statuses: [
      { value: "posted", label: "Realizado" },
      { value: "scheduled", label: "Agendado" },
      { value: "archived", label: "Arquivado" },
    ],
    types: [
      { value: "income", label: "Receita" },
      { value: "expense", label: "Despesa" },
      { value: "transfer", label: "Transferencia" },
    ],
  };
}

function buildUniqueOptions(values: readonly (string | undefined)[], labelPrefix: string) {
  return [...new Set(values.filter((value): value is string => value !== undefined))].map((value) => ({
    value,
    label: `${labelPrefix} ${value}`,
  }));
}

function sortTransactions(transactions: readonly TransactionRecord[]): TransactionRecord[] {
  return [...transactions].sort((current, next) => next.date.localeCompare(current.date));
}

function matchesAccountFilter(transaction: TransactionRecord, accountId: string): boolean {
  return transaction.accountId === accountId || transaction.destinationAccountId === accountId;
}

function sumTransactions(transactions: readonly TransactionRecord[], type: TransactionType): number {
  return transactions
    .filter((transaction) => transaction.type === type && transaction.status !== "archived")
    .reduce((total, transaction) => total + transaction.amountInCents, 0);
}

function addRequiredTextIssue(
  issues: TransactionValidationIssue[],
  field: string,
  value: string,
  message: string,
): void {
  if (value.trim().length === 0) {
    issues.push({ field, message });
  }
}

function toValidationResult(issues: readonly TransactionValidationIssue[]): TransactionValidationResult {
  return {
    valid: issues.length === 0,
    issues,
  };
}
