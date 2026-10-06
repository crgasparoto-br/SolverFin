import { solverFinDesignTokens } from "../design-system/tokens.js";

const STYLE_MARKER = "data-transaction-group-modal-layout";

export function enhanceTransactionGroupModalLayout(html: string): string {
  if (!html.includes("data-group-modal") || html.includes(STYLE_MARKER)) return html;

  const { spacing, breakpoints, density } = solverFinDesignTokens;
  const styles = `
    <style ${STYLE_MARKER}>
      dialog[data-group-modal]{box-sizing:border-box;height:fit-content;max-height:calc(100dvh - ${spacing[8]});max-width:min(760px,calc(100vw - ${spacing[8]}));overflow:hidden;width:min(760px,calc(100vw - ${spacing[8]}))}
      dialog[data-group-modal] .group-modal-panel{box-sizing:border-box;height:fit-content;max-height:calc(100dvh - ${spacing[8]});min-width:0;padding:${spacing[5]};width:100%}
      dialog[data-group-modal] .group-modal-panel>header{align-items:start;display:flex;gap:${spacing[4]};justify-content:space-between;padding-bottom:${spacing[3]}}
      dialog[data-group-modal] .group-modal-panel>header>div{min-width:0}
      dialog[data-group-modal] .group-modal-panel>header h2{overflow-wrap:anywhere}
      dialog[data-group-modal] .group-modal-panel form[data-group-form]{box-sizing:border-box;flex:0 1 auto;grid-auto-flow:row;grid-template-columns:repeat(2,minmax(0,1fr));max-width:100%;min-width:0;overflow-x:hidden;overflow-y:auto;padding:${spacing[1]};scrollbar-gutter:stable;width:100%}
      dialog[data-group-modal] .group-modal-panel form[data-group-form]>label{box-sizing:border-box;grid-column:auto;min-width:0;overflow-wrap:anywhere}
      dialog[data-group-modal] .group-modal-panel form[data-group-form]>label:has([name="description"]),
      dialog[data-group-modal] .group-modal-panel form[data-group-form]>label:has([data-group-effective-input]),
      dialog[data-group-modal] .group-modal-panel form[data-group-form]>label:has(input[readonly]:not([data-group-kind-input]):not([data-group-status-input]):not([data-group-currency-input])){grid-column:1/-1}
      dialog[data-group-modal] .group-modal-panel form[data-group-form] :is(input,output){box-sizing:border-box;max-width:100%;min-width:0}
      dialog[data-group-modal] [data-group-effective-input]{display:block;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;white-space:normal}
      dialog[data-group-modal] .group-members-heading{align-items:center;gap:${spacing[4]};min-width:0}
      dialog[data-group-modal] .group-members-heading>div{min-width:0}
      dialog[data-group-modal] .group-members-heading>span{color:var(--muted);flex:0 0 auto;white-space:nowrap}
      dialog[data-group-modal] .group-members{box-sizing:border-box;max-height:clamp(220px,36vh,420px);min-height:min(220px,30vh);min-width:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;width:100%}
      dialog[data-group-modal] .group-member-row{box-sizing:border-box;grid-template-columns:minmax(0,1fr) max-content;gap:${spacing[2]} ${spacing[3]};min-width:0;width:100%}
      dialog[data-group-modal] .group-member-main{grid-column:1;grid-row:1/3;min-width:0}
      dialog[data-group-modal] .group-member-main>strong{overflow-wrap:anywhere;white-space:normal}
      dialog[data-group-modal] .group-member-meta{min-width:0}
      dialog[data-group-modal] .group-member-meta span{background:transparent;border:0;max-width:100%;overflow-wrap:anywhere;padding:0;white-space:normal}
      dialog[data-group-modal] .group-member-date{color:var(--muted);grid-column:2;grid-row:2;justify-self:end;min-width:0}
      dialog[data-group-modal] .group-member-amount{grid-column:2;grid-row:1;min-width:0}
      dialog[data-group-modal] .group-member-actions{flex-wrap:wrap;grid-column:1/-1;justify-content:flex-end;min-width:0}
      dialog[data-group-modal] .group-member-action{height:${density.interactiveTargetMin};min-width:${density.interactiveTargetMin}}
      dialog[data-group-modal] .group-actions{min-width:0}
      dialog[data-group-modal] .group-actions button{justify-content:center;min-height:${density.interactiveTargetMin}}
      dialog[data-group-modal] .group-actions [data-group-action="status"]{background:transparent;border:1px solid var(--line);color:var(--primary)}
      dialog[data-group-modal] .group-action-status{min-width:0;overflow-wrap:anywhere}
      dialog[data-group-modal] .save-row{min-width:0}
      @media(max-width:${breakpoints.shellCompact}){
        dialog[data-group-modal] .group-modal-panel{padding:${spacing[4]};width:100%}
        dialog[data-group-modal] .group-modal-panel form[data-group-form]{grid-template-columns:1fr;scrollbar-gutter:auto}
        dialog[data-group-modal] .group-modal-panel form[data-group-form]>label{grid-column:1/-1}
        dialog[data-group-modal] .group-modal-panel form[data-group-form] input{min-height:${density.interactiveTargetMin}}
        dialog[data-group-modal] .group-members{height:auto;max-height:38vh;min-height:min(286px,38vh);scrollbar-gutter:auto}
        dialog[data-group-modal] .group-member-row{grid-template-columns:minmax(0,1fr)}
        dialog[data-group-modal] :is(.group-member-main,.group-member-date,.group-member-amount,.group-member-actions){grid-column:1;grid-row:auto}
        dialog[data-group-modal] .group-member-amount{justify-self:end;max-width:100%;overflow-wrap:anywhere;white-space:normal}
        dialog[data-group-modal] .group-actions button{flex:1 1 100%}
        dialog[data-group-modal] .group-action-status{flex-basis:100%;margin-left:0}
        dialog[data-group-modal] .save-row{align-items:stretch;flex-direction:column-reverse}
        dialog[data-group-modal] .save-row button{min-height:${density.interactiveTargetMin};width:100%}
      }
    </style>`;

  return html.replace("</head>", `${styles}</head>`);
}
