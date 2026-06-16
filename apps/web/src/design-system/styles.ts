import { solverFinDesignTokens } from "./tokens.js";

function buildCssVariables(): string {
  const colorVariables = Object.entries(solverFinDesignTokens.colors)
    .map(([name, value]) => `  --sf-color-${toKebabCase(name)}: ${value};`)
    .join("\n");
  const spacingVariables = Object.entries(solverFinDesignTokens.spacing)
    .map(([name, value]) => `  --sf-space-${name}: ${value};`)
    .join("\n");
  const radiusVariables = Object.entries(solverFinDesignTokens.radii)
    .map(([name, value]) => `  --sf-radius-${name}: ${value};`)
    .join("\n");
  const shadowVariables = Object.entries(solverFinDesignTokens.shadows)
    .map(([name, value]) => `  --sf-shadow-${toKebabCase(name)}: ${value};`)
    .join("\n");
  const motionVariables = Object.entries(solverFinDesignTokens.motion)
    .map(([name, value]) => `  --sf-motion-${name}: ${value};`)
    .join("\n");

  return [colorVariables, spacingVariables, radiusVariables, shadowVariables, motionVariables].join(
    "\n",
  );
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export const solverFinDesignSystemCss = `
:root {
${buildCssVariables()}
  --sf-font-family: ${solverFinDesignTokens.typography.fontFamily};
}

.sf-app-surface {
  background: var(--sf-color-background);
  color: var(--sf-color-text);
  font-family: var(--sf-font-family);
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
  font-weight: 700;
  gap: var(--sf-space-2);
  justify-content: center;
  letter-spacing: 0;
  min-height: 2.5rem;
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
  gap: 0.375rem;
}

.sf-label {
  color: var(--sf-color-text);
  font-size: 0.875rem;
  font-weight: 700;
}

.sf-control {
  background: var(--sf-color-surface);
  border: 1px solid var(--sf-color-border);
  border-radius: var(--sf-radius-md);
  color: var(--sf-color-text);
  min-height: 2.75rem;
  padding: 0 0.875rem;
  transition: border-color var(--sf-motion-fast), box-shadow var(--sf-motion-fast);
}

.sf-control[aria-invalid="true"] {
  border-color: var(--sf-color-danger);
}

.sf-help-text {
  color: var(--sf-color-muted-text);
  font-size: 0.75rem;
}

.sf-table-wrap {
  border: 1px solid var(--sf-color-border);
  border-radius: var(--sf-radius-lg);
  overflow-x: auto;
}

.sf-table {
  border-collapse: collapse;
  font-size: 0.875rem;
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
  padding: 0.75rem 1rem;
  vertical-align: top;
}

.sf-empty-state {
  display: grid;
  gap: var(--sf-space-3);
  justify-items: center;
  padding: var(--sf-space-8);
  text-align: center;
}
`;
