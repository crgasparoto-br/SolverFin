import {
  renderDetailLayout,
  renderFilterBar,
  renderPageContainer,
  renderPageHeader,
} from "../design-system/primitives.js";
import { enhanceInboxOfxImport } from "./inbox-ofx-import-enhancement.js";

export interface CategoryRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
  parentCategoryId?: string | null;
}

export interface InboxCategoryChoice extends CategoryRecord {
  path: string;
  selectable: boolean;
  hierarchyState: "valid" | "missing_parent" | "cycle";
}

export interface InboxCategorySelection {
  categoryId: string | undefined;
  removedBecauseIncompatible: boolean;
  unavailable: boolean;
}

const CATEGORY_PATH_SEPARATOR = " › ";
const MISSING_PARENT_LABEL = "Sem grupo";
const INVALID_HIERARCHY_LABEL = "Hierarquia inválida";

export function buildInboxCategoryChoices(
  categories: readonly CategoryRecord[],
): InboxCategoryChoice[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const hierarchyById = new Map(
    categories.map((category) => [category.id, resolveCategoryPath(category, categoryById)]),
  );
  const childrenByParentId = new Map<string, CategoryRecord[]>();

  for (const category of categories) {
    if (!category.parentCategoryId || !categoryById.has(category.parentCategoryId)) continue;
    const children = childrenByParentId.get(category.parentCategoryId) ?? [];
    children.push(category);
    childrenByParentId.set(category.parentCategoryId, children);
  }

  const compareCategories = (left: CategoryRecord, right: CategoryRecord): number =>
    left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" }) ||
    left.id.localeCompare(right.id);
  for (const children of childrenByParentId.values()) children.sort(compareCategories);

  const rootCategories = categories
    .filter((category) => {
      const hierarchy = hierarchyById.get(category.id);
      return (
        !category.parentCategoryId ||
        !categoryById.has(category.parentCategoryId) ||
        hierarchy?.hierarchyState === "cycle"
      );
    })
    .sort(compareCategories);

  const ordered: CategoryRecord[] = [];
  const visited = new Set<string>();
  const appendCategory = (category: CategoryRecord): void => {
    if (visited.has(category.id)) return;
    visited.add(category.id);
    ordered.push(category);
    for (const child of childrenByParentId.get(category.id) ?? []) appendCategory(child);
  };

  for (const root of rootCategories) appendCategory(root);
  for (const category of [...categories].sort((left, right) => {
    const leftPath = hierarchyById.get(left.id)?.path ?? left.name;
    const rightPath = hierarchyById.get(right.id)?.path ?? right.name;
    return (
      leftPath.localeCompare(rightPath, "pt-BR", { sensitivity: "base" }) ||
      compareCategories(left, right)
    );
  })) {
    appendCategory(category);
  }

  return ordered.map((category) => {
    const hierarchy = hierarchyById.get(category.id) ?? {
      path: category.name,
      hierarchyState: "valid" as const,
    };
    return {
      ...category,
      path: hierarchy.path,
      hierarchyState: hierarchy.hierarchyState,
      selectable:
        category.status === "active" &&
        (category.kind === "income" || category.kind === "expense" || category.kind === "transfer"),
    };
  });
}

export function resolveInboxCategorySelection(
  choices: readonly InboxCategoryChoice[],
  categoryId: string | undefined,
  kind: string,
): InboxCategorySelection {
  if (!categoryId) {
    return { categoryId: undefined, removedBecauseIncompatible: false, unavailable: false };
  }

  const category = choices.find((choice) => choice.id === categoryId);
  if (!category) {
    return { categoryId, removedBecauseIncompatible: false, unavailable: true };
  }
  if (!category.selectable) {
    return { categoryId, removedBecauseIncompatible: false, unavailable: true };
  }
  if (category.kind !== kind) {
    return { categoryId: undefined, removedBecauseIncompatible: true, unavailable: false };
  }

  return { categoryId, removedBecauseIncompatible: false, unavailable: false };
}

export function enhanceInboxReviewArchetype(html: string): string {
  if (html.includes("data-inbox-review-archetype")) return html;

  const headingPattern =
    /<section class="page-heading">[\s\S]*?<div class="heading-actions">([\s\S]*?)<\/div>\s*<\/section>/;
  const headingMatch = html.match(headingPattern);
  if (!headingMatch) return html;

  const importPattern =
    /<section class="panel import-workspace" aria-labelledby="csv-import-title">[\s\S]*?<\/section>/;
  const suggestionsPattern =
    /<section class="panel list-panel">\s*<div class="section-heading">\s*<h2>Outras sugestões<\/h2>[\s\S]*?<\/section>/;
  const messagesPattern =
    /<section class="panel list-panel">\s*<div class="section-heading">\s*<h2>Mensagens recebidas<\/h2>[\s\S]*?<\/section>/;

  const importMatch = html.match(importPattern);
  const suggestionsMatch = html.match(suggestionsPattern);
  const messagesMatch = html.match(messagesPattern);
  if (!importMatch || !suggestionsMatch || !messagesMatch) return html;

  const headerHtml = renderPageHeader({
    eyebrow: "Entradas e revisão",
    title: "Inbox",
    description:
      "Revise mensagens, sugestões e importações com evidência antes de confirmar qualquer efeito financeiro.",
    actionsHtml: headingMatch[1]?.trim() ?? "",
  });
  const filterBarHtml = renderFilterBar({
    label: "Navegação da triagem",
    childrenHtml: `
      <a class="secondary-button inbox-review-nav" href="#inbox-review-queue">Fila de revisão</a>
      <a class="secondary-button inbox-review-nav" href="#csv-import-title">Evidência da importação</a>
      <span class="muted small-note" role="status">Decisões continuam explícitas e dependem da evidência atual.</span>
    `,
  });

  const suggestionsHtml = suggestionsMatch[0]
    .replace(
      'class="panel list-panel"',
      'class="inbox-review-group" aria-labelledby="inbox-review-suggestions-title"',
    )
    .replace(
      "<h2>Outras sugestões</h2>",
      '<h2 id="inbox-review-suggestions-title">Outras sugestões</h2>',
    );
  const messagesHtml = messagesMatch[0]
    .replace(
      'class="panel list-panel"',
      'class="inbox-review-group" aria-labelledby="inbox-review-messages-title"',
    )
    .replace(
      "<h2>Mensagens recebidas</h2>",
      '<h2 id="inbox-review-messages-title">Mensagens recebidas</h2>',
    );
  const evidenceHtml = importMatch[0].replace(
    'class="panel import-workspace"',
    'class="inbox-review-evidence" data-inbox-review-evidence',
  );

  const reviewLayoutHtml = renderDetailLayout({
    masterHtml: `
      <section id="inbox-review-queue" class="inbox-review-queue" aria-labelledby="inbox-review-queue-title">
        <div class="inbox-review-queue-heading">
          <div>
            <p class="eyebrow">Triagem</p>
            <h2 id="inbox-review-queue-title">Fila de revisão</h2>
          </div>
          <p class="muted small-note">Origem, estado e confiança permanecem visíveis em cada item.</p>
        </div>
        ${suggestionsHtml}
        ${messagesHtml}
      </section>
    `,
    detailHtml: `
      <section class="inbox-review-detail" aria-labelledby="inbox-review-detail-title">
        <div class="inbox-review-detail-heading">
          <div>
            <p class="eyebrow">Evidência e decisão</p>
            <h2 id="inbox-review-detail-title">Item em revisão</h2>
          </div>
          <p class="muted small-note">Selecione um lote ou item e confirme somente depois de revisar a evidência.</p>
        </div>
        ${evidenceHtml}
      </section>
    `,
  });

  const cockpitHtml = renderPageContainer({
    className: "inbox-review-cockpit",
    childrenHtml: `${filterBarHtml}${reviewLayoutHtml}`,
  });

  let enhanced = html.replace(importMatch[0], "");
  enhanced = enhanced.replace(suggestionsMatch[0], "");
  enhanced = enhanced.replace(messagesMatch[0], "");
  enhanced = enhanced.replace(headingPattern, `${headerHtml}${cockpitHtml}`);
  enhanced = enhanced.replace(
    "<main",
    '<main data-inbox-review-archetype="A6"',
  );
  enhanced = enhanced.replace(
    "</style>",
    `
      .inbox-review-cockpit { display: grid; gap: 12px; max-width: none; padding: 0; }
      .inbox-review-cockpit .sf-filter-bar { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; }
      .inbox-review-nav { text-decoration: none; }
      .inbox-review-cockpit .sf-detail-layout { align-items: start; display: grid; gap: 14px; grid-template-columns: minmax(300px, .72fr) minmax(0, 1.28fr); }
      .inbox-review-queue, .inbox-review-detail, .inbox-review-group, .inbox-review-evidence { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); min-width: 0; }
      .inbox-review-queue, .inbox-review-detail { display: grid; gap: 12px; padding: 12px; }
      .inbox-review-group { padding: 10px; }
      .inbox-review-group + .inbox-review-group { margin-top: 2px; }
      .inbox-review-evidence { padding: 10px; }
      .inbox-review-queue-heading, .inbox-review-detail-heading { align-items: start; display: flex; gap: 12px; justify-content: space-between; }
      .inbox-review-queue-heading > div, .inbox-review-detail-heading > div { display: grid; gap: 3px; }
      .inbox-review-detail { position: sticky; top: 12px; }
      @media (max-width: 900px) {
        .inbox-review-cockpit .sf-detail-layout { grid-template-columns: 1fr; }
        .inbox-review-detail { position: static; }
      }
      @media (max-width: 600px) {
        .inbox-review-queue, .inbox-review-detail { padding: 9px; }
        .inbox-review-queue-heading, .inbox-review-detail-heading { display: grid; }
        .inbox-review-cockpit .sf-filter-bar { align-items: stretch; display: grid; }
        .inbox-review-nav { justify-content: center; width: 100%; }
      }
    </style>`,
  );

  return enhanced;
}

export function enhanceInboxCategoryHierarchy(
  html: string,
  categories: readonly CategoryRecord[],
): string {
  const ofxEnhanced = enhanceInboxOfxImport(html);
  if (!ofxEnhanced.includes('id="csv-line-edit-dialog"')) {
    return enhanceInboxReviewArchetype(ofxEnhanced);
  }
  if (ofxEnhanced.includes("data-inbox-category-hierarchy-enhanced")) {
    return enhanceInboxReviewArchetype(ofxEnhanced);
  }

  const choices = buildInboxCategoryChoices(categories);
  const choicesJson = JSON.stringify(choices).replace(/</g, "\\u003c");
  const selectionResolverSource = resolveInboxCategorySelection.toString();
  const categoryOptionsPattern =
    / {8}function categoryOptions\(payload\) \{[\s\S]*?\n {8}\}\n {8}function accountOptions\(payload\) \{/;
  const categoryOptionsReplacement = `        const inboxCategoryChoices = ${choicesJson};
        const inboxCategoryById = new Map(inboxCategoryChoices.map((category) => [category.id, category]));
        const resolveInboxCategorySelection = ${selectionResolverSource};
        function categoryOptions(payload) {
          const selectedId = payload.categoryId || "";
          const compatible = inboxCategoryChoices.filter((category) => category.selectable && category.kind === payload.kind);
          const selectedAvailable = !selectedId || compatible.some((category) => category.id === selectedId);
          const options = '<option value="">Sem categoria</option>' + compatible.map((category) =>
            '<option value="' + escapeHtml(category.id) + '" ' + (selectedId === category.id ? "selected" : "") + '>' + escapeHtml(category.path) + '</option>'
          ).join("");
          if (!selectedId || selectedAvailable) return options;
          const selected = inboxCategoryById.get(selectedId);
          const label = selected ? selected.path + " (indisponível)" : "Categoria indisponível";
          return options + '<option value="' + escapeHtml(selectedId) + '" selected disabled>' + escapeHtml(label) + '</option>';
        }
        function accountOptions(payload) {`;

  const statusAnchor =
    '          setStatus(lineEditStatus, "Revise os campos e salve para executar uma nova análise de duplicidade.", "muted");';
  const statusReplacement = `          const selectedCategory = payload.categoryId ? inboxCategoryById.get(payload.categoryId) : undefined;
          const selectedCategoryAvailable = !payload.categoryId || Boolean(selectedCategory && selectedCategory.selectable && selectedCategory.kind === payload.kind);
          lineEditForm.elements.categoryId.setCustomValidity(selectedCategoryAvailable ? "" : "Escolha uma categoria disponível ou Sem categoria.");
          setStatus(
            lineEditStatus,
            selectedCategoryAvailable
              ? "Revise os campos e salve para executar uma nova análise de duplicidade."
              : "A categoria atual não está disponível. Escolha outra categoria ou Sem categoria antes de salvar.",
            selectedCategoryAvailable ? "muted" : "warning"
          );`;

  const kindListenerPattern =
    / {8}lineEditForm\.elements\.kind\.addEventListener\("change", \(\) => \{[\s\S]*?\n {8}\}\);/;
  const kindListenerReplacement = `        lineEditForm.elements.kind.addEventListener("change", () => {
          const categorySelect = lineEditForm.elements.categoryId;
          const previousCategoryId = categorySelect.value || undefined;
          const nextKind = lineEditForm.elements.kind.value;
          const selection = resolveInboxCategorySelection(inboxCategoryChoices, previousCategoryId, nextKind);
          const categoryIdToPreserve = selection.unavailable ? undefined : selection.categoryId;
          categorySelect.innerHTML = categoryOptions({ kind: nextKind, categoryId: categoryIdToPreserve });
          categorySelect.value = categoryIdToPreserve || "";
          categorySelect.setCustomValidity("");
          refreshLineEditTransferFields({ kind: nextKind, categoryId: categoryIdToPreserve });
          setStatus(
            lineEditStatus,
            selection.removedBecauseIncompatible || selection.unavailable
              ? "A categoria foi removida porque não é compatível ou não está disponível para o novo tipo. Escolha outra ou mantenha Sem categoria."
              : "Revise os campos e salve para executar uma nova análise de duplicidade.",
            selection.removedBecauseIncompatible || selection.unavailable ? "warning" : "muted"
          );
        });
        lineEditForm.elements.categoryId.addEventListener("change", () => {
          lineEditForm.elements.categoryId.setCustomValidity("");
          setStatus(lineEditStatus, "Revise os campos e salve para executar uma nova análise de duplicidade.", "muted");
        });`;

  let enhanced = ofxEnhanced.replace(categoryOptionsPattern, categoryOptionsReplacement);
  if (enhanced === ofxEnhanced) return enhanceInboxReviewArchetype(ofxEnhanced);

  const withStatus = enhanced.replace(statusAnchor, statusReplacement);
  if (withStatus === enhanced) return enhanceInboxReviewArchetype(ofxEnhanced);
  enhanced = withStatus;

  const withKindListener = enhanced.replace(kindListenerPattern, kindListenerReplacement);
  if (withKindListener === enhanced) return enhanceInboxReviewArchetype(ofxEnhanced);
  enhanced = withKindListener;

  enhanced = enhanced.replace("<main", "<main data-inbox-category-hierarchy-enhanced");
  enhanced = enhanced.replace(
    "</style>",
    `
      .line-edit-dialog select[name="categoryId"] { max-width: 100%; min-width: 0; text-overflow: ellipsis; }
    </style>`,
  );

  return enhanceInboxReviewArchetype(enhanced);
}

function resolveCategoryPath(
  category: CategoryRecord,
  categoryById: ReadonlyMap<string, CategoryRecord>,
): { path: string; hierarchyState: InboxCategoryChoice["hierarchyState"] } {
  const segments = [category.name];
  const visited = new Set<string>([category.id]);
  let parentCategoryId = category.parentCategoryId;

  while (parentCategoryId) {
    if (visited.has(parentCategoryId)) {
      return {
        path: [INVALID_HIERARCHY_LABEL, ...segments].join(CATEGORY_PATH_SEPARATOR),
        hierarchyState: "cycle",
      };
    }

    const parent = categoryById.get(parentCategoryId);
    if (!parent) {
      return {
        path: [MISSING_PARENT_LABEL, ...segments].join(CATEGORY_PATH_SEPARATOR),
        hierarchyState: "missing_parent",
      };
    }

    segments.unshift(parent.name);
    visited.add(parent.id);
    parentCategoryId = parent.parentCategoryId;
  }

  return { path: segments.join(CATEGORY_PATH_SEPARATOR), hierarchyState: "valid" };
}
