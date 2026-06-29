import { apiGet } from "./api.js";
import { renderCardsPage } from "./cards-page.js";

interface CategoryRecord {
  id: string;
  name: string;
  parentCategoryId?: string;
}

export async function renderEnhancedCardsPage(token: string): Promise<string> {
  const [html, categories] = await Promise.all([
    renderCardsPage(token),
    apiGet<{ categories: CategoryRecord[] }>(token, "/api/categories?kind=expense"),
  ]);

  const categoryItems = categories.ok ? categories.data.categories : [];

  return injectCardPurchaseInstallments(applyHierarchicalCategoryOptions(html, categoryItems));
}

function applyHierarchicalCategoryOptions(html: string, categories: CategoryRecord[]): string {
  if (categories.length === 0) {
    return html;
  }

  const options = renderCategoryOptions(categories);

  return html.replace(
    /<select name="categoryId"><option value="">Sem categoria<\/option>[\s\S]*?<\/select>/g,
    `<select name="categoryId"><option value="">Sem categoria</option>${options}</select>`,
  );
}

function renderCategoryOptions(categories: CategoryRecord[]): string {
  return categories
    .slice()
    .sort((left, right) =>
      getCategoryDisplayName(left, categories).localeCompare(getCategoryDisplayName(right, categories)),
    )
    .map(
      (category) =>
        `<option value="${escapeHtml(category.id)}">${escapeHtml(getCategoryDisplayName(category, categories))}</option>`,
    )
    .join("");
}

function injectCardPurchaseInstallments(html: string): string {
  const enhancedHtml = html.replace(
    /<form data-api-form data-api-path="(\/api\/cards\/[^"]+\/purchases)" class="compact-form">([\s\S]*?)<button type="submit">Registrar compra<\/button>\s*<\/form>/g,
    (_match, path: string, fields: string) => `
    <form data-card-purchase-form data-api-path="${path}" class="compact-form">
      ${fields}
      <label>Repetição
        <select name="repeatMode">
          <option value="single">Compra única</option>
          <option value="installment">Parcelado</option>
        </select>
      </label>
      <label>Parcela inicial<input name="firstInstallment" type="number" min="1" max="60" value="1" /></label>
      <label>Número de parcelas<input name="installments" type="number" min="2" max="60" value="2" /></label>
      <label>Frequência
        <select name="frequency">
          <option value="monthly">Mensal</option>
          <option value="weekly">Semanal</option>
          <option value="yearly">Anual</option>
        </select>
      </label>
      <button type="submit">Registrar compra</button>
    </form>`,
  );

  return enhancedHtml.replace("</body>", `${cardPurchaseInstallmentScript()}</body>`);
}

function cardPurchaseInstallmentScript(): string {
  return `
    <script>
      function cardPurchaseMoneyToMinor(value) {
        return Math.round(parseFloat(String(value).replace(",", ".")) * 100);
      }

      function addCardPurchasePeriod(dateValue, frequency, index) {
        const date = new Date(dateValue + "T00:00:00Z");
        if (frequency === "weekly") date.setUTCDate(date.getUTCDate() + index * 7);
        else if (frequency === "yearly") date.setUTCFullYear(date.getUTCFullYear() + index);
        else date.setUTCMonth(date.getUTCMonth() + index);
        return date.toISOString().slice(0, 10);
      }

      function buildCardPurchasePayload(form, index, total, firstInstallment) {
        const data = new FormData(form);
        const occurredOn = addCardPurchasePeriod(String(data.get("occurredOn")), String(data.get("frequency") || "monthly"), index);
        const description = String(data.get("description") || "");
        const payload = {
          occurredOn,
          amountMinor: cardPurchaseMoneyToMinor(data.get("amountMinor")),
          description: total > 1 ? description + " " + (firstInstallment + index) + "/" + total : description
        };
        const categoryId = String(data.get("categoryId") || "");
        if (categoryId) payload.categoryId = categoryId;
        return payload;
      }

      async function sendCardPurchase(path, body) {
        return fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      }

      async function cardPurchaseMessage(response) {
        const body = await response.json().catch(() => ({}));
        return response.ok ? "Ação concluída. Atualizando a tela..." : ((body.error && body.error.message) || "Não foi possível concluir a ação.");
      }

      document.querySelectorAll("[data-card-purchase-form]").forEach((form) => {
        const status = document.createElement("p");
        status.className = "form-status muted";
        status.setAttribute("aria-live", "polite");
        form.appendChild(status);

        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const submitButton = form.querySelector('button[type="submit"]');
          const repeatMode = form.repeatMode.value;
          const total = repeatMode === "installment" ? Math.max(2, Number(form.installments.value || 2)) : 1;
          const firstInstallment = repeatMode === "installment" ? Math.max(1, Number(form.firstInstallment.value || 1)) : 1;
          const responses = [];

          if (submitButton) submitButton.disabled = true;
          status.className = "form-status muted";
          status.textContent = "Salvando...";

          for (let index = 0; index < total; index += 1) {
            responses.push(await sendCardPurchase(form.dataset.apiPath, buildCardPurchasePayload(form, index, total, firstInstallment)));
          }

          const response = responses.find((item) => !item.ok) || responses[responses.length - 1];
          status.className = response.ok ? "form-status success" : "form-status error";
          status.textContent = await cardPurchaseMessage(response);
          if (response.ok) {
            window.setTimeout(() => window.location.reload(), 450);
            return;
          }
          if (submitButton) submitButton.disabled = false;
        });
      });
    </script>
  `;
}

function getCategoryDisplayName(category: CategoryRecord, categories: readonly CategoryRecord[]): string {
  const path = [category.name];
  const visitedCategoryIds = new Set<string>([category.id]);
  let parentCategoryId = category.parentCategoryId;

  while (parentCategoryId) {
    if (visitedCategoryIds.has(parentCategoryId)) {
      break;
    }

    const parentCategory = categories.find((candidate) => candidate.id === parentCategoryId);

    if (!parentCategory) {
      break;
    }

    path.unshift(parentCategory.name);
    visitedCategoryIds.add(parentCategory.id);
    parentCategoryId = parentCategory.parentCategoryId;
  }

  return path.join(" > ");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
