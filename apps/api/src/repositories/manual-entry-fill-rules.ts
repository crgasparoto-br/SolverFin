import type { AutomationRule, TenantContext } from "@solverfin/domain";
import { withSharedTransaction } from "../db.js";
import {
  MANUAL_ENTRY_PREFIX,
  AutomationRuleRepositoryError,
  createAutomationRuleForContext,
  listAutomationRulesForContext,
  updateAutomationRuleForContext,
  type AutomationRuleDraft,
} from "./automation-rules.js";

const normalizeManualEntry = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");

export async function upsertManualEntryFillRuleForContext(
  context: TenantContext,
  description: string,
  categoryId: string,
): Promise<AutomationRule> {
  const text = description.trim();
  if (text.length < 2 || text.length > 240) {
    throw new AutomationRuleRepositoryError(
      "MANUAL_FILL_DESCRIPTION_INVALID",
      "Informe uma descrição entre 2 e 240 caracteres.",
    );
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(categoryId)
  ) {
    throw new AutomationRuleRepositoryError("MANUAL_FILL_CATEGORY_INVALID", "Categoria inválida.");
  }
  const normalized = normalizeManualEntry(text);
  const ruleDraft: AutomationRuleDraft = {
    name: MANUAL_ENTRY_PREFIX + text.slice(0, 160 - MANUAL_ENTRY_PREFIX.length),
    status: "inactive",
    conditions: { descriptionIncludes: text },
    actions: { categoryId },
    explanation: "Sugestão manual de descrição e categoria. Nunca aplicar automaticamente.",
  };

  return withSharedTransaction(async (executeQuery) => {
    await executeQuery("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
      "manual-fill:" + context.organizationId + ":" + context.financialProfileId + ":" + normalized,
    ]);
    const categories = await executeQuery<{ id: string }>(
      `select "id" from "Category" where "id" = $1 and "organizationId" = $2
       and "financialProfileId" = $3 and "status" = 'ACTIVE' for update`,
      [categoryId, context.organizationId, context.financialProfileId],
    );
    if (!categories.length) {
      throw new AutomationRuleRepositoryError(
        "MANUAL_FILL_CATEGORY_INVALID",
        "Selecione uma categoria ativa do perfil financeiro.",
      );
    }
    const rules = await listAutomationRulesForContext(context, "inactive");
    const existing = rules.find(
      (rule) =>
        rule.name.startsWith(MANUAL_ENTRY_PREFIX) &&
        normalizeManualEntry(rule.conditions.descriptionIncludes ?? "") === normalized,
    );
    if (existing) {
      return updateAutomationRuleForContext(context, existing.id, ruleDraft);
    }
    return createAutomationRuleForContext(context, ruleDraft);
  });
}
