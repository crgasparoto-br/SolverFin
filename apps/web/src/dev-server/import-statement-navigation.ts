export interface ImportStatementNavigationTransaction {
  accountId?: string;
  occurredOn?: string;
  plannedOn?: string;
  effectiveOn?: string;
}

export interface ImportStatementNavigationSuggestion {
  transaction?: ImportStatementNavigationTransaction;
  payload?: {
    accountId?: string;
    occurredOn?: string;
  };
}

export function buildImportStatementUrl(
  suggestion: ImportStatementNavigationSuggestion | undefined,
  fallbackAccountId = "",
): string {
  const transaction = suggestion?.transaction;
  const payload = suggestion?.payload;
  const accountId = transaction?.accountId ?? payload?.accountId ?? fallbackAccountId;
  const statementOn =
    transaction?.effectiveOn ??
    transaction?.plannedOn ??
    transaction?.occurredOn ??
    payload?.occurredOn ??
    "";
  const params = new URLSearchParams();

  if (accountId !== "") params.set("accountId", accountId);
  if (statementOn !== "") params.set("month", statementOn.slice(0, 7));

  const query = params.toString();
  return `/lancamentos${query === "" ? "" : `?${query}`}`;
}
