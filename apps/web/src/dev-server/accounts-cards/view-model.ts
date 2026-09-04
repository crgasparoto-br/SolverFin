import { findInstitution } from "../institutions.js";

import type { AccountRecord, CreditCardAccountRecord } from "./types.js";

export const fallbackCardBrand = { key: "", label: "Sem bandeira", shortLabel: "--" } as const;

export const cardBrands = [
  fallbackCardBrand,
  { key: "visa", label: "Visa", shortLabel: "VI" },
  { key: "mastercard", label: "Mastercard", shortLabel: "MC" },
  { key: "elo", label: "Elo", shortLabel: "EL" },
  { key: "solverfin_demo", label: "SolverFin Demo", shortLabel: "SF" },
] as const;

export const accountCurrencies = ["BRL", "USD", "EUR"] as const;

export type ResourceKind = "account" | "card";
export type ResourceKey = `${ResourceKind}:${string}`;

export interface ResourceMasterViewModel {
  key: ResourceKey;
  kind: ResourceKind;
  id: string;
  name: string;
  status: string;
  institutionKey: string;
  institutionLabel: string;
  brandKey: string | undefined;
  secondaryLabel: string;
  currency: string | undefined;
  currencyLabel: string;
  search: string;
  href: string;
  isSelected: boolean;
}

export type SelectedResourceViewModel =
  | {
      kind: "account";
      key: ResourceKey;
      account: AccountRecord;
      currency: string | undefined;
    }
  | {
      kind: "card";
      key: ResourceKey;
      card: CreditCardAccountRecord;
      paymentAccount: AccountRecord | undefined;
      currency: string | undefined;
    };

export interface AccountsCardsPageViewModel {
  accounts: AccountRecord[];
  cards: CreditCardAccountRecord[];
  activeAccountCount: number;
  activeCardCount: number;
  resources: ResourceMasterViewModel[];
  selectedResource: SelectedResourceViewModel | undefined;
}

export interface AccountItemViewModel {
  account: AccountRecord;
  institutionKey: string;
  institutionLabel: string;
  bankIdentifier: string | undefined;
  search: string;
  editDialogId: string;
  isArchived: boolean;
}

export interface CardItemViewModel {
  card: CreditCardAccountRecord;
  institutionKey: string;
  institutionLabel: string;
  brandKey: string;
  brandLabel: string;
  paymentAccountName: string;
  paymentAccountCurrency: string | undefined;
  activeInstrumentCount: number;
  search: string;
  editDialogId: string;
  newInstrumentDialogId: string;
  isArchived: boolean;
}

export function buildAccountsCardsPageViewModel(
  accounts: AccountRecord[],
  cards: CreditCardAccountRecord[],
  requestedResource?: string | null,
): AccountsCardsPageViewModel {
  const accountResources = accounts.map((account) => buildAccountResource(account));
  const cardResources = cards.map((card) => buildCardResource(card, accounts));
  const resources = [...accountResources, ...cardResources];
  const requestedKey = parseResourceKey(requestedResource);
  const selectedKey = resources.some((resource) => resource.key === requestedKey)
    ? requestedKey
    : resources[0]?.key;

  for (const resource of resources) resource.isSelected = resource.key === selectedKey;

  return {
    accounts,
    cards,
    activeAccountCount: countActive(accounts),
    activeCardCount: countActive(cards),
    resources,
    selectedResource: selectedKey ? resolveSelectedResource(selectedKey, accounts, cards) : undefined,
  };
}

function buildAccountResource(account: AccountRecord): ResourceMasterViewModel {
  const item = buildAccountItemViewModel(account);
  const currency = normalizeCurrency(account.currency);
  const key = `account:${account.id}` as const;
  return {
    key,
    kind: "account",
    id: account.id,
    name: account.name,
    status: account.status,
    institutionKey: item.institutionKey,
    institutionLabel: item.institutionLabel,
    brandKey: undefined,
    secondaryLabel: formatAccountKind(account.kind),
    currency,
    currencyLabel: currency ?? "Moeda não informada",
    search: [item.search, currency ?? "moeda indisponível", "conta"].join(" ").toLowerCase(),
    href: `/contas-cartoes?resource=${encodeURIComponent(key)}`,
    isSelected: false,
  };
}

function buildCardResource(
  card: CreditCardAccountRecord,
  accounts: AccountRecord[],
): ResourceMasterViewModel {
  const item = buildCardItemViewModel(card, accounts);
  const key = `card:${card.id}` as const;
  return {
    key,
    kind: "card",
    id: card.id,
    name: card.name,
    status: card.status,
    institutionKey: item.institutionKey,
    institutionLabel: item.institutionLabel,
    brandKey: item.brandKey,
    secondaryLabel: `${item.brandLabel} · ${item.activeInstrumentCount} ${item.activeInstrumentCount === 1 ? "instrumento ativo" : "instrumentos ativos"}`,
    currency: item.paymentAccountCurrency,
    currencyLabel: item.paymentAccountCurrency ?? "Moeda indisponível",
    search: [item.search, item.paymentAccountCurrency ?? "moeda indisponível", "cartão"].join(" ").toLowerCase(),
    href: `/contas-cartoes?resource=${encodeURIComponent(key)}`,
    isSelected: false,
  };
}

function resolveSelectedResource(
  key: ResourceKey,
  accounts: AccountRecord[],
  cards: CreditCardAccountRecord[],
): SelectedResourceViewModel | undefined {
  if (key.startsWith("account:")) {
    const account = accounts.find((candidate) => `account:${candidate.id}` === key);
    return account
      ? { kind: "account", key, account, currency: normalizeCurrency(account.currency) }
      : undefined;
  }

  const card = cards.find((candidate) => `card:${candidate.id}` === key);
  if (!card) return undefined;
  const paymentAccount = accounts.find((account) => account.id === card.paymentAccountId);
  return {
    kind: "card",
    key,
    card,
    paymentAccount,
    currency: normalizeCurrency(paymentAccount?.currency),
  };
}

function parseResourceKey(value: string | null | undefined): ResourceKey | undefined {
  const normalized = value?.trim();
  if (!normalized || !/^(account|card):[^:]+$/.test(normalized)) return undefined;
  return normalized as ResourceKey;
}

export function buildAccountItemViewModel(account: AccountRecord): AccountItemViewModel {
  const institution = findInstitution(account.institutionKey);
  const bankIdentifier = formatAccountIdentifier(account);

  return {
    account,
    institutionKey: institution.key,
    institutionLabel: institution.label,
    bankIdentifier,
    search: [account.name, institution.label, bankIdentifier ?? "", account.kind, account.status]
      .join(" ")
      .toLowerCase(),
    editDialogId: `edit-account-dialog-${account.id}`,
    isArchived: account.status === "archived",
  };
}

export function buildCardItemViewModel(
  card: CreditCardAccountRecord,
  accounts: AccountRecord[],
): CardItemViewModel {
  const institution = findInstitution(card.institutionKey);
  const brand = findCardBrand(card.brandKey);
  const paymentAccount = accounts.find((account) => account.id === card.paymentAccountId);

  return {
    card,
    institutionKey: institution.key,
    institutionLabel: institution.label,
    brandKey: brand.key,
    brandLabel: brand.label,
    paymentAccountName: paymentAccount?.name ?? "não vinculada",
    paymentAccountCurrency: normalizeCurrency(paymentAccount?.currency),
    activeInstrumentCount: countActive(card.instruments),
    search: [
      card.name,
      institution.label,
      brand.label,
      card.status,
      paymentAccount?.name ?? "",
      normalizeCurrency(paymentAccount?.currency) ?? "",
      ...card.instruments.flatMap((instrument) => [
        instrument.name ?? "",
        instrument.maskedIdentifier ?? "",
        instrument.type,
        instrument.holder,
        instrument.status,
        instrument.isDefault ? "default" : "",
      ]),
    ]
      .join(" ")
      .toLowerCase(),
    editDialogId: `edit-card-dialog-${card.id}`,
    newInstrumentDialogId: `new-card-instrument-dialog-${card.id}`,
    isArchived: card.status === "archived",
  };
}

export function normalizeCurrency(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : undefined;
}

export function findCardBrand(key: string | undefined) {
  return cardBrands.find((item) => item.key === key) ?? fallbackCardBrand;
}

export function countActive(items: Array<{ status: string }>): number {
  return items.filter((item) => item.status === "active").length;
}

export function formatAccountIdentifier(account: AccountRecord): string | undefined {
  const parts = [
    formatAccountIdentifierPart("Agência", account.agencyIdentifier, 2),
    formatAccountIdentifierPart("Conta", account.accountIdentifier, 4),
  ].filter((value): value is string => value !== undefined);

  if (parts.length > 0) return parts.join(" · ");

  return account.maskedIdentifier?.trim() || undefined;
}

export function formatAccountIdentifierPart(
  label: string,
  value: string | undefined,
  visibleCharacters: number,
): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;

  const suffix = normalized.slice(-Math.min(visibleCharacters, normalized.length));
  return `${label} final ${suffix}`;
}

export function formatAccountKind(kind: string): string {
  if (kind === "checking") return "Conta corrente";
  if (kind === "savings") return "Poupança";
  if (kind === "cash") return "Dinheiro";
  if (kind === "investment") return "Aplicação/investimento";
  if (kind === "other") return "Outros";
  return kind;
}

export function formatGenericStatus(status: string): string {
  if (status === "active") return "Ativo";
  if (status === "archived") return "Arquivado";
  if (status === "blocked") return "Bloqueado";
  return status;
}

export function formatInstrumentType(type: string): string {
  if (type === "physical") return "Físico";
  if (type === "virtual") return "Virtual";
  return type;
}

export function formatInstrumentHolder(holder: string): string {
  if (holder === "primary") return "Titular principal";
  if (holder === "additional") return "Adicional";
  return holder;
}
