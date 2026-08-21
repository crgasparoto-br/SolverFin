import { solverFinDesignTokens, type SolverFinDesignTokens } from "./tokens.js";

type TokenScalar = string | number;

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function serializeVariables(
  prefix: string,
  values: Readonly<Record<string, TokenScalar>>,
): string {
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

.sf-focus-ring:focus-visible {
  outline: none;
  box-shadow: var(--sf-shadow-focus);
}

.sf-button {
  align-items: center;
  border-radius: var(--sf-radius-md);
  cursor: pointer;
  display: inline-flex;
  font-weight: var(--sf-font-weight-bold);
  gap: var(--sf-space-2);
  justify-content: center;
  letter-spacing: 0;
  min-height: var(--sf-density-interactive-target-min);
  padding: 0 var(--sf-space-4);
  transition: background var(--sf-motion-fast), border-color var(--sf-motion-fast), color var(--sf-motion-fast), box-shadow var(--sf-motion-fast);
}

.sf-button:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.sf-button-primary {
  background: var(--sf-color-primary);
  border: 1px solid transparent;
  color: white;
}

.sf-button-secondary {
  background: var(--sf-color-surface);
  border: 1px solid var(--sf-color-border);
  color: var(--sf-color-primary);
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

.sf-table-wrap {
  border: 1px solid var(--sf-color-border);
  border-radius: var(--sf-radius-lg);
  overflow-x: auto;
}

.sf-table {
  border-collapse: collapse;
  font-size: var(--sf-font-size-md);
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
  padding: var(--sf-density-table-cell-block) var(--sf-density-table-cell-inline);
  vertical-align: top;
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
`;
}

export const solverFinDesignSystemCss = createSolverFinDesignSystemCss();
