export type TransactionType = "income" | "expense" | "transfer";
export type TransactionStatus = "posted" | "scheduled" | "archived";
export type TransactionStateKind = "loading" | "empty" | "error" | "ready" | "success";

export interface TransactionContext {
  tenantId: string;
  financialProfileId: string;
}

export interface TransactionRecord {
  id: string;
  tenantId: string;
  financialProfileId: string;
  date: string;
  description: string;
  type: TransactionType;
  status: TransactionStatus;
  amountInCents: number;
  accountId?: string;
  destinationAccountId?: string;
  categoryId?: string;
  note?: string;
}

export interface TransactionFilters {
  startsOn?: string;
  endsOn?: string;
  accountId?: string;
  type?: TransactionType;
  categoryId?: string;
  status?: TransactionStatus;
}

export interface TransactionFormInput {
  date: string;
  description: string;
  type: TransactionType | "";
  amountInCents?: number;
  accountId?: string;
  destinationAccountId?: string;
  categoryId?: string;
  note?: string;
}

export interface TransactionValidationIssue {
  field: string;
  message: string;
}

export interface TransactionValidationResult {
  valid: boolean;
  issues: readonly TransactionValidationIssue[];
}

export interface TransactionDataSet {
  context: TransactionContext;
  transactions: readonly TransactionRecord[];
  filters: TransactionFilters;
}

export interface TransactionSummary {
  incomeInCents: number;
  expenseInCents: number;
  transferInCents: number;
  resultInCents: number;
  filteredCount: number;
}

export interface TransactionFilterOption {
  value: string;
  label: string;
}

export interface TransactionFilterOptions {
  accounts: readonly TransactionFilterOption[];
  categories: readonly TransactionFilterOption[];
  statuses: readonly TransactionFilterOption[];
  types: readonly TransactionFilterOption[];
}

export interface TransactionViewModel {
  state: TransactionStateKind;
  title: string;
  description: string;
  context: TransactionContext;
  filters: TransactionFilters;
  summary: TransactionSummary;
  transactions: readonly TransactionRecord[];
  filterOptions: TransactionFilterOptions;
  feedbackMessage?: string;
}
