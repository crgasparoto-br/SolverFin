export type ComponentTone = "neutral" | "primary" | "success" | "warning" | "danger";
export type ComponentSize = "sm" | "md" | "lg";

export interface ComponentStateStyles {
  base: readonly string[];
  focusVisible: readonly string[];
  disabled: readonly string[];
  error?: readonly string[];
  loading?: readonly string[];
}

export interface ButtonRecipe {
  component: "Button";
  variants: Record<"primary" | "secondary" | "ghost" | "danger", readonly string[]>;
  sizes: Record<ComponentSize, readonly string[]>;
  states: ComponentStateStyles;
  accessibility: readonly string[];
}

export interface FieldRecipe {
  component: "Input" | "Select";
  wrapper: readonly string[];
  control: readonly string[];
  label: readonly string[];
  helpText: readonly string[];
  states: ComponentStateStyles;
  accessibility: readonly string[];
}

export interface DialogRecipe {
  component: "Dialog";
  overlay: readonly string[];
  panel: readonly string[];
  title: readonly string[];
  description: readonly string[];
  actions: readonly string[];
  accessibility: readonly string[];
}

export interface TableRecipe {
  component: "Table";
  wrapper: readonly string[];
  table: readonly string[];
  header: readonly string[];
  row: readonly string[];
  cell: readonly string[];
  empty: readonly string[];
  accessibility: readonly string[];
}

export interface CardRecipe {
  component: "Card";
  container: readonly string[];
  title: readonly string[];
  body: readonly string[];
  usage: readonly string[];
}

export interface EmptyStateRecipe {
  component: "EmptyState";
  container: readonly string[];
  title: readonly string[];
  description: readonly string[];
  actionArea: readonly string[];
}

export interface LoadingRecipe {
  component: "Loading";
  container: readonly string[];
  indicator: readonly string[];
  label: readonly string[];
  accessibility: readonly string[];
}

export interface ToastRecipe {
  component: "Toast";
  container: readonly string[];
  tone: Record<ComponentTone, readonly string[]>;
  title: readonly string[];
  description: readonly string[];
  accessibility: readonly string[];
}

export interface FormPatternRecipe {
  component: "FormPattern";
  layout: readonly string[];
  fieldGroup: readonly string[];
  actions: readonly string[];
  validation: readonly string[];
}

export const buttonRecipe: ButtonRecipe = {
  component: "Button",
  variants: {
    primary: ["background: var(--sf-color-primary)", "color: white", "border: 1px solid transparent"],
    secondary: [
      "background: var(--sf-color-surface)",
      "color: var(--sf-color-primary)",
      "border: 1px solid var(--sf-color-border)",
    ],
    ghost: ["background: transparent", "color: var(--sf-color-primary)", "border: 1px solid transparent"],
    danger: ["background: var(--sf-color-danger)", "color: white", "border: 1px solid transparent"],
  },
  sizes: {
    sm: ["min-height: 2rem", "padding: 0 0.75rem", "font-size: 0.875rem"],
    md: ["min-height: 2.5rem", "padding: 0 1rem", "font-size: 1rem"],
    lg: ["min-height: 3rem", "padding: 0 1.25rem", "font-size: 1rem"],
  },
  states: {
    base: ["display: inline-flex", "align-items: center", "justify-content: center", "gap: 0.5rem"],
    focusVisible: ["outline: none", "box-shadow: var(--sf-shadow-focus)"],
    disabled: ["opacity: 0.56", "cursor: not-allowed"],
    loading: ["cursor: progress"],
  },
  accessibility: [
    "Icon-only buttons must have an accessible label.",
    "Loading buttons should keep their width stable and expose busy state.",
  ],
};

export const inputRecipe: FieldRecipe = {
  component: "Input",
  wrapper: ["display: grid", "gap: 0.375rem"],
  control: [
    "min-height: 2.75rem",
    "border: 1px solid var(--sf-color-border)",
    "border-radius: var(--sf-radius-md)",
    "background: var(--sf-color-surface)",
    "color: var(--sf-color-text)",
    "padding: 0 0.875rem",
  ],
  label: ["font-size: 0.875rem", "font-weight: 600", "color: var(--sf-color-text)"],
  helpText: ["font-size: 0.75rem", "color: var(--sf-color-muted-text)"],
  states: {
    base: ["transition: border-color var(--sf-motion-fast), box-shadow var(--sf-motion-fast)"],
    focusVisible: ["outline: none", "border-color: var(--sf-color-accent)", "box-shadow: var(--sf-shadow-focus)"],
    disabled: ["background: var(--sf-color-background)", "cursor: not-allowed", "opacity: 0.7"],
    error: ["border-color: var(--sf-color-danger)"],
  },
  accessibility: ["Inputs need visible labels.", "Error text must be associated with the field."],
};

export const selectRecipe: FieldRecipe = {
  ...inputRecipe,
  component: "Select",
};

export const dialogRecipe: DialogRecipe = {
  component: "Dialog",
  overlay: ["position: fixed", "inset: 0", "background: rgba(6, 25, 35, 0.52)"],
  panel: [
    "width: min(100% - 2rem, 32rem)",
    "border-radius: var(--sf-radius-lg)",
    "background: var(--sf-color-surface)",
    "box-shadow: var(--sf-shadow-dialog)",
    "padding: 1.5rem",
  ],
  title: ["font-size: 1.25rem", "font-weight: 700", "color: var(--sf-color-text)"],
  description: ["color: var(--sf-color-muted-text)", "line-height: 1.5"],
  actions: ["display: flex", "gap: 0.75rem", "justify-content: flex-end", "flex-wrap: wrap"],
  accessibility: ["Dialog must trap focus while open.", "Escape and close button should dismiss non-blocking dialogs."],
};

export const tableRecipe: TableRecipe = {
  component: "Table",
  wrapper: ["overflow-x: auto", "border: 1px solid var(--sf-color-border)", "border-radius: var(--sf-radius-lg)"],
  table: ["width: 100%", "border-collapse: collapse", "font-size: 0.875rem"],
  header: ["background: var(--sf-color-background)", "color: var(--sf-color-muted-text)", "text-align: left"],
  row: ["border-top: 1px solid var(--sf-color-border)"],
  cell: ["padding: 0.75rem 1rem", "vertical-align: top"],
  empty: ["padding: 2rem", "text-align: center", "color: var(--sf-color-muted-text)"],
  accessibility: ["Use table markup for tabular data.", "Empty tables must explain what can be added or reviewed."],
};

export const cardRecipe: CardRecipe = {
  component: "Card",
  container: ["border: 1px solid var(--sf-color-border)", "border-radius: var(--sf-radius-lg)", "padding: 1rem"],
  title: ["font-weight: 700", "color: var(--sf-color-text)"],
  body: ["color: var(--sf-color-muted-text)", "line-height: 1.5"],
  usage: ["Use cards for repeated items, modals or framed tools only.", "Avoid nesting cards."],
};

export const emptyStateRecipe: EmptyStateRecipe = {
  component: "EmptyState",
  container: ["display: grid", "gap: 0.75rem", "place-items: center", "padding: 2rem", "text-align: center"],
  title: ["font-size: 1rem", "font-weight: 700", "color: var(--sf-color-text)"],
  description: ["max-width: 28rem", "color: var(--sf-color-muted-text)"],
  actionArea: ["display: flex", "gap: 0.75rem", "flex-wrap: wrap", "justify-content: center"],
};

export const loadingRecipe: LoadingRecipe = {
  component: "Loading",
  container: ["display: inline-flex", "align-items: center", "gap: 0.5rem", "color: var(--sf-color-muted-text)"],
  indicator: ["width: 1rem", "height: 1rem", "border-radius: 999px", "border: 2px solid currentColor"],
  label: ["font-size: 0.875rem"],
  accessibility: ["Loading regions should expose polite status text when content is changing."],
};

export const toastRecipe: ToastRecipe = {
  component: "Toast",
  container: [
    "border-radius: var(--sf-radius-lg)",
    "background: var(--sf-color-surface)",
    "box-shadow: var(--sf-shadow-toast)",
    "padding: 1rem",
  ],
  tone: {
    neutral: ["border-left: 4px solid var(--sf-color-primary)"],
    primary: ["border-left: 4px solid var(--sf-color-accent)"],
    success: ["border-left: 4px solid var(--sf-color-secondary)"],
    warning: ["border-left: 4px solid var(--sf-color-warning)"],
    danger: ["border-left: 4px solid var(--sf-color-danger)"],
  },
  title: ["font-weight: 700", "color: var(--sf-color-text)"],
  description: ["color: var(--sf-color-muted-text)", "font-size: 0.875rem"],
  accessibility: ["Use polite announcements for confirmations and assertive announcements for blocking errors."],
};

export const formPatternRecipe: FormPatternRecipe = {
  component: "FormPattern",
  layout: ["display: grid", "gap: 1rem"],
  fieldGroup: ["display: grid", "gap: 0.75rem"],
  actions: ["display: flex", "gap: 0.75rem", "justify-content: flex-end", "flex-wrap: wrap"],
  validation: ["Show errors close to the field.", "Keep submit errors above actions and written for end users."],
};

export const solverFinComponentRecipes = {
  button: buttonRecipe,
  input: inputRecipe,
  select: selectRecipe,
  dialog: dialogRecipe,
  table: tableRecipe,
  card: cardRecipe,
  emptyState: emptyStateRecipe,
  loading: loadingRecipe,
  toast: toastRecipe,
  formPattern: formPatternRecipe,
} as const;

export type SolverFinComponentRecipes = typeof solverFinComponentRecipes;
