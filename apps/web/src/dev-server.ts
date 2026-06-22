import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { buildSolverFinWebManifest } from "./pwa/manifest.js";
import { enhanceAccountsCardsTabs } from "./dev-server/accounts-cards-enhancement.js";
import { renderAccountsCardsPage } from "./dev-server/accounts-cards-page.js";
import { handleApiRequest } from "./dev-server/api.js";
import { renderCardsPage } from "./dev-server/cards-page.js";
import { sendHtml, sendJson } from "./dev-server/http.js";
import { renderInboxPage } from "./dev-server/inbox-page.js";
import { renderLoginPage } from "./dev-server/login-page.js";
import { renderNotFoundPage, renderPrivatePage } from "./dev-server/pages.js";
import { renderPayablesReceivablesPage } from "./dev-server/payables-receivables-page.js";
import { renderRecurrencesPage } from "./dev-server/recurrences-page.js";
import { resolveRoute } from "./dev-server/routes.js";
import { getSessionTokenFromRequest } from "./dev-server/session.js";
import { renderSettingsPage } from "./dev-server/settings-page.js";

export { enhanceAccountsCardsTabs } from "./dev-server/accounts-cards-enhancement.js";
export { renderAccountsCardsPage } from "./dev-server/accounts-cards-page.js";
export {
  renderAccountsPage,
  renderBudgetsPage,
  renderCategoriesPage,
  renderDashboardPage,
  renderTransactionsPage,
} from "./dev-server/pages.js";
export { renderCardsPage } from "./dev-server/cards-page.js";
export { renderInboxPage } from "./dev-server/inbox-page.js";
export { renderLoginPage } from "./dev-server/login-page.js";
export { renderPayablesReceivablesPage } from "./dev-server/payables-receivables-page.js";
export { renderRecurrencesPage } from "./dev-server/recurrences-page.js";
export { resolveRoute } from "./dev-server/routes.js";
export { renderSettingsPage } from "./dev-server/settings-page.js";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 5173);
const manifest = buildSolverFinWebManifest();

const server = createServer((request, response) => {
  void handleRequest(request, response);
});

if (process.argv[1]?.endsWith("dev-server.js") === true) {
  server.listen(port, host, () => {
    console.log(
      `SolverFin web dev server running at http://${host === "0.0.0.0" ? "localhost" : host}:${port}`,
    );
  });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const token = getSessionTokenFromRequest(request);

  if (url.pathname === "/manifest.webmanifest") {
    sendJson(response, 200, manifest, "application/manifest+json; charset=utf-8");
    return;
  }

  if (url.pathname === "/health") {
    sendJson(response, 200, { status: "ok", app: "solverfin-web" });
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    await handleApiRequest(request, response, url, token);
    return;
  }

  const route = resolveRoute(url.pathname, token !== undefined);

  if (route.statusCode === 302 && route.location) {
    response.writeHead(302, { location: route.location });
    response.end();
    return;
  }

  if (route.kind === "login") {
    sendHtml(response, 200, renderLoginPage(url.searchParams.get("erro") ?? undefined));
    return;
  }

  if (url.pathname === "/contas-cartoes" && token) {
    const accountsCardsHtml = await renderAccountsCardsPage(token);
    sendHtml(response, 200, enhanceAccountsCardsTabs(stabilizeAccountsCardsAdditionalForms(accountsCardsHtml)));
    return;
  }

  if (url.pathname === "/cartoes" && token) {
    sendHtml(response, 200, await renderCardsPage(token));
    return;
  }

  if (url.pathname === "/pagar-receber" && token) {
    sendHtml(response, 200, await renderPayablesReceivablesPage(token));
    return;
  }

  if (url.pathname === "/recorrencias" && token) {
    sendHtml(response, 200, await renderRecurrencesPage(token));
    return;
  }

  if (url.pathname === "/inbox" && token) {
    sendHtml(response, 200, await renderInboxPage(token));
    return;
  }

  if (url.pathname === "/configuracoes" && token) {
    sendHtml(response, 200, await renderSettingsPage(token));
    return;
  }

  if ((route.kind === "dashboard" || route.kind === "placeholder") && token) {
    sendHtml(response, 200, await renderPrivatePage(url.pathname, token));
    return;
  }

  sendHtml(response, 404, renderNotFoundPage());
}

function stabilizeAccountsCardsAdditionalForms(html: string): string {
  if (html.includes("data-accounts-cards-additional-stability")) return html;

  const stabilityScript = accountsCardsAdditionalStabilityScript();

  if (html.includes("<body>")) {
    return html.replace("<body>", `<body>${stabilityScript}`);
  }

  return `${stabilityScript}${html}`;
}

function accountsCardsAdditionalStabilityScript(): string {
  return `
      <script data-accounts-cards-additional-stability>
        (() => {
          const cardLinksApiPath = "/api/card-additional-links";
          const nativeAddEventListener = EventTarget.prototype.addEventListener;
          let allCardsCache = [];
          let allLinksCache = [];

          function isEnhancedCardForm(target) {
            if (!(target instanceof HTMLFormElement)) return false;
            const apiPath = String(target.dataset.apiPath || "");
            const apiMethod = String(target.dataset.apiMethod || "POST").toUpperCase();
            return apiPath === "/api/cards" || (apiMethod === "PATCH" && apiPath.indexOf("/api/cards/") === 0);
          }

          EventTarget.prototype.addEventListener = function patchedAddEventListener(type, listener, options) {
            if (type === "submit" && isEnhancedCardForm(this)) return;
            return nativeAddEventListener.call(this, type, listener, options);
          };

          function getEventElement(event) {
            const target = event.target;
            if (target instanceof Element) return target;
            if (target && target.parentElement instanceof Element) return target.parentElement;
            return null;
          }

          function cardIdFromPath(path) {
            const match = String(path || "").match(/^\/api\/cards\/([^/]+)$/);
            return match ? match[1] : "";
          }

          function readFormPayload(form) {
            const payload = {};
            new FormData(form).forEach((value, key) => {
              if (value === "") return;
              const field = form.querySelector('[name="' + key + '"]');
              if (field && field.dataset.money !== undefined) {
                payload[key] = Math.round(parseFloat(String(value).replace(",", ".")) * 100);
              } else if (field && field.type === "number") {
                payload[key] = Number(value);
              } else {
                payload[key] = value;
              }
            });
            return payload;
          }

          function ensureStatus(container) {
            let status = container.querySelector(":scope > [data-form-status]");
            if (!status) {
              status = document.createElement("p");
              status.className = "form-status muted";
              status.setAttribute("data-form-status", "");
              status.setAttribute("aria-live", "polite");
              container.appendChild(status);
            }
            return status;
          }

          async function readApiMessage(response) {
            const body = await response.json().catch(() => ({}));
            if (response.ok) return "Ação concluída.";
            return (body.error && body.error.message) || "Não foi possível concluir a ação.";
          }

          async function sendJsonPayload(path, method, payload) {
            return fetch(path, {
              method,
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            });
          }

          function additionalCardRowHtml() {
            return '<label>Nome do cartão adicional<input data-additional-card-name placeholder="Ex.: Virtual - 0322" /></label><label>Identificador mascarado<input data-additional-card-identifier placeholder="Ex.: final 0322" /></label><div class="additional-card-actions"><button type="submit" class="additional-card-save">Salvar adicional</button><button type="button" class="additional-card-remove">Remover</button></div>';
          }

          function appendAdditionalCardRowFromButton(button) {
            const section = button ? button.closest(".additional-card-section") : null;
            const list = section ? section.querySelector("[data-additional-card-list]") : null;
            if (!list) return false;
            const row = document.createElement("div");
            row.className = "additional-card-row";
            row.innerHTML = additionalCardRowHtml();
            list.appendChild(row);
            const firstInput = row.querySelector("input");
            if (firstInput && typeof firstInput.focus === "function") firstInput.focus();
            return true;
          }

          function readAdditionalCards(form) {
            return Array.from(form.querySelectorAll(".additional-card-row"))
              .map((row) => {
                const nameField = row.querySelector("[data-additional-card-name]");
                const identifierField = row.querySelector("[data-additional-card-identifier]");
                const name = String(nameField ? nameField.value : "").trim();
                const maskedIdentifier = String(identifierField ? identifierField.value : "").trim();
                return { name, maskedIdentifier };
              })
              .filter((card) => card.name.length > 0);
          }

          function ensureSavedAdditionalList(form) {
            const section = form.querySelector(".additional-card-section");
            if (!section) return null;
            let savedList = section.querySelector("[data-additional-card-saved-list]");
            if (!savedList) {
              savedList = document.createElement("div");
              savedList.className = "additional-card-saved-list";
              savedList.setAttribute("data-additional-card-saved-list", "");
              section.insertBefore(savedList, section.querySelector("[data-additional-card-list]") || null);
            }
            return savedList;
          }

          function readBaseCardFromForm(form) {
            const payload = readFormPayload(form);
            const nameField = form.querySelector('[name="name"]');
            return Object.assign({}, payload, {
              id: cardIdFromPath(form.dataset.apiPath),
              name: String(nameField ? nameField.value : "Cartão principal"),
              maskedIdentifier: String(payload.maskedIdentifier || ""),
            });
          }

          function linksForBaseCard(baseCardId) {
            return allLinksCache.filter((link) => link.groupCardId === baseCardId);
          }

          function cardsForBaseCard(baseCard) {
            const links = linksForBaseCard(baseCard.id);
            if (links.length === 0) return [baseCard];
            const cardsById = new Map(allCardsCache.map((card) => [card.id, card]));
            return links.map((link) => cardsById.get(link.cardId) || (link.cardId === baseCard.id ? baseCard : null)).filter(Boolean);
          }

          function primaryIdForBaseCard(baseCard) {
            const primaryLink = linksForBaseCard(baseCard.id).find((link) => link.isPrimary === true);
            return primaryLink ? primaryLink.cardId : baseCard.id;
          }

          function renderCardGroupRow(input) {
            const row = document.createElement("div");
            row.className = "additional-card-group-row";

            const marker = document.createElement("span");
            marker.className = input.isPrimary ? "additional-card-primary-marker is-primary" : "additional-card-primary-marker";
            marker.textContent = "★";
            marker.setAttribute("aria-label", input.isPrimary ? "Cartão principal" : "Cartão adicional");

            const text = document.createElement("div");
            text.className = "additional-card-group-main";
            const label = document.createElement("label");
            label.textContent = input.isPrimary ? "Nome do cartão principal *" : "Nome do cartão adicional *";
            const name = document.createElement("strong");
            name.textContent = input.card.name || (input.isPrimary ? "Cartão principal" : "Cartão adicional");
            const meta = document.createElement("span");
            meta.textContent = input.card.maskedIdentifier ? input.card.maskedIdentifier : "Identificador não informado";
            label.appendChild(name);
            text.appendChild(label);
            text.appendChild(meta);

            const actions = document.createElement("div");
            actions.className = "additional-card-group-actions";
            const primaryButton = document.createElement("button");
            primaryButton.type = "button";
            primaryButton.className = input.isPrimary ? "additional-card-primary-action is-primary" : "additional-card-primary-action";
            primaryButton.textContent = input.isPrimary ? "Principal" : "Definir principal";
            primaryButton.disabled = input.isPrimary;
            primaryButton.addEventListener("click", async () => {
              primaryButton.disabled = true;
              const response = await sendJsonPayload(cardLinksApiPath + "/" + input.groupKey + "/primary", "PATCH", { cardId: input.card.id });
              if (response.ok) await loadSavedAdditionalCards();
              primaryButton.disabled = false;
            });
            actions.appendChild(primaryButton);

            if (!input.isBase) {
              const editButton = document.createElement("button");
              editButton.type = "button";
              editButton.className = "secondary-button additional-card-edit-action";
              editButton.dataset.openDialog = "edit-card-dialog-" + input.card.id;
              editButton.textContent = "Editar";
              actions.appendChild(editButton);
            }

            row.appendChild(marker);
            row.appendChild(text);
            row.appendChild(actions);
            return row;
          }

          function renderSavedAdditionalCards(form) {
            const savedList = ensureSavedAdditionalList(form);
            if (!savedList) return;
            const baseCard = readBaseCardFromForm(form);
            const linkedCards = cardsForBaseCard(baseCard);
            const groupKey = baseCard.id;
            const primaryId = primaryIdForBaseCard(baseCard);

            savedList.replaceChildren();
            savedList.hidden = linkedCards.length === 0;
            if (linkedCards.length === 0) return;

            const group = document.createElement("div");
            group.className = "additional-card-group-list";
            linkedCards.forEach((card) => {
              group.appendChild(renderCardGroupRow({
                card,
                form,
                groupKey,
                isBase: card.id === baseCard.id,
                isPrimary: card.id === primaryId,
              }));
            });
            savedList.appendChild(group);
          }

          async function loadSavedAdditionalCards() {
            const forms = Array.from(document.querySelectorAll('form[data-api-method="PATCH"][data-api-path^="/api/cards/"]'));
            if (forms.length === 0) return;
            const cardsResponse = await fetch("/api/cards?status=all").catch(() => null);
            const linksResponse = await fetch(cardLinksApiPath).catch(() => null);
            if (!cardsResponse || !cardsResponse.ok) return;
            const cardsBody = await cardsResponse.json().catch(() => ({}));
            const linksBody = linksResponse && linksResponse.ok ? await linksResponse.json().catch(() => ({})) : {};
            allCardsCache = Array.isArray(cardsBody.cards) ? cardsBody.cards : [];
            allLinksCache = Array.isArray(linksBody.links) ? linksBody.links : [];
            forms.forEach((form) => renderSavedAdditionalCards(form));
          }

          async function submitCardBatch(event, form) {
            event.preventDefault();
            event.stopImmediatePropagation();

            const submitButton = form.querySelector('button[type="submit"]');
            const status = ensureStatus(form);
            const basePayload = readFormPayload(form);
            const additionalCards = readAdditionalCards(form);
            const method = form.dataset.apiMethod || "POST";
            const isEdit = method.toUpperCase() === "PATCH";
            const baseCardId = cardIdFromPath(form.dataset.apiPath);

            if (submitButton) submitButton.disabled = true;
            status.className = "form-status muted";
            status.textContent = additionalCards.length > 0 ? "Salvando cartões..." : "Salvando...";

            const baseResponse = await sendJsonPayload(form.dataset.apiPath, method, basePayload);
            if (!baseResponse.ok) {
              status.className = "form-status error";
              status.textContent = await readApiMessage(baseResponse);
              if (submitButton) submitButton.disabled = false;
              return;
            }

            const baseBody = await baseResponse.json().catch(() => ({}));
            const savedBaseCard = baseBody.card || {};
            const groupCardId = baseCardId || savedBaseCard.id;

            for (const card of additionalCards) {
              const response = await sendJsonPayload("/api/cards", "POST", Object.assign({}, basePayload, {
                name: card.name,
              }, card.maskedIdentifier ? { maskedIdentifier: card.maskedIdentifier } : {}));

              if (!response.ok) {
                status.className = "form-status error";
                status.textContent = await readApiMessage(response);
                if (submitButton) submitButton.disabled = false;
                return;
              }

              const body = await response.json().catch(() => ({}));
              const additionalCard = body.card || {};
              if (groupCardId && additionalCard.id) {
                const linkResponse = await sendJsonPayload(cardLinksApiPath, "POST", { groupCardId, cardId: additionalCard.id });
                if (!linkResponse.ok) {
                  status.className = "form-status error";
                  status.textContent = await readApiMessage(linkResponse);
                  if (submitButton) submitButton.disabled = false;
                  return;
                }
              }
            }

            form.querySelectorAll(".additional-card-row").forEach((row) => row.remove());
            status.className = "form-status success";
            status.textContent = isEdit ? "Cartão salvo." : "Cartão criado. Atualizando a tela...";

            if (isEdit) {
              await loadSavedAdditionalCards();
              if (submitButton) submitButton.disabled = false;
              return;
            }

            window.setTimeout(() => window.location.assign("/contas-cartoes#cards"), 450);
          }

          document.addEventListener("click", (event) => {
            const target = getEventElement(event);
            const addButton = target ? target.closest("[data-additional-card-add]") : null;
            if (addButton && appendAdditionalCardRowFromButton(addButton)) {
              event.preventDefault();
              event.stopImmediatePropagation();
              return;
            }

            const removeButton = target ? target.closest(".additional-card-remove") : null;
            if (!removeButton) return;
            const row = removeButton.closest(".additional-card-row");
            if (row) row.remove();
          }, true);

          document.addEventListener("submit", (event) => {
            const target = getEventElement(event);
            const form = target ? target.closest("form") : null;
            if (!isEnhancedCardForm(form)) return;
            void submitCardBatch(event, form);
          }, true);

          const style = document.createElement("style");
          style.id = "accounts-cards-additional-stability-style";
          style.textContent = [
            ".additional-card-row { align-items: end !important; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important; }",
            ".additional-card-actions { grid-column: 1 / -1 !important; justify-content: flex-start !important; }",
            ".additional-card-save, .additional-card-remove { flex: 0 0 auto !important; min-width: 10rem !important; }",
            ".additional-card-group-row { grid-template-columns: 28px minmax(0, 1fr) !important; }",
            ".additional-card-group-actions { grid-column: 2 !important; justify-content: flex-start !important; }",
            ".additional-card-primary-action, .additional-card-edit-action { min-width: 9rem !important; }",
            "@media (max-width: 760px) { .additional-card-row { grid-template-columns: 1fr !important; } .additional-card-actions, .additional-card-group-actions { display: grid !important; grid-template-columns: 1fr !important; } .additional-card-save, .additional-card-remove, .additional-card-primary-action, .additional-card-edit-action { width: 100% !important; } }",
          ].join("");
          document.head.appendChild(style);

          if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => { void loadSavedAdditionalCards(); });
          } else {
            void loadSavedAdditionalCards();
          }
        })();
      </script>`;
}
