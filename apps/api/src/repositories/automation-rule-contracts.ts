import type {
  AutomationRuleActions,
  AutomationRuleConditions,
  AutomationRulePurpose,
  EntityId,
} from "@solverfin/domain";

export interface AutomationRuleDraft {
  name: string;
  priority?: number | undefined;
  /** Inactive entries are reusable form suggestions, not background automations. */
  status?: "active" | "inactive";
  purpose?: AutomationRulePurpose;
  conditions: AutomationRuleConditions;
  actions: AutomationRuleActions;
  explanation?: string | undefined;
}

export interface AutomationRuleInput {
  id: EntityId;
  name: string;
  purpose: AutomationRulePurpose;
  status: "active" | "inactive";
  priority: number;
  conditions: AutomationRuleConditions;
  actions: AutomationRuleActions;
  explanation?: string | undefined;
  createdAt: string;
  updatedAt: string;
  createdByUserId?: EntityId | undefined;
  updatedByUserId?: EntityId | undefined;
}

