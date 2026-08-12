interface StatementInsightTransaction {
  categoryId?: string;
  description?: string;
}

const TRANSACTION_ROW_PATTERN =
  /<article class="statement-row statement-body[^\"]*" role="row">[\s\S]*?<script type="application\/json" data-transaction="[^\"]+">([\s\S]*?)<\/script>\s*<\/article>/g;
const GROUP_ROW_PATTERN =
  /<article class="statement-row statement-body grouped-row"[\s\S]*?<\/article>/g;

export function enhanceStatementInsightContext(html: string, url: URL): string {
  const categoryId = readNonEmpty(url.searchParams.get("categoryId"));
  const merchantKey = normalizeMerchantKey(url.searchParams.get("merchantKey") ?? "");
  if (categoryId === undefined && merchantKey === undefined) return html;

  const hiddenInputs = [
    categoryId === undefined
      ? ""
      : `<input type="hidden" name="categoryId" value="${escapeHtml(categoryId)}" data-insight-context-param>`,
    merchantKey === undefined
      ? ""
      : `<input type="hidden" name="merchantKey" value="${escapeHtml(merchantKey)}" data-insight-context-param>`,
  ].join("");

  let enhanced = html.replace(
    '<form class="filter-form" method="get" action="/lancamentos" data-auto-submit>',
    `<form class="filter-form" method="get" action="/lancamentos" data-auto-submit>${hiddenInputs}`,
  );

  enhanced = enhanced.replace(TRANSACTION_ROW_PATTERN, (article, payloadText: string) => {
    const transaction = readTransaction(payloadText);
    return transaction !== undefined && matchesContext(transaction, categoryId, merchantKey)
      ? article
      : "";
  });
  enhanced = enhanced.replace(GROUP_ROW_PATTERN, "");

  const filters = [
    categoryId === undefined ? undefined : "a categoria indicada pelo insight",
    merchantKey === undefined ? undefined : `o estabelecimento ${merchantKey}`,
  ].filter(isString);
  const notice = `
    <p class="insight-context-notice" data-insight-context role="status">
      <strong>Filtro do insight ativo:</strong> mostrando lançamentos compatíveis com ${escapeHtml(filters.join(" e "))}.
      O resumo da conta permanece completo.
    </p>`;
  enhanced = enhanced.replace(
    '<section class="statement-layout">',
    `${notice}\n<section class="statement-layout">`,
  );

  return injectContextStyles(enhanced);
}

function matchesContext(
  transaction: StatementInsightTransaction,
  categoryId: string | undefined,
  merchantKey: string | undefined,
): boolean {
  if (categoryId !== undefined && transaction.categoryId !== categoryId) return false;
  if (
    merchantKey !== undefined &&
    normalizeMerchantKey(transaction.description ?? "") !== merchantKey
  ) {
    return false;
  }
  return true;
}

function readTransaction(value: string): StatementInsightTransaction | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
    return parsed as StatementInsightTransaction;
  } catch {
    return undefined;
  }
}

function normalizeMerchantKey(value: string): string | undefined {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\d+/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return normalized.length < 3 ? undefined : normalized;
}

function injectContextStyles(html: string): string {
  if (!html.includes("</style>")) return html;
  const styles = `
    .insight-context-notice { background: var(--primary-soft); border: 1px solid #d4e6ec; border-radius: var(--radius); color: var(--text); font-size: 0.8125rem; line-height: 1.45; margin: 0; padding: 9px 11px; }
    .insight-context-notice strong { color: var(--primary); }
  `;
  return html.replace("</style>", `${styles}</style>`);
}

function readNonEmpty(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isString(value: string | undefined): value is string {
  return value !== undefined;
}
