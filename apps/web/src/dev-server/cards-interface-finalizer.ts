const cardsPageTitle = "<title>Cartões de Crédito - SolverFin</title>";
const finalizerMarker = "data-cards-interface-finalized";

export function finalizeCardsInterface(html: string): string {
  if (!html.includes(cardsPageTitle)) return html;
  if (html.includes(finalizerMarker)) return html;

  const withInitialFocus = html.replace(
    /(<dialog data-modal="purchase"[\s\S]*?<input)(\s+name="amountMinor")/,
    "$1 autofocus$2",
  );
  const styles = `
    <style ${finalizerMarker}>
      @media(max-width:760px){
        main[data-cards-interface-enhanced] .purchase-search input{
          height:44px!important;
          min-height:44px!important;
        }
      }
    </style>`;

  return withInitialFocus.replace("</head>", `${styles}</head>`);
}
