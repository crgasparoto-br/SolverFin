import { formatDateOnly, formatMinorCurrency } from "@solverfin/shared";

export function formatMoney(amountMinor: number, currency: string): string {
  return formatMinorCurrency(amountMinor, { currency });
}
export function formatDate(value: string): string {
  return formatDateOnly(value);
}

const MONTH_ABBREVIATIONS = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
];

/**
 * Compact movement date of the reference: day plus month. The machine-readable value stays in
 * the `datetime` attribute and the full date stays in `title`, so nothing is lost.
 */
export function formatMovementDate(value: string): string {
  const month = Number(value.slice(5, 7));
  const day = value.slice(8, 10);
  const abbreviation = MONTH_ABBREVIATIONS[month - 1];
  return abbreviation ? `${day} ${abbreviation}` : formatDate(value);
}

export function formatPercentage(value: number, maximumFractionDigits: number): string {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits }).format(value)}%`;
}
const ROW_GLYPHS: Readonly<Record<string, string>> = {
  expense: '<path d="M6 6l8 8m0 0V7.5M14 14H7.5"/>',
  income: '<path d="M6 14 14 6m0 0H7.5M14 6v6.5"/>',
  transfer: '<path d="M4 8h9l-2.5-2.5M16 12H7l2.5 2.5"/>',
  food: '<path d="M4 6h12l-1 9a1.5 1.5 0 0 1-1.5 1.3H6.5A1.5 1.5 0 0 1 5 15Z"/><path d="M7.5 6V4.5M12.5 6V4.5"/>',
  health: '<path d="M10 16s-5.5-3.4-5.5-7A3 3 0 0 1 10 7a3 3 0 0 1 5.5 2c0 3.6-5.5 7-5.5 7Z"/>',
  transport:
    '<path d="M4.5 13V8l1.6-2.8A1 1 0 0 1 7 4.7h6a1 1 0 0 1 .9.5L15.5 8v5"/><path d="M4.5 13h11M6.5 13v1.4M13.5 13v1.4"/>',
  home: '<path d="M4 9.5 10 4.5l6 5V16H4Z"/><path d="M8.5 16v-3.5h3V16"/>',
  utility: '<path d="M11.5 3 5.5 11h3l-1 6 6-8h-3Z"/>',
  education:
    '<path d="M3.5 8 10 5l6.5 3-6.5 3Z"/><path d="M6 9.6V13c0 .9 1.8 1.6 4 1.6s4-.7 4-1.6V9.6"/>',
  leisure: '<path d="M4 7.5h12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"/><path d="M7.5 7.5v-2h5v2"/>',
  incomeCategory: '<path d="M4 15V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8Z"/><path d="M8 11h4"/>',
  investment: '<path d="M4 15 8 10l3 2.5L16 6"/><path d="M16 6h-3.4M16 6v3.4"/>',
  tax: '<path d="M5 3.5h7L15.5 7v9.5h-11Z"/><path d="M11.8 3.6V7h3.4"/><path d="M7 11h6M7 14h4"/>',
  receipt:
    '<path d="M5 3.5h7L15.5 7v9.5h-11Z"/><path d="M11.8 3.6V7h3.4"/><path d="M7 11h6M7 14h4"/>',
};

const ROW_GLYPH_FALLBACK = '<path d="M6 6l8 8m0 0V7.5M14 14H7.5"/>';

const ROW_GLYPH_KEYWORDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/aliment|mercado|supermerc|restaurant|comida|padaria|cafe/i, "food"],
  [/saude|saúde|farmac|medic|médic|academia|esport|esporte|dentist/i, "health"],
  [/transporte|combust|posto|uber|carro|veic|passagem|pedagio|pedágio/i, "transport"],
  [/moradia|aluguel|condomin|casa|imovel|imóvel/i, "home"],
  [/luz|energia|agua|água|internet|telefone|celular|conta|gas|gás|utilidade/i, "utility"],
  [/educa|curso|escola|faculdade|livro|material/i, "education"],
  [/lazer|viagem|cinema|streaming|jogo|divers/i, "leisure"],
  [/salario|salário|renda|provento|pagamento|recebimento|holerite/i, "incomeCategory"],
  [/invest|poupanc|poupanç|rendimento|aplicac|aplicaç/i, "investment"],
  [/imposto|taxa|tarifa|tribut/i, "tax"],
];

/**
 * A decorative glyph for the movement row. It is derived from the category when one is present and
 * falls back to the movement direction, so no financial meaning is invented.
 */
export function resolveRowGlyph(categoryName: string, kind: string): { key: string; html: string } {
  const match =
    categoryName && categoryName !== "Sem categoria"
      ? ROW_GLYPH_KEYWORDS.find(([pattern]) => pattern.test(categoryName))
      : undefined;
  const key = match
    ? match[1]
    : kind === "income"
      ? "income"
      : kind === "transfer"
        ? "transfer"
        : "expense";
  return { key, html: ROW_GLYPHS[key] ?? ROW_GLYPH_FALLBACK };
}

export function renderRowGlyph(categoryName: string, kind: string): string {
  const glyph = resolveRowGlyph(categoryName, kind);
  return `<span class="col-row-icon" data-row-glyph="${escapeHtml(glyph.key)}" aria-hidden="true"><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${glyph.html}</svg></span>`;
}

/**
 * The category chip leads with the movement direction, so the direction is readable before the word:
 * an up arrow for entries, a down arrow for exits and two stacked horizontal arrows for transfers.
 * The direction is decorative here (`aria-hidden`); the word and the row's own direction column
 * remain the accessible carriers of the information.
 */
export type CategoryDirection = "in" | "out" | "transfer";

export const CATEGORY_DIRECTION_GLYPHS: Record<CategoryDirection, string> = {
  in: '<path d="M10 16.5V4.5"/><path d="m5.5 9 4.5-4.5L14.5 9"/>',
  out: '<path d="M10 3.5v12"/><path d="m5.5 11 4.5 4.5L14.5 11"/>',
  transfer:
    '<path d="M3.5 7h11"/><path d="m11.5 4 3 3-3 3"/><path d="M16.5 13h-11"/><path d="m8.5 10-3 3 3 3"/>',
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
