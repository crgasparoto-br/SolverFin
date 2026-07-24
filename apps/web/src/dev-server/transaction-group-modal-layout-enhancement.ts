const STYLE_MARKER = "data-transaction-group-modal-layout";

export function enhanceTransactionGroupModalLayout(html: string): string {
  if (!html.includes("data-group-modal") || html.includes(STYLE_MARKER)) return html;

  const styles = `
    <style ${STYLE_MARKER}>
      dialog[data-group-modal]{box-sizing:border-box;height:auto;max-height:calc(100dvh - 24px);max-width:min(1220px,calc(100vw - 24px));overflow:hidden;width:min(1220px,calc(100vw - 24px))}
      dialog[data-group-modal] .group-modal-panel{box-sizing:border-box;max-height:calc(100dvh - 24px);min-width:0;padding:20px 22px 18px;width:100%}
      dialog[data-group-modal] .group-modal-panel>header{align-items:center;display:flex;gap:16px;justify-content:space-between;padding-bottom:14px}
      dialog[data-group-modal] .group-modal-panel>header>div{min-width:0}
      dialog[data-group-modal] .group-modal-panel>header h2{overflow-wrap:anywhere}
      dialog[data-group-modal] .group-modal-panel form[data-group-form]{grid-auto-flow:row dense;grid-template-columns:repeat(12,minmax(0,1fr));min-width:0;overflow-x:hidden;overflow-y:auto;padding:4px 2px 0;scrollbar-gutter:stable}
      dialog[data-group-modal] .group-modal-panel form[data-group-form]>label{box-sizing:border-box;min-width:0}
      dialog[data-group-modal] .group-modal-panel form[data-group-form]>label:nth-of-type(1){grid-column:span 3}
      dialog[data-group-modal] .group-modal-panel form[data-group-form]>label:nth-of-type(2){grid-column:span 5}
      dialog[data-group-modal] .group-modal-panel form[data-group-form]>label:nth-of-type(3){grid-column:span 2}
      dialog[data-group-modal] .group-modal-panel form[data-group-form]>label:nth-of-type(4){grid-column:span 6}
      dialog[data-group-modal] .group-modal-panel form[data-group-form]>label:nth-of-type(5){grid-column:span 3}
      dialog[data-group-modal] .group-modal-panel form[data-group-form]>label:nth-of-type(6){grid-column:span 3}
      dialog[data-group-modal] .group-modal-panel form[data-group-form]>label:nth-of-type(7){grid-column:span 2}
      dialog[data-group-modal] .group-members-heading{align-items:center;gap:16px;min-width:0}
      dialog[data-group-modal] .group-members-heading>div{min-width:0}
      dialog[data-group-modal] .group-members-heading>span{background:var(--primary-soft);border:1px solid var(--line);border-radius:999px;flex:0 0 auto;padding:3px 8px;white-space:nowrap}
      dialog[data-group-modal] .group-members{box-sizing:border-box;max-height:clamp(280px,44vh,520px);min-width:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;width:100%}
      dialog[data-group-modal] .group-member-row{box-sizing:border-box;grid-template-columns:minmax(0,1fr) 8rem 9rem 7.25rem;min-width:0;width:100%}
      dialog[data-group-modal] .group-member-main,dialog[data-group-modal] .group-member-meta,dialog[data-group-modal] .group-member-date,dialog[data-group-modal] .group-member-amount,dialog[data-group-modal] .group-member-actions{min-width:0}
      dialog[data-group-modal] .group-member-main>strong{overflow-wrap:anywhere;white-space:normal}
      dialog[data-group-modal] .group-member-meta span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      dialog[data-group-modal] .group-member-actions{flex-wrap:nowrap}
      dialog[data-group-modal] .group-actions{min-width:0}
      dialog[data-group-modal] .group-actions button{justify-content:center}
      dialog[data-group-modal] .group-action-status{min-width:0;overflow-wrap:anywhere}
      dialog[data-group-modal] .save-row{min-width:0}
      @media(max-width:1050px){
        dialog[data-group-modal] .group-modal-panel form[data-group-form]>label:nth-of-type(1),dialog[data-group-modal] .group-modal-panel form[data-group-form]>label:nth-of-type(3),dialog[data-group-modal] .group-modal-panel form[data-group-form]>label:nth-of-type(5),dialog[data-group-modal] .group-modal-panel form[data-group-form]>label:nth-of-type(6),dialog[data-group-modal] .group-modal-panel form[data-group-form]>label:nth-of-type(7){grid-column:span 4}
        dialog[data-group-modal] .group-modal-panel form[data-group-form]>label:nth-of-type(2),dialog[data-group-modal] .group-modal-panel form[data-group-form]>label:nth-of-type(4){grid-column:span 6}
      }
      @media(max-width:760px){
        dialog[data-group-modal]{max-height:calc(100dvh - 12px);max-width:calc(100vw - 12px);width:calc(100vw - 12px)}
        dialog[data-group-modal] .group-modal-panel{max-height:calc(100dvh - 12px);padding:16px 14px 14px;width:100%}
        dialog[data-group-modal] .group-modal-panel form[data-group-form]{grid-template-columns:repeat(2,minmax(0,1fr));scrollbar-gutter:auto}
        dialog[data-group-modal] .group-modal-panel form[data-group-form]>label:nth-of-type(n){grid-column:span 1}
        dialog[data-group-modal] .group-modal-panel form[data-group-form]>label:nth-of-type(2),dialog[data-group-modal] .group-modal-panel form[data-group-form]>label:nth-of-type(4){grid-column:1/-1}
        dialog[data-group-modal] .group-members{max-height:42vh;scrollbar-gutter:auto}
        dialog[data-group-modal] .group-member-row{grid-template-columns:minmax(0,1fr) auto;width:100%}
        dialog[data-group-modal] .group-member-actions{flex-wrap:wrap}
        dialog[data-group-modal] .group-actions button{flex:1 1 calc(50% - 8px)}
        dialog[data-group-modal] .group-action-status{flex-basis:100%;margin-left:0}
      }
      @media(max-width:520px){
        dialog[data-group-modal] .group-modal-panel form[data-group-form]{grid-template-columns:1fr}
        dialog[data-group-modal] .group-modal-panel form[data-group-form]>label:nth-of-type(n){grid-column:1/-1}
        dialog[data-group-modal] .group-actions button{flex-basis:100%}
        dialog[data-group-modal] .save-row{align-items:stretch;flex-direction:column-reverse}
        dialog[data-group-modal] .save-row button{width:100%}
      }
    </style>`;

  return html.replace("</head>", `${styles}</head>`);
}
