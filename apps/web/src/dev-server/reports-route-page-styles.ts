import { sharedShellStyles } from "./shared-styles.js";

export function reportPageStyles(): string {
  return `${sharedShellStyles()}
    main { display:grid; gap:14px; margin:0 auto; max-width:1600px; padding:18px 20px; width:100%; }
    .reports-heading { align-items:center; display:flex; gap:12px; justify-content:space-between; }
    .reports-heading > div { display:grid; gap:4px; max-width:820px; }
    .readonly-pill { background:var(--primary-soft); border:1px solid #d4e6ec; border-radius:999px; color:var(--primary); font-size:.75rem; font-weight:700; padding:3px 10px; white-space:nowrap; }
    .report-view-tabs { display:flex; flex-wrap:wrap; gap:6px; }
    .report-view-tabs a { border:1px solid var(--line); border-radius:999px; color:var(--text); font-size:.8125rem; font-weight:700; padding:7px 12px; text-decoration:none; }
    .report-view-tabs a[aria-current="page"] { background:var(--primary); border-color:var(--primary); color:#fff; }
    .report-filter-panel { padding:12px 14px; }
    .report-filters { align-items:end; display:grid; gap:10px; }
    .evolution-filters { grid-template-columns:minmax(12rem,1.2fr) minmax(10rem,1fr) minmax(8rem,.6fr) auto; }
    .installment-filters { grid-template-columns:minmax(9rem,.8fr) minmax(9rem,.8fr) minmax(11rem,1fr) minmax(11rem,1fr) auto; }
    .filter-hint { color:var(--muted); font-size:.75rem; margin-top:8px; }
    .filter-invalid-value { color:var(--danger,#b91c1c); font-size:.75rem; margin:2px 0 0; width:100%; }
    .filter-invalid-value code { font:inherit; font-weight:700; }
    .interval-switcher { align-items:center; border:0; display:flex; flex-wrap:wrap; gap:5px; margin:0; min-width:0; padding:0; }
    .interval-switcher legend { color:var(--text); font-size:.8125rem; font-weight:700; margin-bottom:5px; width:100%; }
    .interval-switcher a { border:1px solid var(--line); border-radius:999px; color:var(--text); font-size:.75rem; font-weight:700; padding:7px 10px; text-decoration:none; }
    .interval-switcher a[aria-current="page"] { background:var(--primary); border-color:var(--primary); color:#fff; }
    .report-state { display:grid; gap:4px; }
    .report-state-filter-error,.report-state-api-error { border-color:#fecaca; }
    .currency-report-list { display:grid; gap:14px; }
    .evolution-block { min-width:0; }
    .evolution-table-scroll { border:1px solid var(--line); border-radius:10px; overflow:auto; max-width:100%; }
    .evolution-table-scroll:focus-visible { outline:3px solid color-mix(in srgb,var(--primary) 35%,transparent); outline-offset:2px; }
    .evolution-table { border-collapse:separate; border-spacing:0; min-width:max(920px,100%); width:100%; }
    .evolution-table th,.evolution-table td { background:var(--surface); border-bottom:1px solid var(--line); padding:8px 10px; text-align:right; vertical-align:middle; white-space:nowrap; }
    .evolution-table thead th { background:var(--surface-strong,#f8fafc); font-size:.6875rem; position:sticky; top:0; z-index:3; }
    .evolution-table .sticky-description { left:0; min-width:15rem; position:sticky; text-align:left; z-index:2; }
    .evolution-table thead .sticky-description { z-index:4; }
    .evolution-table tbody th { padding-left:calc(10px + var(--report-depth,0) * 18px); }
    .evolution-table tbody th span { display:block; }
    .evolution-table tbody th small { color:var(--muted); display:block; font-size:.6875rem; font-weight:500; }
    .evolution-table td strong { display:block; font-size:.8125rem; }
    .evolution-table td span { color:var(--muted); display:block; font-size:.6875rem; margin-top:2px; }
    .report-section-row th,.report-section-row td { background:var(--primary-soft); font-weight:700; }
    .report-row-result th,.report-row-result td { border-top:2px solid var(--primary); }
    .summary-grid { display:grid; gap:10px; grid-template-columns:repeat(3,minmax(0,1fr)); }
    .metric-card { display:grid; gap:5px; min-width:0; padding:12px 14px; }
    .metric-card span { color:var(--muted); font-size:.6875rem; font-weight:700; text-transform:uppercase; }
    .metric-card strong { color:var(--primary); font-size:1.25rem; }
    .metric-card p { color:var(--muted); font-size:.8125rem; }
    .metric-primary { background:var(--primary); border-color:var(--primary); }
    .metric-primary span,.metric-primary strong,.metric-primary p { color:#fff; }
    .section-heading { align-items:center; display:flex; gap:10px; justify-content:space-between; }
    .section-heading > div { display:grid; gap:3px; }
    .section-heading > span { background:var(--primary-soft); border-radius:999px; color:var(--primary); font-size:.6875rem; font-weight:700; padding:2px 7px; }
    .installment-table { display:grid; overflow-x:auto; }
    .installment-table-head,.installment-table-row { align-items:center; border-bottom:1px solid var(--line); display:grid; gap:10px; grid-template-columns:6rem 4rem minmax(11rem,1.2fr) minmax(8rem,1fr) minmax(8rem,1fr) minmax(9rem,1fr) 7rem; min-width:860px; padding:8px 0; }
    .installment-table-head { color:var(--muted); font-size:.6875rem; font-weight:700; text-transform:uppercase; }
    .installment-table-row time,.installment-table-row span { color:var(--muted); font-size:.8125rem; }
    .installment-table-row strong:last-child { text-align:right; }
    .sr-only { clip:rect(0 0 0 0); clip-path:inset(50%); height:1px; overflow:hidden; position:absolute; white-space:nowrap; width:1px; }
    @media(max-width:1180px){.evolution-filters,.installment-filters{grid-template-columns:repeat(2,minmax(0,1fr));}.report-filters button{grid-column:1/-1;}.summary-grid{grid-template-columns:repeat(3,minmax(0,1fr));}}
    @media(max-width:760px){main{padding:14px 14px 24px;}.reports-heading,.section-heading{align-items:stretch;display:grid;}.report-filters,.summary-grid{grid-template-columns:1fr;}.readonly-pill{justify-self:start;}.evolution-table .sticky-description{min-width:12rem;}}
  `;
}
