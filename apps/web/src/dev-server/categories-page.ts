import {
  renderPageContainer,
  renderPageHeader,
  renderRecoverableError,
} from "../design-system/primitives.js";
import { apiGet } from "./api.js";
import { icon } from "./icons.js";
import { sharedShellStyles } from "./shared-styles.js";
import { renderAuthenticatedShellDocument } from "./shell.js";
import { getSecondaryRoutePageViewModel } from "./secondary-routes-view-model.js";

interface CategoryRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
  parentCategoryId?: string;
}

const categoriesPageModel = getSecondaryRoutePageViewModel("categories");

interface CategorySummary {
  total: number;
  active: number;
  archived: number;
  roots: number;
  children: number;
  expense: number;
  income: number;
  transfer: number;
}

export async function renderCategoriesPage(token: string): Promise<string> {
  const categories = await apiGet<{ categories: CategoryRecord[] }>(
    token,
    "/api/categories?status=all",
  );

  if (!categories.ok) {
    return renderShell(
      "Categorias",
      renderRecoverableError({
        title: "Não foi possível carregar as categorias",
        description: categories.error,
        actionHtml: '<a class="sf-button" href="/categorias">Tentar novamente</a>',
      }),
    );
  }

  const categoryItems = categories.data.categories;
  const summary = summarizeCategories(categoryItems);

  return renderShell(
    "Categorias",
    `
        ${renderPageHeader({
          eyebrow: categoriesPageModel.eyebrow,
          title: categoriesPageModel.title,
          description: categoriesPageModel.description,
          actionsHtml: `<button class="sf-button" type="button" data-open-category-modal title="Criar nova categoria">${icon("plus", 14)} Nova categoria</button>`,
        })}
        <dl class="category-overview" aria-label="Resumo das categorias">
          <div><dt>Total de categorias</dt><dd>${summary.total}</dd></div>
          <div><dt>Ativas</dt><dd>${summary.active}</dd></div>
          <di...[truncated]