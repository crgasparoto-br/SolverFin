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
  categoryId?: string;
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
      selectable: category.status === "active",
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

export function enhanceInboxCategoryHierarchy(
  html: string,
  categories: readonly CategoryRecord[],
): string {
  if (!html.includes('id="csv-line-edit-dialog"')) return html;
  if (html.includes("data-inbox-category-hierarchy-enhanced")) return html;

  const choices = buildInboxCategoryChoices(categories);
  const choicesJson = JSON.stringify(choices).replace(/</g, "\\u003c");
  const selectionResolverSource = resolveInboxCategorySelection.toString();
  const categoryOptionsPattern =
    /        function categoryOptions\(payload\) \{[\s\S]*?\n        \}\n        function accountOptions\(payload\) \{/;
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
    /        lineEditForm\.elements\.kind\.addEventListener\("change", \(\) => \{[\s\S]*?\n        \}\);/;
  const kindListenerReplacement = `        lineEditForm.elements.kind.addEventListener("change", () => {
          const categorySelect = lineEditForm.elements.categoryId;
          const previousCategoryId = categorySelect.value || undefined;
          const nextKind = lineEditForm.elements.kind.value;
          const selection = resolveInboxCategorySelection(inboxCategoryChoices, previousCategoryId, nextKind);
          const categoryIdToPreserve = selection.unavailable ? undefined : selection.categoryId;
          categorySelect.innerHTML = categoryOptions({ kind: nextKind, categoryId: categoryIdToPreserve });
          categorySelect.value = categoryIdToPreserve || "";
          categorySelect.setCustomValidity("");
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

  let enhanced = html.replace(categoryOptionsPattern, categoryOptionsReplacement);
  if (enhanced === html) return html;

  const withStatus = enhanced.replace(statusAnchor, statusReplacement);
  if (withStatus === enhanced) return html;
  enhanced = withStatus;

  const withKindListener = enhanced.replace(kindListenerPattern, kindListenerReplacement);
  if (withKindListener === enhanced) return html;
  enhanced = withKindListener;

  enhanced = enhanced.replace("<main>", "<main data-inbox-category-hierarchy-enhanced>");
  enhanced = enhanced.replace(
    "</style>",
    `
      .line-edit-dialog select[name="categoryId"] { max-width: 100%; min-width: 0; text-overflow: ellipsis; }
    </style>`,
  );

  return enhanced;
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
