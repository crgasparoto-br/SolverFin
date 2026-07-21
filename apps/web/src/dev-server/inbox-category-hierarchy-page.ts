import { apiGet } from "./api.js";
import {
  enhanceInboxCategoryHierarchy,
  type CategoryRecord,
} from "./inbox-category-hierarchy-enhancement.js";
import { renderInboxPage } from "./inbox-page.js";

export async function renderInboxPageWithCategoryHierarchy(token: string): Promise<string> {
  const [html, categories] = await Promise.all([
    renderInboxPage(token),
    apiGet<{ categories: CategoryRecord[] }>(token, "/api/categories?status=all"),
  ]);

  if (!categories.ok) return html;
  return enhanceInboxCategoryHierarchy(html, categories.data.categories);
}
