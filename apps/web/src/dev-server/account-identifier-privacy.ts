const accountArticlePattern =
  /<article class="master-item"(?=[^>]*data-master-item)[\s\S]*?<\/article>/g;

export function protectAccountIdentifierPrivacy(html: string): string {
  if (!html.includes('data-tab-panel="accounts"')) return html;

  return html.replace(accountArticlePattern, protectAccountArticle);
}

function protectAccountArticle(article: string): string {
  const agencyIdentifier = readIdentifierInput(article, "agencyIdentifier");
  const accountIdentifier = readIdentifierInput(article, "accountIdentifier");
  const hasStructuredIdentifier = Boolean(agencyIdentifier || accountIdentifier);

  if (!hasStructuredIdentifier) {
    return article;
  }

  const currentIdentifier = formatCurrentIdentifier(agencyIdentifier, accountIdentifier);
  const safeIdentifier = formatSafeIdentifier(agencyIdentifier, accountIdentifier);

  if (!currentIdentifier || currentIdentifier === safeIdentifier) {
    return article;
  }

  const currentEscaped = escapeHtml(currentIdentifier);
  const safeEscaped = safeIdentifier ? escapeHtml(safeIdentifier) : undefined;
  let protectedArticle = article.replace(
    ` · ${currentEscaped}</p>`,
    safeEscaped ? ` · ${safeEscaped}</p>` : "</p>",
  );

  protectedArticle = protectedArticle.replace(/data-search="([^"]*)"/, (_match, search: string) => {
    const currentSearchValue = escapeHtml(currentIdentifier.toLowerCase());
    const safeSearchValue = safeIdentifier ? escapeHtml(safeIdentifier.toLowerCase()) : "";
    const protectedSearch = search
      .replace(currentSearchValue, safeSearchValue)
      .replace(/\s{2,}/g, " ")
      .trim();

    return `data-search="${protectedSearch}"`;
  });

  return protectedArticle;
}

function readIdentifierInput(article: string, name: string): string | undefined {
  const match = article.match(new RegExp(`<input name="${name}" value="([^"]*)"`));
  const decoded = match?.[1] === undefined ? undefined : decodeHtml(match[1]);
  const normalized = decoded?.trim();

  return normalized || undefined;
}

function formatCurrentIdentifier(
  agencyIdentifier: string | undefined,
  accountIdentifier: string | undefined,
): string | undefined {
  return joinIdentifierParts([
    formatCurrentPart("Agência", agencyIdentifier, 2),
    formatCurrentPart("Conta", accountIdentifier, 4),
  ]);
}

function formatSafeIdentifier(
  agencyIdentifier: string | undefined,
  accountIdentifier: string | undefined,
): string | undefined {
  return joinIdentifierParts([
    formatSafePart("Agência", agencyIdentifier, 2),
    formatSafePart("Conta", accountIdentifier, 4),
  ]);
}

function joinIdentifierParts(parts: Array<string | undefined>): string | undefined {
  const visibleParts = parts.filter((part): part is string => part !== undefined);

  return visibleParts.length > 0 ? visibleParts.join(" · ") : undefined;
}

function formatCurrentPart(
  label: string,
  value: string | undefined,
  visibleCharacters: number,
): string | undefined {
  if (!value) return undefined;

  return `${label} final ${value.slice(-Math.min(visibleCharacters, value.length))}`;
}

function formatSafePart(
  label: string,
  value: string | undefined,
  visibleCharacters: number,
): string | undefined {
  if (!value || value.length <= visibleCharacters) return undefined;

  return `${label} final ${value.slice(-visibleCharacters)}`;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
