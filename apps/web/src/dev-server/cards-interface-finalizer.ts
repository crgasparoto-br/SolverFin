export function finalizeCardsInterface(html: string): string {
  const withoutPreviousStyles = html.replace(
    /\s*<style data-cards-interface-finalized>[\s\S]*?<\/style>/g,
    "",
  );
  const withInitialFocus = withoutPreviousStyles.replace(
    /(<dialog data-modal="purchase"[\s\S]*?<input)(\s+name="amountMinor")/,
    "$1 autofocus$2",
  );
  const styles = `
    <style data-cards-interface-finalized>
      @media(max-width:760px){
        main[data-cards-interface-enhanced] .purchase-search input{
          height:44px!important;
          min-height:44px!important;
        }
      }
    </style>`;

  return withInitialFocus.replace("</head>", `${styles}</head>`);
}
