import { solverFinDesignTokens, type SolverFinDesignTokens } from "./tokens.js";

type TokenScalar = string | number;

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function serializeVariables(prefix: string, values: Readonly<Record<string, TokenScalar>>): string {
  return Object.entries(values)
    .map(([name, value]) => `  --sf-${prefix}-${toKebabCase(name)}: ${value};`)
    .join("\n");
}

function semanticStateVariables(tokens: SolverFinDesignTokens): string {
  return Object.entries(tokens.semanticStates)
    .flatMap(([state, values]) => [
      `  --sf-state-${state}-foreground: ${values.foreground};`,
      `  --sf-state-${state}-surface: ${values.surface};`,
      `  --sf-state-${state}-border: ${values.border};`,
      `  --sf-state-${state}-marker: "${values.marker}";`,
    ])
    .join("\n");
}

export function buildSolverFinCssVariables(
  tokens: SolverFinDesignTokens = solverFinDesignTokens,
): string {
  return [
    serializeVariables("color", tokens.colors),
    serializeVariables("space", tokens.spacing),
    serializeVariables("radius", tokens.radii),
    serializeVariables("shadow", tokens.shadows),
    serializeVariables("motion", tokens.motion),
    serializeVariables("breakpoint", tokens.breakpoints),
    serializeVariables("font-size", tokens.typography.sizes),
    serializeVariables("font-weight", tokens.typography.weights),
    serializeVariables("line-height", tokens.typography.lineHeights),
    serializeVariables("layout", tokens.layout),
    serializeVariables("density", tokens.density),
    semanticStateVariables(tokens),
    `  --sf-font-family: ${tokens.typography.fontFamily};`,
  ].join("\n");
}

export function createSolverFinDesignSystemCss(
  tokens: SolverFinDesignTokens = solverFinDesignTokens,
): string {
  return `
:root {
${buildSolverFinCssVariables(tokens)}
}

.sf-app-surface {
  background: var(--sf-color-background);
  color: var(--sf-color-text);
  font-family: var(--sf-font-family);
}

.sf-page-container {
  margin-inline: auto;
  max-width: var(--sf-layout-content-max-width);
  padding-inline: var(--sf-layout-gutter-desktop);
  width: 100%;
}

.sf-responsive-grid {
  display: grid;
  gap: var(--sf-layout-grid-gap);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--sf-layout-grid-min-column)), 1fr));
}

.sf-focus-ring:focus-visible,
.sf-button:focus-visible,
.sf-tab:focus-visible {
  outline: none;
  box-shadow: var(--sf-shadow-focus);
}

.sf-button {
  align-items: center;
  border-radius: var(--sf-radius-md);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-weight: var(--sf-font-weight-bold);
  gap: var(--sf-space-2);
  justify-content: center;
  letter-spacing: 0;
  min-height: var(--sf-density-interactive-target-min);
  padding: 0 var(--sf-space-4);
  text-align: center;
  transition: background var(--sf-motion-fast), border-color var(--sf-motion-fast), color var(--sf-motion-fast), box-shadow var(--sf-motion-fast);
  white-space: normal;
}

.sf-button:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.sf-button-primary {
  background: var(--sf-color-primary);
  border: 1px solid transparent;
  color: var(--sf-color-on-primary);
}

.sf-button-secondary,
.sf-button-ghost {
  background: var(--sf-color-surface);
  border: 1px solid var(--sf-color-border);
  color: var(--sf-color-primary);
}

.sf-button-ghost {
  background: transparent;
  border-color: transparent;
}

.sf-button-secondary:hover:not(:disabled),
.sf-button-secondary:focus-visible,
.sf-button-ghost:hover:not(:disabled),
.sf-button-ghost:focus-visible,
.sf-tab:hover,
.sf-tab:focus-visible {
  background: var(--sf-color-neutral-control-hover);
  border-color: var(--sf-color-neutral-control-border-hover);
  color: var(--sf-color-neutral-control-text-hover);
}

.sf-button-danger {
  background: var(--sf-color-danger);
  border: 1px solid transparent;
  color: var(--sf-color-on-danger);
}

.sf-button-danger:hover:not(:disabled),
.sf-button-danger:focus-visible {
  background: var(--sf-color-danger);
  border-color: var(--sf-color-danger-border);
  color: var(--sf-color-on-danger);
}

.sf-icon-button {
  min-width: var(--sf-density-interactive-target-min);
  padding-inline: var(--sf-space-2);
}

.sf-icon-button-glyph {
  font-size: var(--sf-font-size-lg);
  line-height: 1;
}

.sf-field {
  display: grid;
  gap: var(--sf-space-2);
}

.sf-label {
  color: var(--sf-color-text);
  font-size: var(--sf-font-size-md);
  font-weight: var(--sf-font-weight-bold);
}

.sf-control {
  background: var(--sf-color-surface);
  border: 1px solid var(--sf-color-border);
  border-radius: var(--sf-radius-md);
  color: var(--sf-color-text);
  min-height: var(--sf-density-interactive-target-min);
  padding: 0 var(--sf-density-panel-padding-block);
  transition: border-color var(--sf-motion-fast), box-shadow var(--sf-motion-fast);
}

.sf-control[aria-invalid="true"] {
  border-color: var(--sf-color-danger);
}

.sf-help-text {
  color: var(--sf-color-muted-text);
  font-size: var(--sf-font-size-xs);
}

.sf-card,
.sf-metric-card {
  background: var(--sf-color-surface);
  border: 1px solid var(--sf-color-border);
  border-radius: var(--sf-radius-lg);
  box-shadow: var(--sf-shadow-sm);
  min-width: 0;
  padding: var(--sf-density-panel-padding-block) var(--sf-density-panel-padding-inline);
}

.sf-card {
  display: grid;
  gap: var(--sf-space-3);
}

.sf-card-title,
.sf-card-body,
.sf-card-footer,
.sf-metric-card-label,
.sf-metric-card-value,
.sf-metric-card-detail {
  min-width: 0;
  overflow-wrap: anywhere;
}

.sf-card-title {
  color: var(--sf-color-text);
  font-size: var(--sf-font-size-heading);
  font-weight: var(--sf-font-weight-bold);
}

.sf-card-body {
  color: var(--sf-color-text);
  line-height: var(--sf-line-height-normal);
}

.sf-card-footer {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: var(--sf-space-2);
}

.sf-metric-card {
  display: grid;
  gap: var(--sf-space-2);
}

.sf-metric-card-label,
.sf-metric-card-detail {
  color: var(--sf-color-muted-text);
  font-size: var(--sf-font-size-md);
}

.sf-metric-card-value {
  color: var(--sf-color-text);
  font-size: var(--sf-font-size-xl);
  line-height: var(--sf-line-height-tight);
}

.sf-table-wrap {
  border: 1px solid var(--sf-color-border);
  border-radius: var(--sf-radius-lg);
  max-width: 100%;
  overflow-x: auto;
}

.sf-table {
  border-collapse: collapse;
  font-size: var(--sf-font-size-md);
  min-width: 100%;
  width: 100%;
}

.sf-table th {
  background: var(--sf-color-background);
  color: var(--sf-color-muted-text);
  text-align: left;
}

.sf-table th,
.sf-table td {
  border-top: 1px solid var(--sf-color-border);
  overflow-wrap: anywhere;
  padding: var(--sf-density-table-cell-block) var(--sf-density-table-cell-inline);
  vertical-align: top;
}

.sf-table [data-align="center"] { text-align: center; }
.sf-table [data-align="end"] { text-align: right; }

.sf-visually-hidden {
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  height: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
  width: 1px;
}

.sf-empty-state {
  display: grid;
  gap: var(--sf-space-3);
  justify-items: center;
  padding: var(--sf-space-8);
  text-align: center;
}

.sf-semantic-state {
  align-items: start;
  background: var(--sf-state-surface);
  border: 1px solid var(--sf-state-border);
  border-inline-start-width: var(--sf-space-1);
  color: var(--sf-state-foreground);
  display: grid;
  gap: var(--sf-space-2);
  grid-template-columns: auto minmax(0, 1fr);
  padding: var(--sf-space-2) var(--sf-space-3);
}

.sf-semantic-state::before {
  content: var(--sf-state-marker);
  font-weight: var(--sf-font-weight-bold);
}

${Object.keys(tokens.semanticStates)
  .map(
    (state) => `.sf-semantic-state[data-state="${state}"] {
  --sf-state-foreground: var(--sf-state-${state}-foreground);
  --sf-state-surface: var(--sf-state-${state}-surface);
  --sf-state-border: var(--sf-state-${state}-border);
  --sf-state-marker: var(--sf-state-${state}-marker);
}`,
  )
  .join("\n\n")}

.sf-state-panel {
  align-items: start;
  background: var(--sf-color-surface);
  border: 1px solid var(--sf-color-border);
  border-radius: var(--sf-radius-lg);
  display: grid;
  gap: var(--sf-space-3);
  grid-template-columns: auto minmax(0, 1fr);
  padding: var(--sf-space-4);
}

.sf-state-panel-marker {
  align-items: center;
  background: var(--sf-color-surface-soft);
  border-radius: var(--sf-radius-full);
  display: inline-flex;
  height: var(--sf-space-6);
  justify-content: center;
  width: var(--sf-space-6);
}

.sf-state-panel[data-state="loading"] .sf-state-panel-marker::before { content: "…"; }
.sf-state-panel[data-state="empty"] .sf-state-panel-marker::before { content: "–"; }
.sf-state-panel[data-state="error"] .sf-state-panel-marker::before { content: "!"; color: var(--sf-color-danger); }
.sf-state-panel[data-state="unavailable"] .sf-state-panel-marker::before { content: "×"; }
.sf-state-panel[data-state="permission"] .sf-state-panel-marker::before { content: "!"; color: var(--sf-color-warning-text); }

.sf-state-panel-content {
  display: grid;
  gap: var(--sf-space-2);
  min-width: 0;
}

.sf-state-panel-title,
.sf-state-panel-description {
  overflow-wrap: anywhere;
}

.sf-state-panel-description {
  color: var(--sf-color-muted-text);
  line-height: var(--sf-line-height-normal);
}

.sf-state-panel-actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: var(--sf-space-2);
}

.sf-alert {
  border-radius: var(--sf-radius-md);
}

.sf-alert-content {
  display: grid;
  gap: var(--sf-space-1);
  min-width: 0;
}

.sf-alert-description {
  line-height: var(--sf-line-height-normal);
  overflow-wrap: anywhere;
}

.sf-dialog {
  background: transparent;
  border: 0;
  color: var(--sf-color-text);
  max-height: calc(100dvh - var(--sf-space-8));
  max-width: var(--sf-layout-dialog-max-width);
  padding: 0;
  width: min(calc(100% - var(--sf-space-8)), var(--sf-layout-dialog-max-width));
}

.sf-dialog::backdrop {
  background: var(--sf-color-dialog-backdrop);
}

.sf-dialog-panel {
  background: var(--sf-color-surface);
  border: 1px solid var(--sf-color-border);
  border-radius: var(--sf-radius-xl);
  box-shadow: var(--sf-shadow-dialog);
  display: grid;
  gap: var(--sf-space-4);
  max-height: inherit;
  overflow: auto;
  padding: var(--sf-space-5);
}

.sf-dialog-header {
  align-items: start;
  display: flex;
  gap: var(--sf-space-3);
  justify-content: space-between;
}

.sf-dialog-heading,
.sf-dialog-body {
  min-width: 0;
}

.sf-dialog-heading {
  display: grid;
  gap: var(--sf-space-2);
}

.sf-dialog-heading h2,
.sf-dialog-description,
.sf-dialog-body {
  overflow-wrap: anywhere;
}

.sf-dialog-description {
  color: var(--sf-color-muted-text);
  line-height: var(--sf-line-height-normal);
}

.sf-dialog-actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: var(--sf-space-2);
  justify-content: flex-end;
}

.sf-dialog-close {
  flex: 0 0 auto;
}

.sf-drawer {
  height: 100dvh;
  margin: 0 0 0 auto;
  max-height: 100dvh;
  width: min(100%, var(--sf-layout-dialog-max-width));
}

.sf-drawer .sf-dialog-panel {
  border-radius: var(--sf-radius-xl) 0 0 var(--sf-radius-xl);
  height: 100%;
}

.sf-tabs {
  align-items: center;
  display: flex;
  gap: var(--sf-space-1);
  max-width: 100%;
  overflow-x: auto;
  padding-block: var(--sf-space-1);
}

.sf-tab {
  align-items: center;
  border: 1px solid transparent;
  border-radius: var(--sf-radius-md);
  color: var(--sf-color-primary);
  display: inline-flex;
  flex: 0 0 auto;
  font-weight: var(--sf-font-weight-semibold);
  min-height: var(--sf-density-interactive-target-min);
  padding-inline: var(--sf-space-3);
  text-decoration: none;
}

.sf-tab[aria-current="page"] {
  background: var(--sf-color-primary-soft);
  border-color: var(--sf-color-neutral-control-border-hover);
}

.sf-badge {
  align-items: center;
  border: 1px solid var(--sf-color-border);
  border-radius: var(--sf-radius-full);
  display: inline-flex;
  font-size: var(--sf-font-size-sm);
  font-weight: var(--sf-font-weight-semibold);
  min-height: var(--sf-space-6);
  padding-inline: var(--sf-space-2);
}

.sf-badge[data-tone="positive"] { background: var(--sf-color-success-surface); border-color: var(--sf-color-success-border); color: var(--sf-color-success); }
.sf-badge[data-tone="negative"] { background: var(--sf-color-danger-surface); border-color: var(--sf-color-danger-border); color: var(--sf-color-danger); }
.sf-badge[data-tone="attention"] { background: var(--sf-color-warning-surface); border-color: var(--sf-color-warning-border); color: var(--sf-color-warning-text); }
.sf-badge[data-tone="information"] { background: var(--sf-color-information-surface); border-color: var(--sf-color-information-border); color: var(--sf-color-information); }
.sf-badge[data-tone="neutral"] { background: var(--sf-color-surface-soft); color: var(--sf-color-muted-text); }

.sf-toast {
  background: var(--sf-color-surface);
  border: 1px solid var(--sf-color-border);
  border-inline-start: var(--sf-space-1) solid var(--sf-color-primary);
  border-radius: var(--sf-radius-lg);
  box-shadow: var(--sf-shadow-toast);
  display: grid;
  gap: var(--sf-space-1);
  max-width: min(100%, var(--sf-layout-dialog-max-width));
  padding: var(--sf-space-3) var(--sf-space-4);
}

.sf-toast[data-tone="positive"] { border-inline-start-color: var(--sf-color-success); }
.sf-toast[data-tone="negative"] { border-inline-start-color: var(--sf-color-danger); }
.sf-toast[data-tone="attention"] { border-inline-start-color: var(--sf-color-warning); }
.sf-toast[data-tone="information"] { border-inline-start-color: var(--sf-color-information); }
.sf-toast-description { color: var(--sf-color-muted-text); overflow-wrap: anywhere; }

.sf-page-header {
  align-items: start;
  display: flex;
  gap: var(--sf-space-4);
  justify-content: space-between;
  min-width: 0;
  padding-block: var(--sf-space-4);
}

.sf-page-header-copy {
  display: grid;
  gap: var(--sf-space-2);
  min-width: 0;
}

.sf-page-header-eyebrow {
  color: var(--sf-color-accent-strong);
  font-size: var(--sf-font-size-xs);
  font-weight: var(--sf-font-weight-bold);
  text-transform: uppercase;
}

.sf-page-header-title,
.sf-page-header-description {
  min-width: 0;
  overflow-wrap: anywhere;
}

.sf-page-header-description {
  color: var(--sf-color-muted-text);
  line-height: var(--sf-line-height-normal);
}

.sf-page-header-actions,
.sf-filter-bar,
.sf-form-layout-actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: var(--sf-space-2);
}

.sf-filter-bar {
  background: var(--sf-color-surface);
  border: 1px solid var(--sf-color-border);
  border-radius: var(--sf-radius-lg);
  padding: var(--sf-space-3);
}

.sf-summary-grid {
  display: grid;
  gap: var(--sf-layout-grid-gap);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--sf-layout-grid-min-column)), 1fr));
}

.sf-detail-layout {
  display: grid;
  gap: var(--sf-layout-grid-gap);
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.sf-detail-layout-master,
.sf-detail-layout-detail {
  min-width: 0;
}

.sf-detail-layout button {
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: normal;
}

.sf-form-layout,
.sf-form-layout-fields {
  display: grid;
  gap: var(--sf-space-4);
  min-width: 0;
}

.sf-form-layout-error {
  min-width: 0;
}

.sf-form-layout-actions {
  justify-content: flex-end;
}

@media (max-width: ${tokens.breakpoints.shellCompact}) {
  .sf-page-container {
    padding-inline: var(--sf-layout-gutter-mobile);
  }

  .sf-page-header {
    align-items: stretch;
    flex-direction: column;
  }

  .sf-page-header-actions,
  .sf-filter-bar,
  .sf-form-layout-actions {
    align-items: stretch;
  }

  .sf-page-header-actions > *,
  .sf-filter-bar > *,
  .sf-form-layout-actions > * {
    flex: 1 1 auto;
  }

  .sf-detail-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: ${tokens.breakpoints.sm}) {
  .sf-dialog {
    max-height: calc(100dvh - var(--sf-space-4));
    width: calc(100% - var(--sf-space-4));
  }

  .sf-dialog-panel {
    padding: var(--sf-space-4);
  }

  .sf-dialog-actions > * {
    flex: 1 1 100%;
  }

  .sf-drawer {
    height: 100dvh;
    max-height: 100dvh;
    width: 100%;
  }

  .sf-drawer .sf-dialog-panel {
    border-radius: 0;
  }
}
`;
}

export const solverFinDesignSystemCss = createSolverFinDesignSystemCss();
