const searchTargetMarker = "data-cards-search-target";
const amountFieldMarker = "data-cards-initial-focus";

export function finalizeCardsInterface(html: string): string {
  let finalized = html;

  if (!finalized.includes(amountFieldMarker)) {
    finalized = finalized.replace(
      'name="amountMinor" data-money',
      `name="amountMinor" data-money autofocus ${amountFieldMarker}`,
    );
  }

  if (!finalized.includes(searchTargetMarker)) {
    finalized = finalized.replace(
      "data-purchase-search",
      `data-purchase-search ${searchTargetMarker} style="height:44px;min-height:44px"`,
    );
  }

  return finalized;
}
