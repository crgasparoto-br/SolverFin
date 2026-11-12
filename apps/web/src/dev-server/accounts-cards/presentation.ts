import { formatMinorCurrency } from "@solverfin/shared";

import { icon } from "../icons.js";
import { institutions } from "../institutions.js";
import type { AccountRecord } from "./types.js";
import { accountCurrencies, cardBrands } from "./view-model.js";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatMoney(amountMinor: number): string {
  return formatMinorCurrency(amountMinor);
}

export function formatMoneyInput(amountMinor: number): string {
  const sign = amountMinor < 0 ? "-" : "";
  const [intPart, centsPart] = (Math.abs(amountMinor) / 100).toFixed(2).split(".") as [
    string,
    string,
  ];
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${withThousands},${centsPart}`;
}

export function renderLegacyAccountIdentifier(account: AccountRecord): string {
  if (account.agencyIdentifier || account.accountIdentifier || !account.maskedIdentifier?.trim()) {
    return "";
  }

  return `<p class="muted legacy-account-identifier">Identificador legado: ${escapeHtml(account.maskedIdentifier)}. Preencha Agência e Conta separadamente para atualizar este cadastro.</p>`;
}

export function renderInstitutionOptions(selected?: string): string {
  return institutions
    .map(
      (item) =>
        `<option value="${escapeHtml(item.key)}"${selected === item.key ? " selected" : ""}>${escapeHtml(item.label)}</option>`,
    )
    .join("");
}

export function renderCardBrandOptions(selected?: string): string {
  return cardBrands
    .map(
      (item) =>
        `<option value="${escapeHtml(item.key)}"${selected === item.key ? " selected" : ""}>${escapeHtml(item.label)}</option>`,
    )
    .join("");
}

export function renderCurrencyOptions(selected = "BRL"): string {
  return accountCurrencies
    .map(
      (currency) =>
        `<option value="${currency}"${selected === currency ? " selected" : ""}>${currency}</option>`,
    )
    .join("");
}

export function renderAccountKindOptions(selected?: string): string {
  return [
    ["checking", "Conta corrente"],
    ["savings", "Poupança"],
    ["cash", "Dinheiro"],
    ["investment", "Aplicação/investimento"],
    ["other", "Outros"],
  ]
    .map(
      ([value, label]) =>
        `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`,
    )
    .join("");
}

export function renderInstrumentTypeOptions(selected = "physical"): string {
  return [
    ["physical", "Físico"],
    ["virtual", "Virtual"],
  ]
    .map(
      ([value, label]) =>
        `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`,
    )
    .join("");
}

export function renderInstrumentHolderOptions(selected = "primary"): string {
  return [
    ["primary", "Titular principal"],
    ["additional", "Adicional"],
  ]
    .map(
      ([value, label]) =>
        `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`,
    )
    .join("");
}

export function renderAccountOptions(accounts: AccountRecord[], selected?: string): string {
  return accounts
    .map(
      (account) =>
        `<option value="${escapeHtml(account.id)}"${selected === account.id ? " selected" : ""}>${escapeHtml(account.name)}</option>`,
    )
    .join("");
}

export function renderEditIcon(): string {
  return icon("pencil", 14);
}

export function renderAddIcon(): string {
  return icon("plus", 14);
}

export function renderArchiveIcon(): string {
  return icon("archive", 14);
}

export function renderTrashIcon(): string {
  return icon("trash-2", 14);
}

export function renderDefaultIcon(): string {
  return icon("star", 14);
}

export function renderCardBrandIcon(key: string): string {
  if (key === "visa")
    return `<svg class="brand-icon card-brand-icon" viewBox="0 0 44 44" role="img"><rect x="6" y="11" width="32" height="22" rx="6" fill="#fff"/><path d="M11 26h5.2l3.1-8h-4.2l-1.4 4.8-1.5-4.8H8l3 8zm10.2 0h4l1.4-8h-4l-1.4 8zm6.1 0h8.8l.7-3.1h-4.7l4.1-4.9h-8.4l-.7 3.1h4.1L27.3 26z" fill="#1a1f71"/><path d="M31.7 15h5.7l-1 2.5h-5.7l1-2.5z" fill="#f7b600"/></svg>`;
  if (key === "mastercard")
    return `<svg class="brand-icon card-brand-icon" viewBox="0 0 44 44" role="img"><rect x="6" y="11" width="32" height="22" rx="6" fill="#fff"/><circle cx="19" cy="22" r="8" fill="#eb001b"/><circle cx="25" cy="22" r="8" fill="#f79e1b" fill-opacity=".92"/><path d="M22 15.8a8 8 0 0 1 0 12.4 8 8 0 0 1 0-12.4z" fill="#ff5f00"/></svg>`;
  if (key === "elo")
    return `<svg class="brand-icon card-brand-icon" viewBox="0 0 44 44" role="img"><rect x="6" y="11" width="32" height="22" rx="6" fill="#fff"/><circle cx="15" cy="22" r="4" fill="#111827"/><path d="M24 16a6 6 0 1 0 5.7 7.9h-4.2a2.2 2.2 0 1 1 0-3.8h4.2A6 6 0 0 0 24 16z" fill="#111827"/><circle cx="32" cy="17" r="2.2" fill="#f59e0b"/><circle cx="34" cy="22" r="2.2" fill="#22c55e"/><circle cx="32" cy="27" r="2.2" fill="#2563eb"/></svg>`;
  if (key === "solverfin_demo")
    return `<svg class="brand-icon card-brand-icon" viewBox="0 0 44 44" role="img"><rect x="6" y="11" width="32" height="22" rx="6" fill="#0f3d4c"/><path d="M13 25c3.7 0 3.7-7 7.4-7s3.7 7 8.6 7" fill="none" stroke="#22d3ee" stroke-width="3.4" stroke-linecap="round"/><circle cx="31" cy="25" r="2.7" fill="#fff"/></svg>`;
  return `<svg class="brand-icon card-brand-icon" viewBox="0 0 44 44" role="img"><rect x="6" y="11" width="32" height="22" rx="6" fill="#fff"/><rect x="10" y="17" width="24" height="4" rx="2" fill="#0f3d4c"/><rect x="10" y="25" width="10" height="3" rx="1.5" fill="#22d3ee"/></svg>`;
}
