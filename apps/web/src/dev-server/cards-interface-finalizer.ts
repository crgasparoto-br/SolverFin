const searchTargetMarker = "data-cards-search-target";

export function finalizeCardsInterface(html: string): string {
  const withInitialFocus = html.replace(
    /(<dialog data-modal="purchase"[\s\S]*?<input)(\s+name="amountMinor")/,
    "$1 autofocus$2",
  );

  if (withInitialFocus.includes(searchTargetMarker)) return withInitialFocus;

  return withInitialFocus.replace(
    /<input\b([^>]*\bdata-purchase-search\b[^>]*)>/,
    `<input ${searchTargetMarker} style="height:44px;min-height:44px"$1>`,
  );
}
