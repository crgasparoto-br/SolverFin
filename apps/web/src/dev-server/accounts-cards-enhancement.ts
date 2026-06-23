export function enhanceAccountsCardsTabs(html: string): string {
  if (!html.includes('data-tab-panel="accounts"')) return html;

  let enhanced = injectActiveFilter(html);
  enhanced = injectAdditionalCardSections(enhanced);

  if (!enhanced.includes("data-accounts-cards-direct-enhancement")) {
    enhanced = enhanced.replace("</body>", `${accountsCardsDirectEnhancementScript()}</body>`);
  }

  return enhanced;
}

function injectActiveFilter(html: string): string {
  if (html.includes("active-filter-switch")) return html;

  const activeFilterToggleHtml = `          <label class="active-filter-switch" data-active-filter aria-pressed="false">
            <input type="checkbox" class="active-filter-input" data-active-filter-input />
            <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
            <span>Exibir apenas ativos</span>
          </label>`;
  const htmlWithoutStatusFilter = html.replace(
    `          <label>Status
            <select data-master-status>
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          </label>`,
    "",
  );

  return htmlWithoutStatusFilter.replace(
    `          <button type="button" data-open-dialog="new-card-dialog">Adicionar cartão</button>`,
    `          <button type="button" data-open-dialog="new-card-dialog">Adicionar cartão</button>
${activeFilterToggleHtml}`,
  );
}

function injectAdditionalCardSections(html: string): string {
  if (html.includes("additional-card-section")) return html;

  const section = renderAdditionalCardSectionHtml();

  return html
    .replaceAll(
      `        <button type="submit">Salvar cartão</button>`,
      `${section}
        <button type="submit">Salvar cartão</button>`,
    )
    .replaceAll(
      `        <button type="submit">Criar cartão</button>`,
      `${section}
        <button type="submit">Criar cartão</button>`,
    );
}

function renderAdditionalCardSectionHtml(): string {
  return `
        <section class="additional-card-section" aria-label="Cartões vinculados">
          <div class="additional-card-heading">
            <div>
              <strong>Cartões vinculados</strong>
              <p class="muted">Revise o cartão principal e os adicionais deste cadastro.</p>
            </div>
            <button type="button" class="additional-card-add" data-additional-card-add>+ adicional</button>
          </div>
          <div class="additional-card-saved-list" data-additional-card-saved-list hidden></div>
          <div class="additional-card-list" data-additional-card-list></div>
        </section>`;
}

function accountsCardsDirectEnhancementScript(): string {
  return `
      <script data-accounts-cards-direct-enhancement>
        (() => {
          if (window.__solverFinAccountsCardsDirect === true) return;
          window.__solverFinAccountsCardsDirect = true;

          const activeFilterStorageKey = "solverfin.accountsCards.activeOnly";
          const cardLinksApiPath = "/api/card-additional-links";
          let allCardsCache = [];
          let allLinksCache = [];

          function getEventElement(event) {
            const target = event.target;
            if (target instanceof Element) return target;
            if (target && target.parentElement instanceof Element) return target.parentElement;
            return null;
          }

          function isCardForm(form) {
            if (!(form instanceof HTMLFormElement)) return false;
            const path = String(form.dataset.apiPath || "");
            const method = String(form.dataset.apiMethod || "POST").toUpperCase();
            return path === "/api/cards" || (method === "PATCH" && path.indexOf("/api/cards/") === 0);
          }

          function cardIdFromPath(path) {
            const prefix = "/api/cards/";
            const value = String(path || "");
            return value.indexOf(prefix) === 0 ? value.slice(prefix.length) : "";
          }

          function ensureStyles() {
            if (document.getElementById("accounts-cards-direct-enhancement-style")) return;
            const style = document.createElement("style");
            style.id = "accounts-cards-direct-enhancement-style";
            style.textContent = [
              ".active-filter-switch { align-items: center; align-self: stretch; background: var(--primary-soft); border: 1px solid #d4e6ec; border-radius: 8px; color: var(--primary); cursor: pointer; display: inline-flex; font: inherit; font-size: .84rem; font-weight: 800; gap: 10px; justify-content: center; line-height: 1.15; min-height: 44px; padding: 0 14px; text-align: left; user-select: none; width: fit-content; }",
              ".active-filter-input { border: 0; height: 1px; margin: 0; opacity: 0; padding: 0; position: absolute; width: 1px; }",
              ".active-filter-switch .toggle-track { align-items: center; background: #cbd5e1; border-radius: 999px; display: inline-flex; flex: 0 0 auto; height: 20px; padding: 2px; width: 38px; }",
              ".active-filter-switch .toggle-thumb { background: #fff; border-radius: 999px; box-shadow: 0 1px 3px rgba(15, 23, 42, .24); display: block; height: 16px; transform: translateX(0); transition: transform .18s ease; width: 16px; }",
              ".active-filter-switch[aria-pressed=\"true\"] .toggle-track { background: var(--primary); }",
              ".active-filter-switch[aria-pressed=\"true\"] .toggle-thumb { transform: translateX(18px); }",
              ".additional-card-section { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: 8px; display: grid; gap: 12px; grid-column: 1 / -1; padding: 12px; }",
              ".additional-card-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; }",
              ".additional-card-add { background: transparent; color: var(--primary); min-height: 36px; padding: 0 10px; white-space: nowrap; }",
              ".additional-card-list, .additional-card-saved-list { display: grid; gap: 10px; }",
              ".additional-card-row { align-items: end; display: grid; gap: 10px; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }",
              ".additional-card-actions { display: flex; flex-wrap: wrap; gap: 8px; grid-column: 1 / -1; justify-content: flex-start; }",
              ".additional-card-save { background: var(--primary); color: white; min-height: 44px; min-width: 10rem; padding: 0 14px; white-space: nowrap; }",
              ".additional-card-remove { background: var(--danger-bg); border: 1px solid #fecaca; color: var(--danger); min-height: 44px; min-width: 8rem; padding: 0 14px; white-space: nowrap; }",
              ".additional-card-group-list { display: grid; gap: 8px; }",
              ".additional-card-group-row { align-items: center; border-top: 1px solid #d8e7ec; display: grid; gap: 10px; grid-template-columns: 28px minmax(0, 1fr); padding: 8px 0; }",
              ".additional-card-group-row:first-of-type { border-top: 0; }",
              ".additional-card-primary-marker { align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 999px; color: var(--muted); display: inline-flex; font-size: 1rem; font-weight: 900; height: 22px; justify-content: center; line-height: 1; width: 22px; }",
              ".additional-card-primary-marker.is-primary { background: var(--primary); border-color: var(--primary); color: white; }",
              ".additional-card-group-main { display: grid; gap: 3px; min-width: 0; }",
              ".additional-card-group-main label { color: var(--muted); font-size: .72rem; gap: 0; line-height: 1.2; }",
              ".additional-card-group-main strong { border-bottom: 1px solid #d8e7ec; color: var(--text); display: block; font-size: .94rem; overflow-wrap: anywhere; padding-bottom: 5px; }",
              ".additional-card-group-actions { display: flex; flex-wrap: wrap; gap: 8px; grid-column: 2; justify-content: flex-start; }",
              ".additional-card-primary-action, .additional-card-edit-action, .additional-card-enable-action, .additional-card-disable-action { min-height: 38px; min-width: 9rem; padding: 0 10px; white-space: nowrap; }",
              ".additional-card-primary-action { background: transparent; border: 0; color: var(--primary); }",
              ".additional-card-primary-action.is-primary, .additional-card-primary-action:disabled { color: var(--muted); cursor: default; }",
              ".additional-card-disable-action { background: var(--danger-bg); border: 1px solid #fecaca; color: var(--danger); }",
              ".additional-card-enable-action { background: var(--success-bg); border: 1px solid #bbf7d0; color: var(--success); }",
              ".additional-card-group-row.is-disabled { opacity: .62; }",
              ".additional-card-group-row.is-disabled .additional-card-group-main strong { text-decoration: line-through; }",
              "@media (max-width: 760px) { .active-filter-switch, .additional-card-row { width: 100%; } .additional-card-heading, .additional-card-row { grid-template-columns: 1fr; } .additional-card-actions, .additional-card-group-actions { display: grid; grid-template-columns: 1fr; } .additional-card-save, .additional-card-remove, .additional-card-primary-action, .additional-card-edit-action, .additional-card-enable-action, .additional-card-disable-action { width: 100%; } }",
            ].join("");
            document.head.appendChild(style);
          }

          function readPayload(form) {
            const payload = {};
            new FormData(form).forEach((value, key) => {
              if (value === "") return;
              const field = form.querySelector('[name="' + key + '"]');
              if (field && field.dataset.money !== undefined) payload[key] = Math.round(parseFloat(String(value).replace(",", ".")) * 100);
              else if (field && field.type === "number") payload[key] = Number(value);
              else payload[key] = value;
            });
            return payload;
          }

          function ensureStatus(form) {
            let status = form.querySelector(":scope > [data-form-status]");
            if (!status) {
              status = document.createElement("p");
              status.className = "form-status muted";
              status.setAttribute("data-form-status", "");
              status.setAttribute("aria-live", "polite");
              form.appendChild(status);
            }
            return status;
          }

          async function sendJson(path, method, payload) {
            return fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
          }

          async function readApiMessage(response) {
            const body = await response.json().catch(() => ({}));
            if (response.ok) return "Ação concluída.";
            return (body.error && body.error.message) || "Não foi possível concluir a ação.";
          }

          function additionalRowHtml() {
            return '<label>Nome do cartão adicional<input data-additional-card-name placeholder="Ex.: Virtual - 0322" /></label><label>Identificador mascarado<input data-additional-card-identifier placeholder="Ex.: final 0322" /></label><div class="additional-card-actions"><button type="submit" class="additional-card-save">Salvar adicional</button><button type="button" class="additional-card-remove">Remover</button></div>';
          }

          function addAdditionalRow(button) {
            const section = button ? button.closest(".additional-card-section") : null;
            const list = section ? section.querySelector("[data-additional-card-list]") : null;
            if (!list) return false;
            const row = document.createElement("div");
            row.className = "additional-card-row";
            row.innerHTML = additionalRowHtml();
            list.appendChild(row);
            const input = row.querySelector("input");
            if (input && typeof input.focus === "function") input.focus();
            return true;
          }

          function readAdditionalCards(form) {
            return Array.from(form.querySelectorAll(".additional-card-row"))
              .map((row) => {
                const name = String((row.querySelector("[data-additional-card-name]") || {}).value || "").trim();
                const maskedIdentifier = String((row.querySelector("[data-additional-card-identifier]") || {}).value || "").trim();
                return { name, maskedIdentifier };
              })
              .filter((card) => card.name.length > 0);
          }

          function linksForBase(baseCardId) {
            return allLinksCache.filter((link) => link.groupCardId === baseCardId);
          }

          function cardsForBase(baseCard) {
            const links = linksForBase(baseCard.id);
            if (links.length === 0) return [];
            const cardsById = new Map(allCardsCache.map((card) => [card.id, card]));
            return links.map((link) => cardsById.get(link.cardId) || (link.cardId === baseCard.id ? baseCard : null)).filter(Boolean);
          }

          function primaryIdForBase(baseCard) {
            const primaryLink = linksForBase(baseCard.id).find((link) => link.isPrimary === true);
            return primaryLink ? primaryLink.cardId : baseCard.id;
          }

          function readBaseCard(form) {
            const payload = readPayload(form);
            const nameField = form.querySelector('[name="name"]');
            return Object.assign({}, payload, {
              id: cardIdFromPath(form.dataset.apiPath),
              name: String(nameField ? nameField.value : "Cartão principal"),
              maskedIdentifier: String(payload.maskedIdentifier || ""),
            });
          }

          function renderSavedRow(input) {
            const isDisabled = input.card.status === "archived";

            const row = document.createElement("div");
            row.className = isDisabled ? "additional-card-group-row is-disabled" : "additional-card-group-row";

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
            meta.textContent = isDisabled
              ? "Desabilitado"
              : (input.card.maskedIdentifier || "Identificador não informado");
            label.appendChild(name);
            text.appendChild(label);
            text.appendChild(meta);

            const actions = document.createElement("div");
            actions.className = "additional-card-group-actions";
            const primaryButton = document.createElement("button");
            primaryButton.type = "button";
            primaryButton.className = input.isPrimary ? "additional-card-primary-action is-primary" : "additional-card-primary-action";
            primaryButton.textContent = input.isPrimary ? "Principal" : "Definir principal";
            primaryButton.disabled = input.isPrimary || isDisabled;
            primaryButton.addEventListener("click", async () => {
              primaryButton.disabled = true;
              const response = await sendJson(cardLinksApiPath + "/" + input.groupKey + "/primary", "PATCH", { cardId: input.card.id });
              if (response.ok) await loadSavedCards();
              primaryButton.disabled = false;
            });
            actions.appendChild(primaryButton);

            const editButton = document.createElement("button");
            editButton.type = "button";
            editButton.className = "secondary-button additional-card-edit-action";
            editButton.textContent = "Editar nome";
            if (input.isBase) {
              editButton.dataset.focusPrimaryName = "true";
            } else {
              editButton.dataset.openDialog = "edit-card-dialog-" + input.card.id;
            }
            actions.appendChild(editButton);

            if (!input.isBase) {
              const toggleButton = document.createElement("button");
              toggleButton.type = "button";
              toggleButton.className = isDisabled
                ? "secondary-button additional-card-enable-action"
                : "secondary-button additional-card-disable-action";
              toggleButton.textContent = isDisabled ? "Habilitar" : "Desabilitar";
              toggleButton.addEventListener("click", async () => {
                toggleButton.disabled = true;
                const response = isDisabled
                  ? await sendJson("/api/cards/" + input.card.id, "PATCH", { status: "active" })
                  : await sendJson("/api/cards/" + input.card.id + "/archive", "POST", {});
                if (response.ok) await loadSavedCards();
                toggleButton.disabled = false;
              });
              actions.appendChild(toggleButton);
            }

            row.appendChild(marker);
            row.appendChild(text);
            row.appendChild(actions);
            return row;
          }

          function renderSavedCards(form) {
            const list = form.querySelector("[data-additional-card-saved-list]");
            if (!list) return;
            const baseCard = readBaseCard(form);
            const cards = cardsForBase(baseCard);
            const primaryId = primaryIdForBase(baseCard);
            list.replaceChildren();
            list.hidden = cards.length === 0;
            if (cards.length === 0) return;
            const group = document.createElement("div");
            group.className = "additional-card-group-list";
            cards.forEach((card) => group.appendChild(renderSavedRow({
              card,
              groupKey: baseCard.id,
              isBase: card.id === baseCard.id,
              isPrimary: card.id === primaryId,
            })));
            list.appendChild(group);
          }

          async function loadSavedCards() {
            const forms = Array.from(document.querySelectorAll('form[data-api-method="PATCH"][data-api-path^="/api/cards/"]'));
            if (forms.length === 0) return;
            const cardsResponse = await fetch("/api/cards?status=all").catch(() => null);
            const linksResponse = await fetch(cardLinksApiPath).catch(() => null);
            if (!cardsResponse || !cardsResponse.ok) return;
            const cardsBody = await cardsResponse.json().catch(() => ({}));
            const linksBody = linksResponse && linksResponse.ok ? await linksResponse.json().catch(() => ({})) : {};
            allCardsCache = Array.isArray(cardsBody.cards) ? cardsBody.cards : [];
            allLinksCache = Array.isArray(linksBody.links) ? linksBody.links : [];
            forms.forEach((form) => renderSavedCards(form));
          }

          async function submitCardForm(event, form) {
            event.preventDefault();
            event.stopImmediatePropagation();

            const submitButton = form.querySelector('button[type="submit"]');
            const status = ensureStatus(form);
            const basePayload = readPayload(form);
            const additionalCards = readAdditionalCards(form);
            const method = form.dataset.apiMethod || "POST";
            const isEdit = method.toUpperCase() === "PATCH";
            const baseCardId = cardIdFromPath(form.dataset.apiPath);

            if (submitButton) submitButton.disabled = true;
            status.className = "form-status muted";
            status.textContent = additionalCards.length > 0 ? "Salvando cartões..." : "Salvando...";

            const baseResponse = await sendJson(form.dataset.apiPath, method, basePayload);
            if (!baseResponse.ok) {
              status.className = "form-status error";
              status.textContent = await readApiMessage(baseResponse);
              if (submitButton) submitButton.disabled = false;
              return;
            }

            const baseBody = await baseResponse.json().catch(() => ({}));
            const groupCardId = baseCardId || (baseBody.card && baseBody.card.id);

            for (const card of additionalCards) {
              const response = await sendJson("/api/cards", "POST", Object.assign({}, basePayload, {
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
                const linkResponse = await sendJson(cardLinksApiPath, "POST", { groupCardId, cardId: additionalCard.id });
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
              await loadSavedCards();
              if (submitButton) submitButton.disabled = false;
              return;
            }

            window.setTimeout(() => window.location.assign("/contas-cartoes#cards"), 450);
          }

          function installCardFormHandlers() {
            document.querySelectorAll("form[data-api-path^='/api/cards']").forEach((form) => {
              if (!isCardForm(form) || form.dataset.additionalControllerInstalled === "true") return;
              form.dataset.additionalControllerInstalled = "true";
              form.onsubmit = (event) => {
                void submitCardForm(event, form);
                return false;
              };
              form.addEventListener("submit", (event) => {
                void submitCardForm(event, form);
              }, true);
            });
          }

          function openDialog(button) {
            const dialogId = button ? button.dataset.openDialog : undefined;
            const dialog = dialogId ? document.getElementById(dialogId) : null;
            if (!dialog) return false;
            if (typeof dialog.showModal === "function") {
              if (!dialog.open) dialog.showModal();
            } else {
              dialog.setAttribute("open", "");
            }
            const firstField = dialog.querySelector("input, select, textarea, button");
            if (firstField && typeof firstField.focus === "function") firstField.focus();
            return true;
          }

          function wireActiveFilter() {
            const button = document.querySelector("[data-active-filter]");
            const input = button ? button.querySelector("[data-active-filter-input]") : null;
            if (!button || !input) return;
            let activeOnly = false;
            try { activeOnly = window.localStorage.getItem(activeFilterStorageKey) === "true"; } catch (_error) { activeOnly = false; }
            input.checked = activeOnly;
            button.setAttribute("aria-pressed", String(activeOnly));
            input.addEventListener("change", () => {
              button.setAttribute("aria-pressed", String(input.checked === true));
              try { window.localStorage.setItem(activeFilterStorageKey, String(input.checked === true)); } catch (_error) {}
            });
          }

          document.addEventListener("click", (event) => {
            const target = getEventElement(event);
            const addButton = target ? target.closest("[data-additional-card-add]") : null;
            if (addButton && addAdditionalRow(addButton)) {
              event.preventDefault();
              event.stopImmediatePropagation();
              return;
            }

            const removeButton = target ? target.closest(".additional-card-remove") : null;
            if (removeButton) {
              const row = removeButton.closest(".additional-card-row");
              if (row) row.remove();
              event.preventDefault();
              return;
            }

            const openButton = target ? target.closest("[data-open-dialog]") : null;
            if (openButton && openDialog(openButton)) event.preventDefault();

            const focusPrimaryButton = target ? target.closest("[data-focus-primary-name]") : null;
            if (focusPrimaryButton) {
              const form = focusPrimaryButton.closest("form");
              const nameField = form ? form.querySelector('[name="name"]') : null;
              if (nameField) {
                nameField.scrollIntoView({ behavior: "smooth", block: "center" });
                nameField.focus();
              }
              event.preventDefault();
            }
          }, true);

          document.addEventListener("submit", (event) => {
            const target = getEventElement(event);
            const form = target ? target.closest("form") : null;
            if (!isCardForm(form)) return;
            void submitCardForm(event, form);
          }, true);

          function boot() {
            ensureStyles();
            installCardFormHandlers();
            wireActiveFilter();
            void loadSavedCards();
          }

          if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", boot);
          } else {
            boot();
          }
        })();
      </script>`;
}
