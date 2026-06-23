import type {
  Account,
  AuditLogEntryDraft,
  Card,
  CardBrandKey,
  CardStatus,
  EntityId,
  FinancialInstitutionKey,
  Installment,
  Invoice,
  InvoiceStatus,
  ISODate,
  ISODateTime,
  Transaction,
} from "./index.js";
import type { TenantContext } from "./tenant.js";
import {
  isCardBrandKey,
  isFinancialInstitutionKey,
  normalizeOptionalCatalogKey,
} from "./visual-identities.js";
import {
  applyTenantScope,
  getTenantScopedResource,
  listTenantScopedResources,
  updateTenantScopedResource,
} from "./tenant-authorization.js";

export type CardErrorCode =
  | "CARD_NAME_REQUIRED"
  | "CARD_STATUS_INVALID"
  | "CARD_CLOSING_DAY_INVALID"
  | "CARD_DUE_DAY_INVALID"
  | "CARD_LIMIT_INVALID"
  | "CARD_IDENTIFIER_UNSAFE"
  | "CARD_INSTITUTION_KEY_INVALID"
  | "CARD_BRAND_KEY_INVALID"
  | "CARD_PAYMENT_ACCOUNT_INVALID"
  | "CARD_PAYMENT_ACCOUNT_ARCHIVED"
  | "CARD_NOT_ACTIVE"
  | "CARD_PURCHASE_AMOUNT_INVALID"
  | "CARD_PURCHASE_DATE_REQUIRED"
  | "CARD_PURCHASE_DESCRIPTION_REQUIRED"
  | "CARD_INSTALLMENTS_INVALID"
  | "CARD_INVOICE_NOT_OPEN"
  | "CARD_INVOICE_PAYMENT_AMOUNT_INVALID"
  | "CARD_INVOICE_ALREADY_PAID"
  | "CARD_INVOICE_CANCELLED";

export class CardError extends Error {
  readonly code: CardErrorCode;
  readonly statusCode = 400;

  constructor(code: CardErrorCode, message: string) {
    super(message);
    this.name = "CardError";
    this.code = code;
  }
}

export interface CardMutationResult {
  card: Card;
  auditEntry: AuditLogEntryDraft;
}

export interface CardPurchaseResult {
  transaction: Transaction;
  invoice: Invoice;
  installments: readonly Installment[];
  auditEntries: readonly AuditLogEntryDraft[];
}

export interface InvoicePaymentResult {
  invoice: Invoice;
  transaction: Transaction;
  auditEntries: readonly AuditLogEntryDraft[];
}

export interface InvoicePeriod {
  periodStartOn: ISODate;
  periodEndOn: ISODate;
  dueOn: ISODate;
}

export interface CreateCardInput {
  id: EntityId;
  context: TenantContext;
  now: ISODateTime;
  payload: CreateCardPayload;
  paymentAccount?: Account;
}

export interface CreateCardPayload {
  name: string;
  closingDay: number;
  dueDay: number;
  creditLimitMinor?: number;
  maskedIdentifier?: string;
  institutionKey?: string;
  brandKey?: string;
  paymentAccountId?: EntityId;
  organizationId?: EntityId;
  financialProfileId?: EntityId;
}

export interface UpdateCardInput {
  context: TenantContext;
  card: Card | undefined;
  now: ISODateTime;
  payload: UpdateCardPayload;
  paymentAccount?: Account;
}

export interface UpdateCardPayload {
  name?: string;
  status?: CardStatus;
  closingDay?: number;
  dueDay?: number;
  creditLimitMinor?: number;
  maskedIdentifier?: string;
  institutionKey?: string;
  brandKey?: string;
  paymentAccountId?: EntityId;
  organizationId?: EntityId;
  financialProfileId?: EntityId;
}

export interface ListCardsFilters {
  status?: CardStatus | "all";
}

export interface ListInvoicesFilters {
  status?: InvoiceStatus | "all";
  cardId?: EntityId;
  dueFrom?: ISODate;
  dueTo?: ISODate;
}

export interface RegisterCardPurchaseInput {
  transactionId: EntityId;
  context: TenantContext;
  card: Card | undefined;
  existingInvoices: readonly Invoice[];
  now: ISODateTime;
  payload: RegisterCardPurchasePayload;
  makeInvoiceId: (period: InvoicePeriod) => EntityId;
  makeInstallmentId?: (sequenceNumber: number, dueOn: ISODate) => EntityId;
}

export interface RegisterCardPurchasePayload {
  occurredOn: ISODate;
  amountMinor: number;
  description: string;
  currency?: string;
  categoryId?: EntityId;
  totalInstallments?: number;
}

export interface PayInvoiceInput {
  transactionId: EntityId;
  context: TenantContext;
  invoice: Invoice | undefined;
  card: Card | undefined;
  paymentAccount: Account | undefined;
  now: ISODateTime;
  payload: PayInvoicePayload;
}

export interface PayInvoicePayload {
  paidOn: ISODate;
  amountMinor?: number;
  description?: string;
}

const ALLOWED_CARD_STATUSES: readonly CardStatus[] = ["active", "archived", "blocked"];
const ALLOWED_INVOICE_STATUSES: readonly InvoiceStatus[] = [
  "open",
  "closed",
  "paid",
  "overdue",
  "cancelled",
];

export function createCard(input: CreateCardInput): CardMutationResult {
  const payload = applyTenantScope(input.context, input.payload);
  const paymentAccount = assertOptionalPaymentAccount(
    input.context,
    input.paymentAccount,
    payload.paymentAccountId,
  );
  const card: Card = {
    id: input.id,
    organizationId: payload.organizationId,
    financialProfileId: payload.financialProfileId,
    name: normalizeCardName(payload.name),
    status: "active",
    closingDay: validateStatementDay(payload.closingDay, "CARD_CLOSING_DAY_INVALID"),
    dueDay: validateStatementDay(payload.dueDay, "CARD_DUE_DAY_INVALID"),
    createdAt: input.now,
    updatedAt: input.now,
    createdByUserId: input.context.userId,
    updatedByUserId: input.context.userId,
  };
  const institutionKey = validateOptionalInstitutionKey(payload.institutionKey);
  const brandKey = validateOptionalBrandKey(payload.brandKey);

  if (payload.creditLimitMinor !== undefined) {
    card.creditLimitMinor = validateCreditLimit(payload.creditLimitMinor);
  }

  if (payload.maskedIdentifier !== undefined) {
    card.maskedIdentifier = normalizeMaskedIdentifier(payload.maskedIdentifier);
  }

  if (institutionKey !== undefined) {
    card.institutionKey = institutionKey;
  }

  if (brandKey !== undefined) {
    card.brandKey = brandKey;
  }

  if (paymentAccount !== undefined) {
    card.paymentAccountId = paymentAccount.id;
  }

  return {
    card,
    auditEntry: buildCardAuditEntry("create", input.context.userId, input.now, undefined, card),
  };
}

export function listCards(
  context: TenantContext,
  cards: readonly Card[],
  filters: ListCardsFilters = {},
): Card[] {
  const scopedCards = listTenantScopedResources(context, cards);

  if (filters.status === "all") {
    return scopedCards;
  }

  return scopedCards.filter((card) => card.status === (filters.status ?? "active"));
}

export function getCard(context: TenantContext, card: Card | undefined): Card {
  return getTenantScopedResource(context, card);
}

export function updateCard(input: UpdateCardInput): CardMutationResult {
  const currentCard = updateTenantScopedResource(input.context, input.card, input.payload);
  const paymentAccount = assertOptionalPaymentAccount(
    input.context,
    input.paymentAccount,
    input.payload.paymentAccountId ?? currentCard.paymentAccountId,
  );
  const updatedCard: Card = {
    ...currentCard,
    ...buildOptionalCardUpdate(input.payload),
    updatedAt: input.now,
    updatedByUserId: input.context.userId,
  };

  if (paymentAccount !== undefined) {
    updatedCard.paymentAccountId = paymentAccount.id;
  }

  return {
    card: updatedCard,
    auditEntry: buildCardAuditEntry(
      "update",
      input.context.userId,
      input.now,
      currentCard,
      updatedCard,
    ),
  };
}

export function archiveCard(
  context: TenantContext,
  card: Card | undefined,
  now: ISODateTime,
): CardMutationResult {
  return setCardStatus(context, card, now, "archived");
}

export function blockCard(
  context: TenantContext,
  card: Card | undefined,
  now: ISODateTime,
): CardMutationResult {
  return setCardStatus(context, card, now, "blocked");
}

export function listInvoices(
  context: TenantContext,
  invoices: readonly Invoice[],
  filters: ListInvoicesFilters = {},
): Invoice[] {
  return listTenantScopedResources(context, invoices).filter((invoice) => {
    const statusMatches =
      filters.status === undefined || filters.status === "all" || invoice.status === filters.status;
    const cardMatches = filters.cardId === undefined || invoice.cardId === filters.cardId;
    const dueFromMatches = filters.dueFrom === undefined || invoice.dueOn >= filters.dueFrom;
    const dueToMatches = filters.dueTo === undefined || invoice.dueOn <= filters.dueTo;

    return statusMatches && cardMatches && dueFromMatches && dueToMatches;
  });
}

export function getInvoice(context: TenantContext, invoice: Invoice | undefined): Invoice {
  return getTenantScopedResource(context, invoice);
}

export function calculateInvoicePeriod(
  card: Pick<Card, "closingDay" | "dueDay">,
  purchaseOn: ISODate,
): InvoicePeriod {
  const purchaseDate = validateDate(purchaseOn, "CARD_PURCHASE_DATE_REQUIRED");
  const [purchaseYear, purchaseMonth, purchaseDay] = parseDateParts(purchaseDate);
  const closingDay = validateStatementDay(card.closingDay, "CARD_CLOSING_DAY_INVALID");
  const dueDay = validateStatementDay(card.dueDay, "CARD_DUE_DAY_INVALID");
  const currentMonthClosing = formatDateParts(
    purchaseYear,
    purchaseMonth,
    clampDay(purchaseYear, purchaseMonth, closingDay),
  );
  const periodEndOn =
    purchaseDay <= clampDay(purchaseYear, purchaseMonth, closingDay)
      ? currentMonthClosing
      : formatDateParts(...addMonthsParts(purchaseYear, purchaseMonth, closingDay, 1));
  const [periodEndYear, periodEndMonth] = parseDateParts(periodEndOn);
  const previousClosing = formatDateParts(
    ...addMonthsParts(periodEndYear, periodEndMonth, closingDay, -1),
  );
  const periodStartOn = addDays(previousClosing, 1);
  const dueOn = calculateDueOnAfter(periodEndOn, dueDay);

  return { periodStartOn, periodEndOn, dueOn };
}

export function registerCardPurchase(input: RegisterCardPurchaseInput): CardPurchaseResult {
  const card = assertActiveCard(input.context, input.card);
  const amountMinor = validateAmount(input.payload.amountMinor, "CARD_PURCHASE_AMOUNT_INVALID");
  const occurredOn = validateDate(input.payload.occurredOn, "CARD_PURCHASE_DATE_REQUIRED");
  const description = normalizeDescription(input.payload.description);
  const currency = normalizeCurrency(input.payload.currency);
  const period = calculateInvoicePeriod(card, occurredOn);
  const invoiceResult = resolveInvoiceForPurchase({
    context: input.context,
    card,
    existingInvoices: input.existingInvoices,
    now: input.now,
    amountMinor,
    currency,
    period,
    makeInvoiceId: input.makeInvoiceId,
  });
  const transaction: Transaction = {
    id: input.transactionId,
    organizationId: input.context.organizationId,
    financialProfileId: input.context.financialProfileId,
    kind: "expense",
    status: "posted",
    source: "manual",
    amountMinor,
    currency,
    occurredOn,
    description,
    cardId: card.id,
    invoiceId: invoiceResult.invoice.id,
    createdAt: input.now,
    updatedAt: input.now,
    createdByUserId: input.context.userId,
    updatedByUserId: input.context.userId,
  };

  if (input.payload.categoryId !== undefined) {
    transaction.categoryId = input.payload.categoryId;
  }

  const installments = buildPurchaseInstallments({
    context: input.context,
    now: input.now,
    cardId: card.id,
    transactionId: transaction.id,
    amountMinor,
    currency,
    firstDueOn: invoiceResult.invoice.dueOn,
    totalInstallments: input.payload.totalInstallments,
    makeInstallmentId: input.makeInstallmentId,
  });

  return {
    transaction,
    invoice: invoiceResult.invoice,
    installments,
    auditEntries: [
      invoiceResult.auditEntry,
      buildTransactionAuditEntry(input.context.userId, input.now, transaction),
    ],
  };
}

export function payInvoice(input: PayInvoiceInput): InvoicePaymentResult {
  const invoice = getTenantScopedResource(input.context, input.invoice);
  const card = getTenantScopedResource(input.context, input.card);
  const paymentAccount = assertPaymentAccount(input.context, input.paymentAccount);

  if (invoice.cardId !== card.id) {
    throw new CardError("CARD_INVOICE_NOT_OPEN", "Invoice does not belong to the provided card.");
  }

  if (invoice.status === "paid") {
    throw new CardError("CARD_INVOICE_ALREADY_PAID", "Invoice is already paid.");
  }

  if (invoice.status === "cancelled") {
    throw new CardError("CARD_INVOICE_CANCELLED", "Cancelled invoice cannot be paid.");
  }

  const paymentAmount = input.payload.amountMinor ?? invoice.totalAmountMinor;

  if (paymentAmount !== invoice.totalAmountMinor || paymentAmount <= 0) {
    throw new CardError(
      "CARD_INVOICE_PAYMENT_AMOUNT_INVALID",
      "Invoice payment must match the current invoice total in the MVP.",
    );
  }

  const paidOn = validateDate(input.payload.paidOn, "CARD_PURCHASE_DATE_REQUIRED");
  const description =
    input.payload.description?.trim() || `Pagamento da fatura ${invoice.periodEndOn}`;
  const transaction: Transaction = {
    id: input.transactionId,
    organizationId: input.context.organizationId,
    financialProfileId: input.context.financialProfileId,
    kind: "expense",
    status: "posted",
    source: "manual",
    amountMinor: paymentAmount,
    currency: invoice.currency,
    occurredOn: paidOn,
    description,
    accountId: paymentAccount.id,
    cardId: card.id,
    invoiceId: invoice.id,
    createdAt: input.now,
    updatedAt: input.now,
    createdByUserId: input.context.userId,
    updatedByUserId: input.context.userId,
  };
  const paidInvoice: Invoice = {
    ...invoice,
    status: "paid",
    paidAt: input.now,
    paymentTransactionId: transaction.id,
    updatedAt: input.now,
    updatedByUserId: input.context.userId,
  };

  return {
    invoice: paidInvoice,
    transaction,
    auditEntries: [
      buildInvoiceAuditEntry("update", input.context.userId, input.now, invoice, paidInvoice),
      buildTransactionAuditEntry(input.context.userId, input.now, transaction),
    ],
  };
}

function setCardStatus(
  context: TenantContext,
  card: Card | undefined,
  now: ISODateTime,
  status: CardStatus,
): CardMutationResult {
  const currentCard = getTenantScopedResource(context, card);
  const updatedCard: Card = {
    ...currentCard,
    status: validateCardStatus(status),
    updatedAt: now,
    updatedByUserId: context.userId,
  };

  return {
    card: updatedCard,
    auditEntry: buildCardAuditEntry("update", context.userId, now, currentCard, updatedCard),
  };
}

function buildOptionalCardUpdate(payload: UpdateCardPayload): Partial<Card> {
  const update: Partial<Card> = {};

  if (payload.name !== undefined) {
    update.name = normalizeCardName(payload.name);
  }

  if (payload.status !== undefined) {
    update.status = validateCardStatus(payload.status);
  }

  if (payload.closingDay !== undefined) {
    update.closingDay = validateStatementDay(payload.closingDay, "CARD_CLOSING_DAY_INVALID");
  }

  if (payload.dueDay !== undefined) {
    update.dueDay = validateStatementDay(payload.dueDay, "CARD_DUE_DAY_INVALID");
  }

  if (payload.creditLimitMinor !== undefined) {
    update.creditLimitMinor = validateCreditLimit(payload.creditLimitMinor);
  }

  if (payload.maskedIdentifier !== undefined) {
    update.maskedIdentifier = normalizeMaskedIdentifier(payload.maskedIdentifier);
  }

  if (payload.institutionKey !== undefined) {
    update.institutionKey = validateOptionalInstitutionKey(payload.institutionKey);
  }

  if (payload.brandKey !== undefined) {
    update.brandKey = validateOptionalBrandKey(payload.brandKey);
  }

  return update;
}

function resolveInvoiceForPurchase(input: {
  context: TenantContext;
  card: Card;
  existingInvoices: readonly Invoice[];
  now: ISODateTime;
  amountMinor: number;
  currency: string;
  period: InvoicePeriod;
  makeInvoiceId: (period: InvoicePeriod) => EntityId;
}): { invoice: Invoice; auditEntry: AuditLogEntryDraft } {
  const existingInvoice = listTenantScopedResources(input.context, input.existingInvoices).find(
    (invoice) =>
      invoice.cardId === input.card.id &&
      invoice.periodStartOn === input.period.periodStartOn &&
      invoice.periodEndOn === input.period.periodEndOn,
  );

  if (existingInvoice !== undefined) {
    validateInvoiceCanReceivePurchase(existingInvoice);

    const updatedInvoice: Invoice = {
      ...existingInvoice,
      totalAmountMinor: existingInvoice.totalAmountMinor + input.amountMinor,
      currency: normalizeCurrency(existingInvoice.currency),
      updatedAt: input.now,
      updatedByUserId: input.context.userId,
    };

    return {
      invoice: updatedInvoice,
      auditEntry: buildInvoiceAuditEntry(
        "update",
        input.context.userId,
        input.now,
        existingInvoice,
        updatedInvoice,
      ),
    };
  }

  const invoice: Invoice = {
    id: input.makeInvoiceId(input.period),
    organizationId: input.context.organizationId,
    financialProfileId: input.context.financialProfileId,
    cardId: input.card.id,
    status: "open",
    periodStartOn: input.period.periodStartOn,
    periodEndOn: input.period.periodEndOn,
    dueOn: input.period.dueOn,
    totalAmountMinor: input.amountMinor,
    currency: input.currency,
    createdAt: input.now,
    updatedAt: input.now,
    createdByUserId: input.context.userId,
    updatedByUserId: input.context.userId,
  };

  return {
    invoice,
    auditEntry: buildInvoiceAuditEntry(
      "create",
      input.context.userId,
      input.now,
      undefined,
      invoice,
    ),
  };
}

function buildPurchaseInstallments(input: {
  context: TenantContext;
  now: ISODateTime;
  cardId: EntityId;
  transactionId: EntityId;
  amountMinor: number;
  currency: string;
  firstDueOn: ISODate;
  totalInstallments: number | undefined;
  makeInstallmentId: ((sequenceNumber: number, dueOn: ISODate) => EntityId) | undefined;
}): Installment[] {
  const totalInstallments = input.totalInstallments ?? 1;

  if (totalInstallments === 1) {
    return [];
  }

  if (!Number.isInteger(totalInstallments) || totalInstallments <= 1 || totalInstallments > 120) {
    throw new CardError(
      "CARD_INSTALLMENTS_INVALID",
      "Card purchase installments must be between 2 and 120.",
    );
  }

  if (input.makeInstallmentId === undefined) {
    throw new CardError(
      "CARD_INSTALLMENTS_INVALID",
      "Installment id factory is required for installment purchases.",
    );
  }

  const amounts = splitAmount(input.amountMinor, totalInstallments);
  const installments: Installment[] = [];

  for (let sequenceNumber = 1; sequenceNumber <= totalInstallments; sequenceNumber += 1) {
    const dueOn = addMonths(input.firstDueOn, sequenceNumber - 1);

    installments.push({
      id: input.makeInstallmentId(sequenceNumber, dueOn),
      organizationId: input.context.organizationId,
      financialProfileId: input.context.financialProfileId,
      status: "planned",
      sequenceNumber,
      totalInstallments,
      dueOn,
      amountMinor: amounts[sequenceNumber - 1] ?? 0,
      currency: input.currency,
      transactionId: input.transactionId,
      cardId: input.cardId,
      createdAt: input.now,
      updatedAt: input.now,
      createdByUserId: input.context.userId,
      updatedByUserId: input.context.userId,
    });
  }

  return installments;
}

function validateInvoiceCanReceivePurchase(invoice: Invoice): void {
  validateInvoiceStatus(invoice.status);

  if (invoice.status !== "open") {
    throw new CardError(
      "CARD_INVOICE_NOT_OPEN",
      "Only open invoices can receive new card purchases.",
    );
  }
}

function assertActiveCard(context: TenantContext, card: Card | undefined): Card {
  const scopedCard = getTenantScopedResource(context, card);

  if (scopedCard.status !== "active") {
    throw new CardError("CARD_NOT_ACTIVE", "Card must be active to receive purchases.");
  }

  return scopedCard;
}

function assertOptionalPaymentAccount(
  context: TenantContext,
  account: Account | undefined,
  accountId: EntityId | undefined,
): Account | undefined {
  if (accountId === undefined) {
    return undefined;
  }

  const paymentAccount = assertPaymentAccount(context, account);

  if (paymentAccount.id !== accountId) {
    throw new CardError("CARD_PAYMENT_ACCOUNT_INVALID", "Payment account id does not match.");
  }

  return paymentAccount;
}

function assertPaymentAccount(context: TenantContext, account: Account | undefined): Account {
  const paymentAccount = getTenantScopedResource(context, account);

  if (paymentAccount.status !== "active") {
    throw new CardError("CARD_PAYMENT_ACCOUNT_ARCHIVED", "Payment account must be active.");
  }

  return paymentAccount;
}

function normalizeCardName(name: string): string {
  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new CardError("CARD_NAME_REQUIRED", "Card name is required.");
  }

  return normalizedName;
}

function normalizeDescription(description: string): string {
  const normalizedDescription = description.trim();

  if (!normalizedDescription) {
    throw new CardError(
      "CARD_PURCHASE_DESCRIPTION_REQUIRED",
      "Card purchase description is required.",
    );
  }

  return normalizedDescription;
}

function validateCardStatus(status: CardStatus): CardStatus {
  if (!ALLOWED_CARD_STATUSES.includes(status)) {
    throw new CardError("CARD_STATUS_INVALID", "Card status is not supported.");
  }

  return status;
}

function validateInvoiceStatus(status: InvoiceStatus): InvoiceStatus {
  if (!ALLOWED_INVOICE_STATUSES.includes(status)) {
    throw new CardError("CARD_INVOICE_NOT_OPEN", "Invoice status is not supported.");
  }

  return status;
}

function validateStatementDay(day: number, code: CardErrorCode): number {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new CardError(code, "Statement day must be between 1 and 31.");
  }

  return day;
}

function validateCreditLimit(creditLimitMinor: number): number {
  if (!Number.isInteger(creditLimitMinor) || creditLimitMinor < 0) {
    throw new CardError("CARD_LIMIT_INVALID", "Card limit must be an integer minor-unit amount.");
  }

  return creditLimitMinor;
}

function validateAmount(amountMinor: number, code: CardErrorCode): number {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new CardError(code, "Amount must be a positive integer minor-unit amount.");
  }

  return amountMinor;
}

function validateDate(date: ISODate, code: CardErrorCode): ISODate {
  if (!date.trim()) {
    throw new CardError(code, "Date is required.");
  }

  return date;
}

function normalizeMaskedIdentifier(maskedIdentifier: string): string {
  const normalizedIdentifier = maskedIdentifier.trim();
  const digitsOnly = normalizedIdentifier.replace(/\D/g, "");

  if (digitsOnly.length >= 13) {
    throw new CardError(
      "CARD_IDENTIFIER_UNSAFE",
      "Card identifier must be masked and cannot contain a full card number.",
    );
  }

  return normalizedIdentifier;
}

function validateOptionalInstitutionKey(
  value: string | undefined,
): FinancialInstitutionKey | undefined {
  const normalizedValue = normalizeOptionalCatalogKey(value);

  if (normalizedValue === undefined) {
    return undefined;
  }

  if (!isFinancialInstitutionKey(normalizedValue)) {
    throw new CardError("CARD_INSTITUTION_KEY_INVALID", "Card institution key is not supported.");
  }

  return normalizedValue;
}

function validateOptionalBrandKey(value: string | undefined): CardBrandKey | undefined {
  const normalizedValue = normalizeOptionalCatalogKey(value);

  if (normalizedValue === undefined) {
    return undefined;
  }

  if (!isCardBrandKey(normalizedValue)) {
    throw new CardError("CARD_BRAND_KEY_INVALID", "Card brand key is not supported.");
  }

  return normalizedValue;
}

function normalizeCurrency(currency = "BRL"): string {
  return currency.trim().toUpperCase();
}

function splitAmount(amountMinor: number, totalInstallments: number): number[] {
  const baseAmount = Math.floor(amountMinor / totalInstallments);
  const remainder = amountMinor % totalInstallments;

  return Array.from({ length: totalInstallments }, (_, index) =>
    index < remainder ? baseAmount + 1 : baseAmount,
  );
}

function calculateDueOnAfter(periodEndOn: ISODate, dueDay: number): ISODate {
  const [year, month] = parseDateParts(periodEndOn);
  const currentMonthDueOn = formatDateParts(year, month, clampDay(year, month, dueDay));

  if (currentMonthDueOn > periodEndOn) {
    return currentMonthDueOn;
  }

  return formatDateParts(...addMonthsParts(year, month, dueDay, 1));
}

function addDays(date: ISODate, days: number): ISODate {
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  parsedDate.setUTCDate(parsedDate.getUTCDate() + days);

  return parsedDate.toISOString().slice(0, 10);
}

function addMonths(date: ISODate, months: number): ISODate {
  const [year, month, day] = parseDateParts(date);

  return formatDateParts(...addMonthsParts(year, month, day, months));
}

function addMonthsParts(
  year: number,
  month: number,
  day: number,
  months: number,
): [number, number, number] {
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
  const targetMonth = normalizedMonthIndex + 1;

  return [targetYear, targetMonth, clampDay(targetYear, targetMonth, day)];
}

function parseDateParts(date: ISODate): [number, number, number] {
  return date.split("-").map(Number) as [number, number, number];
}

function formatDateParts(year: number, month: number, day: number): ISODate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, new Date(Date.UTC(year, month, 0)).getUTCDate());
}

function buildCardAuditEntry(
  action: "create" | "update",
  actorId: EntityId,
  occurredAt: ISODateTime,
  before: Card | undefined,
  after: Card,
): AuditLogEntryDraft {
  const auditEntry: AuditLogEntryDraft = {
    organizationId: after.organizationId,
    financialProfileId: after.financialProfileId,
    occurredAt,
    actorKind: "user",
    actorId,
    action,
    entityKind: "card",
    entityId: after.id,
  };
  const redactedChanges = buildRedactedChanges(before, after, [
    "name",
    "status",
    "closingDay",
    "dueDay",
    "creditLimitMinor",
    "maskedIdentifier",
    "institutionKey",
    "brandKey",
    "paymentAccountId",
  ] as const);

  if (redactedChanges !== undefined) {
    auditEntry.redactedChanges = redactedChanges;
  }

  return auditEntry;
}

function buildInvoiceAuditEntry(
  action: "create" | "update",
  actorId: EntityId,
  occurredAt: ISODateTime,
  before: Invoice | undefined,
  after: Invoice,
): AuditLogEntryDraft {
  const auditEntry: AuditLogEntryDraft = {
    organizationId: after.organizationId,
    financialProfileId: after.financialProfileId,
    occurredAt,
    actorKind: "user",
    actorId,
    action,
    entityKind: "invoice",
    entityId: after.id,
  };
  const redactedChanges = buildRedactedChanges(before, after, [
    "cardId",
    "status",
    "periodStartOn",
    "periodEndOn",
    "dueOn",
    "totalAmountMinor",
    "currency",
    "paidAt",
    "paymentTransactionId",
  ] as const);

  if (redactedChanges !== undefined) {
    auditEntry.redactedChanges = redactedChanges;
  }

  return auditEntry;
}

function buildTransactionAuditEntry(
  actorId: EntityId,
  occurredAt: ISODateTime,
  transaction: Transaction,
): AuditLogEntryDraft {
  return {
    organizationId: transaction.organizationId,
    financialProfileId: transaction.financialProfileId,
    occurredAt,
    actorKind: "user",
    actorId,
    action: "create",
    entityKind: "transaction",
    entityId: transaction.id,
  };
}

function buildRedactedChanges<TEntity extends object, TField extends keyof TEntity>(
  before: TEntity | undefined,
  after: TEntity,
  fields: readonly TField[],
): Record<string, "changed" | "added" | "removed"> | undefined {
  const changes: Record<string, "changed" | "added" | "removed"> = {};

  for (const field of fields) {
    const beforeValue = before?.[field];
    const afterValue = after[field];

    if (beforeValue === afterValue) {
      continue;
    }

    if (beforeValue === undefined) {
      changes[String(field)] = "added";
      continue;
    }

    if (afterValue === undefined) {
      changes[String(field)] = "removed";
      continue;
    }

    changes[String(field)] = "changed";
  }

  return Object.keys(changes).length > 0 ? changes : undefined;
}
