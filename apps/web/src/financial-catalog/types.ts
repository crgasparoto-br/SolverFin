export type FinancialCatalogEntity = "account" | "card" | "category";
export type FinancialCatalogStateKind = "loading" | "empty" | "error" | "ready" | "success";
export type FinancialCatalogItemStatus = "active" | "archived";
export type FinancialAccountType = "checking" | "savings" | "cash" | "investment" | "wallet";
export type FinancialCardType = "credit" | "debit" | "benefit";
export type FinancialCategoryType = "income" | "expense" | "transfer";

export interface FinancialCatalogContext {
  tenantId: string;
  financialProfileId: string;
}

export interface FinancialAccount {
  id: string;
  tenantId: string;
  financialProfileId: string;
  name: string;
  type: FinancialAccountType;
  status: FinancialCatalogItemStatus;
  balanceInCents: number;
  color?: string;
}

export interface FinancialCard {
  id: string;
  tenantId: string;
  financialProfileId: string;
  nickname: string;
  type: FinancialCardType;
  status: FinancialCatalogItemStatus;
  issuerName?: string;
  closingDay?: number;
  dueDay?: number;
  lastFourDigits?: string;
}

export interface FinancialCategory {
  id: string;
  tenantId: string;
  financialProfileId: string;
  name: string;
  type: FinancialCategoryType;
  status: FinancialCatalogItemStatus;
  parentId?: string;
  color?: string;
  isSystem?: boolean;
  linkedEntriesCount: number;
}

export interface FinancialAccountFormInput {
  name: string;
  type: FinancialAccountType | "";
  openingBalanceInCents?: number;
  color?: string;
}

export interface FinancialCardFormInput {
  nickname: string;
  type: FinancialCardType | "";
  issuerName?: string;
  closingDay?: number;
  dueDay?: number;
  lastFourDigits?: string;
}

export interface FinancialCategoryFormInput {
  name: string;
  type: FinancialCategoryType | "";
  parentId?: string;
  color?: string;
}

export interface FinancialCatalogValidationIssue {
  field: string;
  message: string;
}

export interface FinancialCatalogValidationResult {
  valid: boolean;
  issues: readonly FinancialCatalogValidationIssue[];
}

export interface FinancialCatalogDataSet {
  context: FinancialCatalogContext;
  accounts: readonly FinancialAccount[];
  cards: readonly FinancialCard[];
  categories: readonly FinancialCategory[];
}

export interface FinancialCatalogSectionSummary {
  entity: FinancialCatalogEntity;
  title: string;
  description: string;
  activeCount: number;
  archivedCount: number;
}

export interface FinancialCatalogViewModel {
  state: FinancialCatalogStateKind;
  title: string;
  description: string;
  context: FinancialCatalogContext;
  accounts: readonly FinancialAccount[];
  cards: readonly FinancialCard[];
  categories: readonly FinancialCategory[];
  sections: readonly FinancialCatalogSectionSummary[];
  feedbackMessage?: string;
}
