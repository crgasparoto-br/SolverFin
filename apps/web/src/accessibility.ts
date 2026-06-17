export type UiState = "loading" | "empty" | "ready" | "error";

export interface InteractiveElementCheck {
  id: string;
  role: "button" | "link" | "input" | "select" | "textarea" | "tab";
  accessibleName?: string;
  keyboardReachable: boolean;
  focusVisible: boolean;
  minTouchTargetPx?: number;
}

export interface ViewReadinessCheck {
  state: UiState;
  interactiveElements: readonly InteractiveElementCheck[];
  hasVisibleHeading: boolean;
  hasLoadingFeedback: boolean;
  hasEmptyStateAction: boolean;
  hasErrorRecoveryAction: boolean;
  estimatedListItems?: number;
  virtualizedOrPaginated?: boolean;
}

export interface ViewReadinessResult {
  accessible: boolean;
  performant: boolean;
  issues: readonly string[];
}

const MIN_TOUCH_TARGET_PX = 44;
const LARGE_LIST_THRESHOLD = 100;

export function evaluateViewReadiness(check: ViewReadinessCheck): ViewReadinessResult {
  const issues: string[] = [];

  if (!check.hasVisibleHeading) {
    issues.push("A tela precisa de um titulo visivel para orientar a navegacao.");
  }

  for (const element of check.interactiveElements) {
    if (!element.accessibleName?.trim()) {
      issues.push(`Controle ${element.id} precisa de nome acessivel.`);
    }

    if (!element.keyboardReachable) {
      issues.push(`Controle ${element.id} precisa ser acessivel por teclado.`);
    }

    if (!element.focusVisible) {
      issues.push(`Controle ${element.id} precisa indicar foco visivel.`);
    }

    if ((element.minTouchTargetPx ?? MIN_TOUCH_TARGET_PX) < MIN_TOUCH_TARGET_PX) {
      issues.push(`Controle ${element.id} precisa ter alvo de toque minimo de 44px.`);
    }
  }

  if (check.state === "loading" && !check.hasLoadingFeedback) {
    issues.push("Estado de carregamento precisa ter feedback perceptivel.");
  }

  if (check.state === "empty" && !check.hasEmptyStateAction) {
    issues.push("Estado vazio precisa explicar a proxima acao possivel.");
  }

  if (check.state === "error" && !check.hasErrorRecoveryAction) {
    issues.push("Estado de erro precisa oferecer uma acao de recuperacao.");
  }

  const performant =
    (check.estimatedListItems ?? 0) <= LARGE_LIST_THRESHOLD ||
    check.virtualizedOrPaginated === true;

  if (!performant) {
    issues.push(
      "Listas grandes precisam de paginacao, virtualizacao ou limite inicial documentado.",
    );
  }

  return {
    accessible: issues.length === 0 || issues.every((issue) => issue.startsWith("Listas grandes")),
    performant,
    issues,
  };
}
