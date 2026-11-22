/** Accessible SSR-only components shared by the automatic-rules surface. */
export function renderRuleFilters(
  automationRules: ReadonlyArray<{ status: string }>,
  filter: "todas" | "ativas" | "inativas",
  settingsPath: string,
): string {
  const activeCount = automationRules.filter((rule) => rule.status === "active").length;
  const inactiveCount = automationRules.filter((rule) => rule.status === "inactive").length;
  const filters = [
    { value: "todas", label: "Todas", count: automationRules.length },
    { value: "ativas", label: "Ativas", count: activeCount },
    { value: "inativas", label: "Inativas", count: inactiveCount },
  ] as const;
  return `
            <nav class="settings-rule-filters" aria-label="Filtrar regras por situação">
              ${filters
                .map(
                  (item) =>
                    `<a class="settings-rule-filter sf-focus-ring" href="${settingsPath}?section=rules${item.value === "todas" ? "" : "&amp;filter=" + item.value}"${item.value === filter ? ' aria-current="page"' : ""}>${item.label} <span>${item.count}</span></a>`,
                )
                .join("")}
            </nav>
            <p class="settings-rule-filter-hint">O filtro organiza apenas a lista. Aplicar regras considera as regras ativas, independentemente do filtro.</p>
  `;
}

interface RuleFields {
  amountMinField: string;
  amountMaxField: string;
  accountField: string;
  categoryField: string;
}

export function renderAutomationRuleFields({
  amountMinField,
  amountMaxField,
  accountField,
  categoryField,
}: RuleFields): string {
  return `
        <fieldset class="settings-rule-fieldset">
          <legend>Identificação</legend>
          <div class="settings-rule-fields">
            <label>Nome<input name="name" required autofocus placeholder="Ex.: Mercado vira Alimentação" /></label>
            <label>Prioridade<input name="priority" type="number" value="100" /></label>
          </div>
        </fieldset>
        <fieldset class="settings-rule-fieldset">
          <legend>Quando aplicar</legend>
          <div class="settings-rule-fields">
            <label class="full-span">Descrição contém<input name="descriptionIncludes" placeholder="Ex.: mercado" /></label>
            <label>Tipo
              <select name="kind">
                <option value="">Qualquer</option>
                <option value="expense">Despesa</option>
                <option value="income">Receita</option>
                <option value="transfer">Transferência</option>
              </select>
            </label>
            ${amountMinField}
            ${amountMaxField}
          </div>
        </fieldset>
        <fieldset class="settings-rule-fieldset">
          <legend>O que sugerir</legend>
          <div class="settings-rule-fields">
            ${accountField}
            ${categoryField}
            <label>Status sugerido
              <select name="actionStatus">
                <option value="">Não alterar</option>
                <option value="suggested">Sugerido</option>
                <option value="planned">Planejado</option>
                <option value="posted">Realizado</option>
              </select>
            </label>
            <label class="full-span">Explicação opcional<input name="explanation" placeholder="Ex.: Compras com este texto costumam ser alimentação." /></label>
          </div>
        </fieldset>
  `;
}
