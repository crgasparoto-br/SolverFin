export function renderAccountsCardsApiFormScript(): string {
  return `
    <script>
      (() => {
        const confirmationDialog = document.querySelector("#accounts-cards-confirm-dialog");
        const confirmationMessage = confirmationDialog && confirmationDialog.querySelector("[data-confirm-message]");
        const confirmationAccept = confirmationDialog && confirmationDialog.querySelector("[data-confirm-accept]");
        const confirmationCancel = confirmationDialog && confirmationDialog.querySelector("[data-confirm-cancel]");
        const loadingState = document.querySelector("[data-resource-loading]");

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

        function buildPayload(form) {
          const payload = {};
          new FormData(form).forEach((value, key) => {
            const sendEmptyValue = key === "agencyIdentifier" || key === "accountIdentifier";
            if (value === "" && !sendEmptyValue) return;
            const field = form.querySelector('[name="' + key + '"]');
            if (field && field.dataset.money !== undefined) {
              payload[key] = Math.round(parseFloat(String(value).replace(/\\./g, "").replace(",", ".")) * 100);
            } else if (field && field.type === "number") {
              payload[key] = Number(value);
            } else {
              payload[key] = value;
            }
          });

          if (form.dataset.payloadKind === "credit-card-account") {
            const instrument = { type: payload.instrumentType || "physical", holder: payload.instrumentHolder || "primary" };
            if (payload.instrumentName !== undefined) instrument.name = payload.instrumentName;
            if (payload.instrumentMaskedIdentifier !== undefined) instrument.maskedIdentifier = payload.instrumentMaskedIdentifier;
            if (payload.instrumentCreditLimitMinor !== undefined) instrument.creditLimitMinor = payload.instrumentCreditLimitMinor;
            delete payload.instrumentType;
            delete payload.instrumentHolder;
            delete payload.instrumentName;
            delete payload.instrumentMaskedIdentifier;
            delete payload.instrumentCreditLimitMinor;
            payload.instruments = [instrument];
          }
          return payload;
        }

        async function readApiMessage(response) {
          const body = await response.json().catch(() => ({}));
          if (response.ok) return "Ação concluída. Atualizando a tela...";
          return (body.error && body.error.message) || "Não foi possível concluir a ação.";
        }

        function requestConfirmation(message) {
          if (!message || !confirmationDialog || !confirmationAccept || !confirmationCancel) return Promise.resolve(true);
          confirmationMessage.textContent = message;
          const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          return new Promise((resolve) => {
            let settled = false;
            const finish = (value) => {
              if (settled) return;
              settled = true;
              confirmationAccept.removeEventListener("click", accept);
              confirmationCancel.removeEventListener("click", cancel);
              confirmationDialog.removeEventListener("cancel", onCancel);
              confirmationDialog.removeEventListener("close", onClose);
              if (confirmationDialog.open && typeof confirmationDialog.close === "function") confirmationDialog.close();
              if (trigger && trigger.isConnected) window.setTimeout(() => trigger.focus(), 0);
              resolve(value);
            };
            const accept = () => finish(true);
            const cancel = () => finish(false);
            const onCancel = (event) => { event.preventDefault(); finish(false); };
            const onClose = () => finish(false);
            confirmationAccept.addEventListener("click", accept);
            confirmationCancel.addEventListener("click", cancel);
            confirmationDialog.addEventListener("cancel", onCancel);
            confirmationDialog.addEventListener("close", onClose);
            if (typeof confirmationDialog.showModal === "function") confirmationDialog.showModal();
            else confirmationDialog.setAttribute("open", "");
            confirmationCancel.focus();
          });
        }

        function localToday() {
          const now = new Date();
          const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
          return local.toISOString().slice(0, 10);
        }

        async function fetchCurrentCdiConfiguration(accountId) {
          const response = await fetch("/api/account-remuneration/configurations", {
            headers: { accept: "application/json" },
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error((body.error && body.error.message) || "Não foi possível consultar o CDI.");
          }
          const configurations = Array.isArray(body.configurations) ? body.configurations : [];
          const configuration = configurations.find((item) => item.accountId === accountId);
          if (!configuration || configuration.accountCurrency !== "BRL" || configuration.indexKind !== "cdi") {
            throw new Error("Esta conta não está elegível para remuneração CDI no perfil atual.");
          }
          return configuration;
        }

        document.querySelectorAll("[data-cdi-toggle]").forEach((toggle) => {
          const container = toggle.closest(".resource-cdi-control");
          const feedback = container && container.querySelector("[data-cdi-feedback]");
          const stateLabel = container && container.querySelector("[data-cdi-state]");
          if (!container || !feedback || !stateLabel) return;
          toggle.addEventListener("click", async () => {
            if (toggle.disabled || toggle.getAttribute("aria-busy") === "true") return;
            const accountId = toggle.dataset.accountId;
            toggle.disabled = true;
            toggle.setAttribute("aria-busy", "true");
            feedback.textContent = "Verificando configuração CDI...";
            feedback.className = "resource-cdi-feedback muted";
            let saved = false;
            try {
              const configuration = await fetchCurrentCdiConfiguration(accountId);
              const enable = configuration.enabled !== true;
              const percent = configuration.remunerationPercent ?? 100;
              const startsOn = configuration.startsOn || localToday();
              const message = enable
                ? "Ativar a remuneração desta conta a " + String(percent).replace(".", ",") +
                  "% do CDI a partir de " + startsOn + "? Você pode alterar percentual, data e categoria em Remuneração de Contas."
                : "Desativar a remuneração CDI desta conta? As configurações existentes serão preservadas.";
              if (!(await requestConfirmation(message))) {
                feedback.textContent = "";
                return;
              }
              feedback.textContent = "Salvando remuneração CDI...";
              const payload = {
                enabled: enable,
                remunerationPercent: percent,
                startsOn,
                ...(configuration.categoryId ? { categoryId: configuration.categoryId } : {}),
              };
              const response = await fetch(
                "/api/account-remuneration/configurations/" + encodeURIComponent(accountId),
                {
                  method: "PUT",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(payload),
                },
              );
              const body = await response.json().catch(() => ({}));
              if (!response.ok) {
                throw new Error((body.error && body.error.message) || "Não foi possível salvar o CDI.");
              }
              saved = true;
              toggle.setAttribute("aria-checked", String(enable));
              toggle.title = enable ? "Desativar remuneração CDI" : "Ativar remuneração CDI";
              stateLabel.textContent = enable ? "Ativo" : "Inativo";
              feedback.className = "resource-cdi-feedback success";
              feedback.textContent = (body.operation && body.operation.message) || "CDI atualizado.";
              window.setTimeout(() => window.location.reload(), 350);
            } catch (error) {
              feedback.className = "resource-cdi-feedback error";
              feedback.textContent = error instanceof Error ? error.message : "Não foi possível atualizar o CDI.";
            } finally {
              toggle.removeAttribute("aria-busy");
              if (!saved) toggle.disabled = false;
            }
          });
        });

        document.querySelectorAll("[data-cdi-configuration-form]").forEach((form) => {
          const status = form.querySelector("[data-cdi-form-status]");
          const submit = form.querySelector('button[type="submit"]');
          const startsOn = form.querySelector('[name="startsOn"]');
          if (startsOn && !startsOn.value) startsOn.value = localToday();
          form.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!submit || submit.disabled || !status) return;
            submit.disabled = true;
            status.className = "form-status muted";
            status.textContent = "Salvando configuração CDI...";
            let saved = false;
            try {
              const configuration = await fetchCurrentCdiConfiguration(form.dataset.accountId);
              const values = new FormData(form);
              const payload = {
                enabled: configuration.enabled === true,
                remunerationPercent: Number(values.get("remunerationPercent")),
                startsOn: String(values.get("startsOn") || ""),
                ...(values.get("categoryId") ? { categoryId: String(values.get("categoryId")) } : {}),
              };
              const response = await fetch(
                "/api/account-remuneration/configurations/" + encodeURIComponent(form.dataset.accountId),
                {
                  method: "PUT",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(payload),
                },
              );
              const body = await response.json().catch(() => ({}));
              if (!response.ok) {
                throw new Error((body.error && body.error.message) || "Não foi possível salvar a configuração CDI.");
              }
              saved = true;
              status.className = "form-status success";
              status.textContent = (body.operation && body.operation.message) || "Configuração CDI salva.";
              window.setTimeout(() => window.location.reload(), 350);
            } catch (error) {
              status.className = "form-status error";
              status.textContent = error instanceof Error ? error.message : "Não foi possível salvar o CDI.";
            } finally {
              if (!saved) submit.disabled = false;
            }
          });
        });

        document.querySelectorAll("[data-api-form]").forEach((form) => {
          const status = ensureStatus(form);
          form.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!(await requestConfirmation(form.dataset.confirm || ""))) return;
            const submitButton = form.querySelector('button[type="submit"]');
            const method = form.dataset.apiMethod || "POST";
            const payload = buildPayload(form);
            if (submitButton) submitButton.disabled = true;
            if (loadingState) loadingState.hidden = false;
            status.className = "form-status muted";
            status.textContent = "Salvando...";
            try {
              const response = await fetch(form.dataset.apiPath, {
                method,
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
              });
              status.className = response.ok ? "form-status success" : "form-status error";
              status.textContent = await readApiMessage(response);
              if (response.ok) {
                window.setTimeout(() => window.location.reload(), 350);
                return;
              }
            } catch {
              status.className = "form-status error";
              status.textContent = "Não foi possível concluir a ação. Verifique sua conexão e tente novamente.";
            }
            if (loadingState) loadingState.hidden = true;
            if (submitButton) submitButton.disabled = false;
          });
        });
      })();
    </script>`;
}

export function renderAccountsCardsRuntimeScript(): string {
  return `
    <script>
      (() => {
        const searchInput = document.querySelector("[data-master-search]");
        const kindSelect = document.querySelector("[data-master-kind]");
        const currencySelect = document.querySelector("[data-master-currency]");
        const statusSelect = document.querySelector("[data-master-status]");
        const filterStorageKey = "solverfin:accounts-cards:filters:v1";

        function maskMoneyValue(raw) {
          const digits = String(raw || "").replace(/\\D/g, "").replace(/^0+(?=\\d)/, "");
          if (digits.length === 0) return "";
          const padded = digits.padStart(3, "0");
          const cents = padded.slice(-2);
          const intPart = padded.slice(0, -2).replace(/^0+(?=\\d)/, "") || "0";
          return intPart.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ".") + "," + cents;
        }

        document.querySelectorAll("[data-money]").forEach((input) => {
          if (input.value) input.value = maskMoneyValue(input.value);
          input.addEventListener("input", () => { input.value = maskMoneyValue(input.value); });
        });

        function selectSupportsValue(control, value) {
          if (!control || typeof value !== "string") return false;
          return Array.from(control.options || []).some((option) => option.value === value);
        }

        function readPersistedFilters() {
          try {
            const raw = window.sessionStorage.getItem(filterStorageKey);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
          } catch {
            return null;
          }
        }

        function restorePersistedFilters() {
          const persisted = readPersistedFilters();
          if (!persisted) return;
          if (searchInput) searchInput.value = typeof persisted.search === "string" ? persisted.search : "";
          if (kindSelect) kindSelect.value = selectSupportsValue(kindSelect, persisted.kind) ? persisted.kind : "all";
          if (currencySelect) currencySelect.value = selectSupportsValue(currencySelect, persisted.currency) ? persisted.currency : "all";
          if (statusSelect) statusSelect.value = selectSupportsValue(statusSelect, persisted.status) ? persisted.status : "all";
        }

        function currentFilterState() {
          return {
            search: String(searchInput && searchInput.value || ""),
            kind: String(kindSelect && kindSelect.value || "all"),
            currency: String(currencySelect && currencySelect.value || "all"),
            status: String(statusSelect && statusSelect.value || "all"),
          };
        }

        function persistFilters() {
          try {
            window.sessionStorage.setItem(filterStorageKey, JSON.stringify(currentFilterState()));
          } catch {
            // Storage can be unavailable in restricted browser contexts; filtering still works in-memory.
          }
        }

        function applyFilters() {
          const term = String(searchInput && searchInput.value || "").trim().toLowerCase();
          const kind = String(kindSelect && kindSelect.value || "all");
          const currency = String(currencySelect && currencySelect.value || "all");
          const status = String(statusSelect && statusSelect.value || "all");
          let visibleItems = 0;
          const items = Array.from(document.querySelectorAll("[data-resource-master-item]"));
          items.forEach((item) => {
            const itemKind = String(item.dataset.kind || "");
            const itemCurrency = String(item.dataset.currency || "unavailable");
            const itemStatus = item.dataset.status;
            const matchesSearch = !term || String(item.dataset.search || "").includes(term);
            const matchesKind = kind === "all" || itemKind === kind;
            const matchesCurrency = currency === "all" || itemCurrency === currency;
            const matchesStatus = status === "all" || (status === "active" ? itemStatus === "active" : itemStatus !== "active");
            item.hidden = !(matchesSearch && matchesKind && matchesCurrency && matchesStatus);
            if (!item.hidden) visibleItems += 1;
          });
          const empty = document.querySelector("[data-filter-empty]");
          if (empty) empty.hidden = visibleItems > 0 || items.length === 0;

          const selectedLink = document.querySelector(
            '[data-resource-master-item] .resource-master-link[aria-current="page"]',
          );
          const selectedItem = selectedLink && selectedLink.closest("[data-resource-master-item]");
          if (selectedItem && selectedItem.hidden) {
            selectedItem.classList.remove("is-selected");
            selectedLink.removeAttribute("aria-current");
            const selectedDetail = document.querySelector("[data-resource-detail]");
            if (selectedDetail) selectedDetail.hidden = true;
            const neutralDetail = document.querySelector("[data-filter-selection-empty]");
            if (neutralDetail) neutralDetail.hidden = false;
          }
        }

        restorePersistedFilters();
        [searchInput, kindSelect, currencySelect, statusSelect].forEach((control) => {
          if (!control) return;
          const onFilterChange = () => {
            persistFilters();
            applyFilters();
          };
          control.addEventListener("input", onFilterChange);
          control.addEventListener("change", onFilterChange);
        });
        applyFilters();
      })();
    </script>`;
}
