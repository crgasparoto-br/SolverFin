import { formatDateOnly, formatMinorCurrency } from "@solverfin/shared";

import { apiGet } from "./api.js";
import { attachmentWorkspaceScript, renderAttachmentWorkspace } from "./attachment-workspace.js";
import { findInstitution, renderInstitutionIcon } from "./institutions.js";
import {
  recurrencesSectionScript,
  recurrencesSectionStyles,
  renderRecurrenceActionMenuItems,
  renderRecurrenceEditModal,
  renderRecurrenceIndicator,
  type RecurrenceRecord,
} from "./recurrences-section.js";
import { renderAuthenticatedShellDocument } from "./shell.js";
import { sharedShellStyles } from "./shared-styles.js";
import {
  renderStatementListArchetype,
  statementListArchetypeStyles,
} from "./statement-list-archetype.js";
import { renderStatementStatus } from "./statement-status.js";
import { buildConsolidatedStatement } from "./transactions-consolidated.js";
import {
  buildRows,
  buildTransactionQuery,
  calculateOpeningBalance,
  filterStatementPeriodTransactions,
  isAccountStatementTransaction,
  monthToPeriod,
  projectTransactionGroups,
  resolveFilters,
  statementDate,
  summarize,
  type AccountRecord,
  type StatementRow,
  type StatementSummary,
  type TransactionGroupRecord,
  type TransactionRecord,
} from "./transactions-statement.js";

interface CategoryRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
  parentCategoryId?: string;
}

type StatementSort =
  | "date_asc"
  | "date_desc"
  | "amount_desc"
  | "amount_asc"
  | "description¶»§q«^