export function enhanceAccountsCardsTabs(html: string): string {
  if (!html.includes('data-api-path="/api/cards')) return html;

  let enhanced = injectActiveFilter(html);
  enhanced = injectAdditionalCardSections(enhanced);

  if (!enhanced.includes("data-accounts-cards-visible-enhancement")) {
    enhanced = enhanced.replace("</body>", `${accountsCardsVisibleEnhancementScript()}</body>`);
  }

  return enhanced;
}

function injectActiveFilter(html: string): string {
  if (html.includes("data-active-filter")) return html;

  const activeFilterToggleHtml = `          <label class="active-filter-switch" data-active-filter aria-pressed="false">
            <input type="checkbox" class="active-filter-input" data-active-filter-input />
            <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
            <span>Exibir apenas contas ativas</span>
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

  return html
    .replaceAll(
      `        <button type="submit">Salvar cartão</button>`,
      `${renderAdditionalCardSectionHtml()}
        <button type="submit">Salvar cartão</button>`,
    )
    .replaceAll(
      `        <button type="submit">Criar cartão</button>`,
      `${renderAdditionalCardSectionHtml()}
        <button type="submit">Criar cartão</button>`,
    );
}

function renderAdditionalCardSectionHtml(): string {
  return `        <section class="additional-card-section" aria-label="Cartões vinculados">
          <div class="additional-card-heading">
            <div>
              <strong>Cartões vinculados</strong>
              <p class="muted">Revise o cartão principal e os adicionais deste cadastro.</p>
            </div>
            <button type="button" class="additional-card-add" data-additional-card-add>+ adicional</button>
          </div>
          <div class="additional-card-saved-list" data-additional-card-saved-list></div>
          <div class="additional-card-list" data-additional-card-list></div>
        </section>`;
}

function accountsCardsVisibleEnhancementScript(): string {
  return `
      <script data-accounts-cards-visible-enhancement>
        (() => {
          if (window.__solverFinAccountsCardsVisibleEnhancement === true) return;
          window.__solverFinAccountsCardsVisibleEnhancement = true;

          const cardLinksApiPath = "/api/card-additional-links";
          const activeFilterStorageKey = "solverfin.accountsCards.activeOnly";
          let allCardsCache = [];
          let allLinksCache = [];

          function ensureStyle() {
            if (document.getElementById("accounts-cards-visible-enhancement-style")) return;
            const style = document.createElement("style");
            style.id = "accounts-cards-visible-enhancement-style";
            style.textContent = [
              ".active-filter-switch { align-items: center; align-self: stretch; background: var(--primary-soft); border: 1px solid #d4e6ec; border-radius: 8px; color: var(--primary); cursor: pointer; display: inline-flex; font: inherit; font-size: .84rem; font-weight: 800; gap: 10px; justify-content: center; line-height: 1.15; min-height: 44px; padding: 0 14px; user-select: none; width: fit-content; }",
              ".active-filter-input { height: 1px; opacity: 0; position: absolute; width: 1px; }",
              ".active-filter-switch .toggle-track { align-items: center; background: #cbd5e1; border-radius: 999px; display: inline-flex; flex: 0 0 auto; height: 20px; padding: 2px; width: 38px; }",
              ".active-filter-switch .toggle-thumb { background: #fff; border-radius: 999px; box-shadow: 0 1px 3px rgba(15, 23, 42, .24); display: block; height: 16px; transform: translateX(0); transition: transform .18s ease; width: 16px; }",
              ".active-filter-switch[aria-pressed=\"true\"] .toggle-track { background: var(--primary); }",
              ".active-filter-switch[aria-pressed=\"true\"] .toggle-thumb { transform: translateX(18px); }",
              ".additional-card-section { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: 8px; display: grid; gap: 12px; grid-column: 1 / -1; padding: 12px; }",
              ".additional-card-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; }",
              ".additional-card-add { background: transparent; color: var(--primary); min-height: 36px; padding: 0 10px; }",
              ".additional-card-list, .additional-card-saved-list { display: grid; gap: 10px; }",
              ".additional-card-row { align-items: end; display: grid; gap: 10px; grid-template-columns: minmax(0, 1fr) minmax(0, .75fr) auto; }",
              ".additional-card-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }",
              ".additional-card-save { background: var(--primary); color: white; min-height: 44px; min-width: 9.25rem; padding: 0 12px; white-space: nowrap; }",
              ".additional-card-remove { background: var(--danger-bg); border: 1px solid #fecaca; color: var(--danger); min-height: 44px; min-width: 7rem; padding: 0 12px; white-space: nowrap; }",
              ".additional-card-group-list { display: grid; gap: 8px; }",
              ".additional-card-group-row { align-items: center; border-top: 1px solid #d8e7ec; display: grid; gap: 12px; grid-template-columns: 32px minmax(0, 1fr) auto; padding: 8px 0; }",
              ".additional-card-group-row:first-of-type { border-top: 0; }",
              ".additional-card-primary-marker { align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 999px; color: var(--muted); display: inline-flex; font-size: 1rem; font-weight: 900; height: 22px; justify-content: center; line-height: 1; width: 22px; }",
              ".additional-card-primary-marker.is-primary { background: var(--primary); border-color: var(--primary); color: white; }",
              ".additional-card-group-main { display: grid; gap: 3px; min-width: 0; }",
              ".additional-card-group-main label { color: var(--muted); font-size: .72rem; gap: 0; line-height: 1.2; }",
              ".additional-card-group-main strong { border-bottom: 1px solid #d8e7ec; color: var(--text); display: block; font-size: .94rem; overflow-wrap: anywhere; padding-bottom: 5px; }",
              ".additional-card-group-main span { color: var(--muted); font-size: .82rem; }",
              ".additional-card-group-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }",
              ".additional-card-primary-action { background: transparent; border: 0; color: var(--primary); min-height: 36px; padding: 0 8px; white-space: nowrap; }",
              ".additional-card-primary-action.is-primary { color: var(--muted); cursor: default; }",
              ".additional-card-edit-action { min-height: 36px; padding: 0 10px; white-space: nowrap; }",
              "@media (max-width: 760px) { .active-filter-switch, .additional-card-row { width: 100%; } .additional-card-row, .additional-card-group-row { grid-template-columns: 28px minmax(0, 1fr); } .additional-card-actions { display: grid; grid-template-columns: 1fr; justify-content: stretch; } .additional-card-group-actions { grid-column: 2; justify-content: stretch; } .additional-card-primary-action, .additional-card-edit-action { width: 100%; } .additional-card-heading { align-items: stretch; display: grid; } }",
            ].join("");
            document.head.appendChild(style);
          }

          function getEventElement(event) {
            const target = event.target;
            if (target instanceof Element) return target;
            if (target && target.parentElement instanceof Element) return target.parentElement;
            return null;
          }

          function readFormPayload(form) {
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

          function readAdditionalCards(form) {
            return Array.from(form.querySelectorAll(".additional-card-row")).map((row) => {
              const nameField = row.querySelector("[data-additional-card-name]");
              const identifierField = row.querySelector("[data-additional-card-identifier]");
              return {
                name: String(nameField ? nameField.value : "").trim(),
                maskedIdentifier: String(identifierField ? identifierField.value : "").trim(),
              };
            }).filter((card) => card.name.length > 0);
          }

          function additionalCardRowHtml() {
            return '<label>Nome do cartão adicional<input data-additional-card-name placeholder="Ex.: Virtual - 0322" /></label><label>Identificador mascarado<input data-additional-card-identifier placeholder="Ex.: final 0322" /></label><div class="additional-card-actions"><button type="submit" class="additional-card-save">Salvar adicional</button><button type="button" class="additional-card-remove">Remover</button></div>';
          }

          function cardIdFromPath(path) {
            const match = String(path || "").match(/^\/api\/cards\/([^/]+)$/);
            return match ? match[1] : "";
          }

          function isCardForm(form) {
            if (!form || !form.dataset || !form.dataset.apiPath) return false;
            return form.dataset.apiPath === "/api/cards" || form.dataset.apiPath.indexOf("/api/cards/") === 0;
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

          async function readApiMessage(response) {
            const body = await response.json().catch(() => ({}));
            if (response.ok) return "Ação concluída.";
            return (body.error && body.error.message) || "Não foi possível concluir a ação.";
          }

          async function sendJsonPayload(path, method, payload) {
            return fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
          }

          function baseCardFromForm(form) {
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
            primaryButton.disabled = input.isPrimary || !input.groupKey;
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
            const savedList = form.querySelector("[data-additional-card-saved-list]");
            if (!savedList) return;
            const baseCard = baseCardFromForm(form);
            const linkedCards = cardsForBaseCard(baseCard);
            const groupKey = baseCard.id;
            const primaryId = primaryIdForBaseCard(baseCard);
            const group = document.createElement("div");
            group.className = "additional-card-group-list";
            linkedCards.forEach((card) => group.appendChild(renderCardGroupRow({ card, form, groupKey, isBase: card.id === baseCard.id, isPrimary: card.id === primaryId })));
            savedList.replaceChildren(group);
          }

          async function loadSavedAdditionalCards() {
            const forms = Array.from(document.querySelectorAll('form[data-api-path^="/api/cards/"]'));
            if (forms.length === 0) return;
            const cardsResponse = await fetch("/api/cards?status=all").catch(() => null);
            const linksResponse = await fetch(cardLinksApiPath).catch(() => null);
            const cardsBody = cardsResponse && cardsResponse.ok ? await cardsResponse.json().catch(() => ({})) : {};
            const linksBody = linksResponse && linksResponse.ok ? await linksResponse.json().catch(() => ({})) : {};
            allCardsCache = Array.isArray(cardsBody.cards) ? cardsBody.cards : [];
            allLinksCache = Array.isArray(linksBody.links) ? linksBody.links : [];
            forms.forEach((form) => renderSavedAdditionalCards(form));
          }

          function appendAdditionalCardRow(button) {
            const section = button ? button.closest(".additional-card-section") : null;
            const list = section ? section.querySelector("[data-additional-card-list]") : null;
            if (!list) return false;
            const row = document.createElement("div");
            row.className = "additional-card-row";
            row.innerHTML = additionalCardRowHtml();
            const removeButton = row.querySelector(".additional-card-remove");
            if (removeButton) removeButton.addEventListener("click", () => row.remove());
            list.appendChild(row);
            const firstInput = row.querySelector("input");
            if (firstInput && typeof firstInput.focus === "function") firstInput.focus();
            return true;
          }

          async function submitCardForm(event, form) {
            event.preventDefault();
            event.stopImmediatePropagation();
            const status = ensureStatus(form);
            const submitButton = form.querySelector('button[type="submit"]');
            const method = form.dataset.apiMethod || "POST";
            const isEdit = method.toUpperCase() === "PATCH";
            const basePayload = readFormPayload(form);
            const additionalCards = readAdditionalCards(form);
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
            const groupCardId = baseCardId || (baseBody.card && baseBody.card.id);
            for (const card of additionalCards) {
              const response = await sendJsonPayload("/api/cards", "POST", Object.assign({}, basePayload, { name: card.name }, card.maskedIdentifier ? { maskedIdentifier: card.maskedIdentifier } : {}));
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

          function wireActiveFilter() {
            const activeFilterButton = document.querySelector("[data-active-filter]");
            const activeFilterInput = activeFilterButton ? activeFilterButton.querySelector("[data-active-filter-input]") : null;
            if (!activeFilterButton || !activeFilterInput) return;
            let activeOnly = false;
            try { activeOnly = window.localStorage.getItem(activeFilterStorageKey) === "true"; } catch (_error) { activeOnly = false; }
            activeFilterInput.checked = activeOnly;
            activeFilterButton.setAttribute("aria-pressed", String(activeOnly));
            activeFilterInput.addEventListener("change", () => {
              activeFilterButton.setAttribute("aria-pressed", String(activeFilterInput.checked === true));
              try { window.localStorage.setItem(activeFilterStorageKey, String(activeFilterInput.checked === true)); } catch (_error) {}
            });
          }

          ensureStyle();
          wireActiveFilter();
          void loadSavedAdditionalCards();

          document.addEventListener("click", (event) => {
            const target = getEventElement(event);
            const addButton = target ? target.closest("[data-additional-card-add]") : null;
            if (!addButton) return;
            if (appendAdditionalCardRow(addButton)) {
              event.preventDefault();
              event.stopImmediatePropagation();
            }
          }, true);

          document.addEventListener("click", (event) => {
            const target = getEventElement(event);
            const removeButton = target ? target.closest(".additional-card-remove") : null;
            if (!removeButton) return;
            const row = removeButton.closest(".additional-card-row");
            if (row) row.remove();
          });

          document.addEventListener("submit", (event) => {
            const target = getEventElement(event);
            const form = target ? target.closest("form") : null;
            if (!isCardForm(form)) return;
            void submitCardForm(event, form);
          }, true);
        })();
      </script>`;
}
