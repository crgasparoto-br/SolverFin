export interface RecurrenceRecord {
  id: string;
  status: string;
  kind: string;
  frequency: string;
  interval?: number;
  startOn: string;
  endOn?: string;
  amountMinor: number;
  currency: string;
  description: string;
  accountId?: string;
  cardId?: string;
  cardInstrumentId?: string;
  categoryId?: string;
}

export interface RecurrenceSectionCategory {
  id: string;
  name: string;
}

export type RecurrenceSectionTargetKind = "account" | "card";

export function renderRecurrenceActionMenuItems(recurrence: RecurrenceRecord): string {
  const canPause = recurrence.status === "active";
  const canResume = recurrence.status === "paused";
  const canCancel = recurrence.status !== "cancelled" && recurrence.status !== "completed";

  return `
    <hr class="actions-divider" />
    <button type="button" class="actions-item" data-recurrence-edit="${escapeHtml(recurrence.id)}">${renderRepeatIcon()}<span>Editar recorrência</span></button>
    ${canPause ? renderRecurrenceActionMenuButton("Pausar recorrência", `/api/recurrences/${recurrence.id}/pause`, "Pausar esta recorrência? Novas parcelas não devem ser geradas enquanto ela estiver pausada.") : ""}
    ${canResume ? renderRecurrenceActionMenuButton("Retomar recorrência", `/api/recurrences/${recurrence.id}/resume`) : ""}
    ${canCancel ? renderRecurrenceActionMenuButton("Cancelar recorrência", `/api/recurrences/${recurrence.id}/cancel`, "Cancelar esta recorrência? Ela ficará disponível apenas para consulta.", true) : ""}
    <script type="application/json" data-recurrence="${escapeHtml(recurrence.id)}">${serializeScriptJson(recurrence)}</script>
  `;
}

function renderRecurrenceActionMenuButton(
  label: string,
  path: string,
  confirmation?: string,
  danger?: boolean,
): string {
  return `<button type="button" class="actions-item${danger ? " danger" : ""}" data-recurrence-action data-recurrence-action-method="POST" data-recurrence-action-path="${escapeHtml(path)}"${confirmation ? ` data-recurrence-action-confirm="${escapeHtml(confirmation)}"` : ""}>${danger ? renderTrashIcon() : renderRepeatIcon()}<span>${escapeHtml(label)}</span></button>`;
}

export function renderRecurrenceIndicator(): string {
  return `<span class="recurrence-indicator" title="Lançamento recorrente" aria-label="Lançamento recorrente">${renderRepeatIcon()}<span>Recorrente</span></span>`;
}

export function renderRecurrenceEditModal(
  categories: RecurrenceSectionCategory[],
  targetKind: RecurrenceSectionTargetKind,
  cardInstrumentOptions = "",
): string {
  return `
    <dialog data-recurrence-modal>
      <section class="modal-panel">
        <form method="dialog" class="close-form"><button type="submit">Fechar</button></form>
        <div>
          <p class="eyebrow">Recorrência</p>
          <h2>Editar recorrência</h2>
        </div>
        <form data-recurrence-edit-form>
          <input type="hidden" name="id" />
          <label class="full">Descrição<input name="description" required /></label>
          ${
            targetKind === "account"
              ? `<label>Tipo<select name="kind"><option value="income">Entrada</option><option value="expense">Saída</option></select></label>`
              : ""
          }
          <label>A cada<input name="interval" type="number" min="1" max="60" value="1" /></label>
          <label>Frequência<select name="frequency">${renderFrequencyOptions()}</select></label>
          <label>Valor (R$)<input name="amountMinor" data-money inputmode="decimal" required placeholder="0,00" /></label>
          <label>Início<input name="startOn" type="date" required /></label>
          <label>Fim opcional<input name="endOn" type="date" /></label>
          <label>Categoria<select name="categoryId"><option value="">Sem categoria</option>${renderCategoryOptions(categories)}</select></label>
          ${
            targetKind === "card"
              ? `<label>Instrumento<select name="cardInstrumentId">${cardInstrumentOptions}</select></label><label class="full">Aplicar alteração<select name="editScope"><option value="recurrence_only">Somente novas ocorrências</option><option value="recurrence_and_future_pending">Novas ocorrências e futuras pendentes</option></select></label>`
              : ""
          }
          <button type="submit" class="full">Salvar recorrência</button>
        </form>
        <form data-recurrence-installments-form>
          <input type="hidden" name="id" />
          <label>Gerar parcelas até<input name="through" type="date" required /></label>
          <label>Limite<input name="maxOccurrences" type="number" min="1" max="60" value="12" /></label>
          <button type="submit" class="full secondary-button">Gerar parcelas</button>
        </form>
        <p class="muted" aria-live="polite" data-recurrence-modal-status></p>
      </section>
    </dialog>
  `;
}

export function recurrencesSectionStyles(): string {
  return `.recurrence-indicator{align-items:center;background:#e0f2fe;border:1px solid #bae6fd;border-radius:999px;color:#0369a1;display:inline-flex;font-size:.72rem;font-weight:900;gap:4px;line-height:1;margin-left:8px;padding:3px 7px;text-transform:uppercase;vertical-align:middle}.recurrence-indicator svg{display:block;height:13px;width:13px}.secondary-button{background:var(--soft);border:1px solid #d4e6ec;color:var(--primary)}.modal-panel form[data-form] label:has([name=editScope]){display:none}[data-recurrence-edit-form],[data-recurrence-installments-form]{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}[data-recurrence-edit-form] button,[data-recurrence-installments-form] button{grid-column:1/-1}@media(max-width:760px){[data-recurrence-edit-form],[data-recurrence-installments-form]{grid-template-columns:1fr}}`;
}

export function recurrencesSectionScript(): string {
  return `
    <script>
      (function () {
        function moneyToMinor(value) {
          const normalized = String(value).replace(/\\./g, "").replace(",", ".");
          return Math.round(parseFloat(normalized || "0") * 100);
        }

        function minorToMoneyInput(amountMinor) {
          return (amountMinor / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        document.querySelectorAll("[data-recurrence-modal] [data-money]").forEach((input) => {
          input.addEventListener("input", () => {
            const digits = input.value.replace(/\\D/g, "");
            const cents = digits ? parseInt(digits, 10) : 0;
            input.value = minorToMoneyInput(cents);
          });
        });

        async function send(path, method, body) {
          return fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        }

        async function readMessage(response) {
          const body = await response.json().catch(() => ({}));
          return response.ok ? "Ação concluída. Atualizando..." : ((body.error && body.error.message) || "Não foi possível concluir a ação.");
        }

        function buildRecurrenceUpdateMessage(body) {
          const summary = body && body.futurePendingUpdate;
          if (!summary) return "Recorrência salva. Atualizando...";
          const updated = Number(summary.updatedCount || 0);
          const skipped = Number(summary.skippedCount || 0);
          if (skipped > 0) return "Recorrência salva. " + updated + " futuras pendentes atualizadas; " + skipped + " preservadas por estarem bloqueadas. Atualizando...";
          return "Recorrência salva. " + updated + " futuras pendentes atualizadas. Atualizando...";
        }

        function addMonths(dateValue, months) {
          const parts = dateValue.split("-").map(Number);
          const year = parts[0];
          const month = parts[1];
          const day = parts[2];
          const targetMonthIndex = month - 1 + months;
          const targetYear = year + Math.floor(targetMonthIndex / 12);
          const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
          const targetMonth = normalizedMonthIndex + 1;
          const lastDay = getLastDayOfMonth(targetYear, targetMonth);
          const targetDay = day === getLastDayOfMonth(year, month) ? lastDay : Math.min(day, lastDay);
          return new Date(Date.UTC(targetYear, normalizedMonthIndex, targetDay)).toISOString().slice(0, 10);
        }

        function getLastDayOfMonth(year, month) {
          return new Date(Date.UTC(year, month, 0)).getUTCDate();
        }

        function setupTransactionFormOverride() {
          const form = document.querySelector("[data-form]");
          if (!form || !form.repeatMode || !form.plannedOn || !form.amountMinor) return;

          const editScope = form.querySelector('[name="editScope"]');
          if (editScope && editScope.closest("label")) editScope.closest("label").hidden = true;

          const statusNode = form.querySelector('[aria-live="polite"]');

          function basePayload(plannedOn, effectiveOn, amountMinor, description, applyToFuturePlanned) {
            const data = new FormData(form);
            const note = String(data.get("note") || "");
            const result = {
              kind: String(data.get("kind")),
              amountMinor,
              occurredOn: effectiveOn || plannedOn,
              plannedOn,
              effectiveOn: effectiveOn || null,
              accountId: String(data.get("accountId")),
              description,
              status: String(data.get("status"))
            };
            if (note.trim() || form.dataset.currentTransactionId) result.note = note;
            if (applyToFuturePlanned) result.applyToFuturePlanned = true;
            const destinationAccountId = String(data.get("destinationAccountId") || "");
            const categoryId = String(data.get("categoryId") || "");
            if (destinationAccountId) result.destinationAccountId = destinationAccountId;
            if (categoryId) result.categoryId = categoryId;
            return result;
          }

          function plannedAndEffectiveOn(monthOffset) {
            const data = new FormData(form);
            const plannedOnRaw = String(data.get("plannedOn"));
            const plannedOn = monthOffset ? addMonths(plannedOnRaw, monthOffset) : plannedOnRaw;
            const effectiveBase = String(data.get("effectiveOn") || "") || plannedOnRaw;
            const effectiveOn = monthOffset ? addMonths(effectiveBase, monthOffset) : effectiveBase;
            return { plannedOn, effectiveOn };
          }

          function payload(index, total, applyToFuturePlanned) {
            const data = new FormData(form);
            const dates = plannedAndEffectiveOn(index);
            const description = String(data.get("description") || "") + (total > 1 ? " " + (index + 1) + "/" + total : "");
            return basePayload(dates.plannedOn, dates.effectiveOn, moneyToMinor(data.get("amountMinor")), description, applyToFuturePlanned);
          }

          function installmentAmountMinor(totalMinor, totalCount, parcelNumber) {
            const base = Math.floor(totalMinor / totalCount);
            const remainder = totalMinor - base * totalCount;
            return parcelNumber > totalCount - remainder ? base + 1 : base;
          }

          function installmentPayload(parcelNumber, totalCount, monthOffset) {
            const data = new FormData(form);
            const dates = plannedAndEffectiveOn(monthOffset);
            const enteredAmountMinor = moneyToMinor(data.get("amountMinor"));
            const valueMode = String(data.get("installmentValueMode") || "per_installment");
            const amountMinor = valueMode === "total"
              ? installmentAmountMinor(enteredAmountMinor, totalCount, parcelNumber)
              : enteredAmountMinor;
            const description = String(data.get("description") || "") + " " + parcelNumber + "/" + totalCount;
            return basePayload(dates.plannedOn, dates.effectiveOn, amountMinor, description, false);
          }

          function clearCurrentTransaction() {
            delete form.dataset.currentTransactionId;
            delete form.dataset.recurrenceId;
          }

          document.querySelectorAll("[data-open-modal]").forEach((button) => {
            button.addEventListener("click", clearCurrentTransaction);
          });

          document.querySelectorAll("[data-transaction]").forEach((node) => {
            const transaction = JSON.parse(node.textContent);
            const editButton = document.querySelector('[data-edit="' + transaction.id + '"]');
            const cloneButton = document.querySelector('[data-clone="' + transaction.id + '"]');
            if (editButton) {
              editButton.addEventListener("click", () => {
                form.dataset.currentTransactionId = transaction.id;
                if (transaction.recurrenceId) form.dataset.recurrenceId = transaction.recurrenceId;
                else delete form.dataset.recurrenceId;
                if (form.note) form.note.value = transaction.note || "";
              });
            }
            if (cloneButton) {
              cloneButton.addEventListener("click", () => {
                clearCurrentTransaction();
                if (form.note) form.note.value = "";
              });
            }
          });

          form.addEventListener("submit", async (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            const mode = form.repeatMode.value;
            const method = form.dataset.method || "POST";
            const path = form.dataset.path || "/api/transactions";
            const applyToFuturePlanned = method === "PATCH" && Boolean(form.dataset.recurrenceId)
              ? window.confirm("Este lançamento é recorrente.\n\nOK: aplicar esta alteração também em todos os lançamentos futuros planejados.\nCancelar: alterar somente este lançamento editado.")
              : false;
            let response;
            if (statusNode) statusNode.textContent = "Salvando...";
            if (mode === "fixed" && method === "POST") {
              const item = payload(0, 1, false);
              response = await send("/api/recurrences", "POST", {
                frequency: form.frequency.value,
                interval: Math.max(1, Number(form.interval.value || 1)),
                startOn: form.plannedOn.value,
                endOn: form.endOn.value || undefined,
                amountMinor: item.amountMinor,
                description: String(new FormData(form).get("description") || ""),
                kind: item.kind,
                accountId: item.accountId,
                categoryId: item.categoryId
              });
            } else if (mode === "installment" && method === "POST") {
              const totalCount = Math.max(2, Number(form.installments.value || 2));
              const startParcel = Math.min(Math.max(1, Number(form.installmentStart.value || 1)), totalCount);
              const responses = [];
              let monthOffset = 0;
              for (let parcelNumber = startParcel; parcelNumber <= totalCount; parcelNumber += 1, monthOffset += 1) {
                responses.push(await send("/api/transactions", "POST", installmentPayload(parcelNumber, totalCount, monthOffset)));
              }
              response = responses.find((item) => !item.ok) || responses[responses.length - 1];
            } else {
              response = await send(path, method, payload(0, 1, applyToFuturePlanned));
            }
            if (statusNode) statusNode.textContent = await readMessage(response);
            if (response.ok) window.setTimeout(() => window.location.reload(), 450);
          }, true);
        }

        function setupCardPurchaseEditOverride() {
          const purchaseForm = document.querySelector("[data-purchase-form]");
          if (!purchaseForm) return;

          const repeatModeLabel = purchaseForm.querySelector('[name="repeatMode"]') && purchaseForm.querySelector('[name="repeatMode"]').closest("label");
          const instrumentInput = purchaseForm.querySelector('[name="cardInstrumentId"]');
          const instrumentLabel = instrumentInput && instrumentInput.closest("label");
          const title = document.querySelector("[data-purchase-modal-title]");
          const cardPurchaseEditPattern = new RegExp("^/api/credit-card-accounts/[^/]+/purchases/[^/]+$");

          function statusNodeForPurchaseForm() {
            let status = purchaseForm.querySelector("[data-form-status]");
            if (!status) {
              status = document.createElement("p");
              status.className = "form-status muted full";
              status.setAttribute("data-form-status", "");
              status.setAttribute("aria-live", "polite");
              purchaseForm.appendChild(status);
            }
            return status;
          }

          function isCardPurchaseEdit(path, method) {
            return method === "PATCH" && cardPurchaseEditPattern.test(path || "");
          }

          document.querySelectorAll("[data-purchase]").forEach((node) => {
            const purchase = JSON.parse(node.textContent || "{}");
            const button = document.querySelector('[data-edit-purchase="' + purchase.id + '"]');
            if (!button || !purchase.cardId) return;

            button.addEventListener("click", () => {
              purchaseForm.dataset.path = "/api/credit-card-accounts/" + purchase.cardId + "/purchases/" + purchase.id;
              purchaseForm.dataset.method = "PATCH";
              if (repeatModeLabel) repeatModeLabel.hidden = true;
              if (instrumentLabel) instrumentLabel.hidden = false;
              if (instrumentInput && purchase.cardInstrumentId) instrumentInput.value = purchase.cardInstrumentId;
              if (title) title.textContent = "Editar compra";
            });
          });

          purchaseForm.addEventListener("submit", async (event) => {
            const path = purchaseForm.dataset.path || purchaseForm.getAttribute("data-path") || "";
            const method = purchaseForm.dataset.method || "POST";
            if (!isCardPurchaseEdit(path, method)) return;

            event.preventDefault();
            event.stopImmediatePropagation();

            const data = new FormData(purchaseForm);
            const categoryId = String(data.get("categoryId") || "");
            const cardInstrumentId = String(data.get("cardInstrumentId") || "");
            const payload = {
              amountMinor: moneyToMinor(data.get("amountMinor")),
              occurredOn: String(data.get("occurredOn") || ""),
              description: String(data.get("description") || ""),
            };
            if (categoryId) payload.categoryId = categoryId;
            if (cardInstrumentId) payload.cardInstrumentId = cardInstrumentId;

            const status = statusNodeForPurchaseForm();
            status.textContent = "Salvando...";
            const response = await send(path, "PATCH", payload);
            status.className = response.ok ? "form-status success full" : "form-status error full";
            status.textContent = await readMessage(response);
            if (response.ok) window.setTimeout(() => window.location.reload(), 450);
          }, true);
        }

        setupTransactionFormOverride();
        setupCardPurchaseEditOverride();

        const modal = document.querySelector("[data-recurrence-modal]");
        const modalStatus = modal && modal.querySelector("[data-recurrence-modal-status]");
        const editForm = modal && modal.querySelector("[data-recurrence-edit-form]");
        const installmentsForm = modal && modal.querySelector("[data-recurrence-installments-form]");

        function syncRecurrenceCardInstrumentOptions() {
          const recurrenceInstrumentSelect = editForm && editForm.querySelector('[name="cardInstrumentId"]');
          if (!recurrenceInstrumentSelect || recurrenceInstrumentSelect.options.length > 0) return;
          const purchaseInstrumentSelect = document.querySelector('[data-purchase-form] [name="cardInstrumentId"]');
          if (!purchaseInstrumentSelect) return;
          recurrenceInstrumentSelect.innerHTML = purchaseInstrumentSelect.innerHTML;
        }

        document.querySelectorAll("[data-recurrence-edit]").forEach((button) => {
          button.addEventListener("click", () => {
            const json = document.querySelector('[data-recurrence="' + button.dataset.recurrenceEdit + '"]');
            const recurrence = JSON.parse(json.textContent);
            syncRecurrenceCardInstrumentOptions();
            editForm.id.value = recurrence.id;
            editForm.description.value = recurrence.description;
            editForm.interval.value = recurrence.interval || 1;
            editForm.frequency.value = recurrence.frequency;
            editForm.amountMinor.value = minorToMoneyInput(recurrence.amountMinor);
            editForm.startOn.value = recurrence.startOn;
            editForm.endOn.value = recurrence.endOn || "";
            if (editForm.kind) editForm.kind.value = recurrence.kind;
            if (editForm.categoryId) editForm.categoryId.value = recurrence.categoryId || "";
            if (editForm.cardInstrumentId) editForm.cardInstrumentId.value = recurrence.cardInstrumentId || "";
            if (editForm.editScope) editForm.editScope.value = "recurrence_only";
            installmentsForm.id.value = recurrence.id;
            modalStatus.textContent = "";
            modal.showModal();
          });
        });

        editForm && editForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const data = new FormData(editForm);
          const id = String(data.get("id"));
          const payload = {
            description: String(data.get("description") || ""),
            interval: Math.max(1, Number(data.get("interval") || 1)),
            frequency: String(data.get("frequency") || "monthly"),
            amountMinor: moneyToMinor(data.get("amountMinor")),
            startOn: String(data.get("startOn") || ""),
          };
          const endOn = String(data.get("endOn") || "");
          if (endOn) payload.endOn = endOn;
          const categoryId = String(data.get("categoryId") || "");
          if (categoryId) payload.categoryId = categoryId;
          const cardInstrumentId = String(data.get("cardInstrumentId") || "");
          if (cardInstrumentId) payload.cardInstrumentId = cardInstrumentId;
          const kind = String(data.get("kind") || "");
          if (kind) payload.kind = kind;
          const editScope = String(data.get("editScope") || "");
          if (editScope) payload.editScope = editScope;
          modalStatus.textContent = "Salvando...";
          const response = await send("/api/recurrences/" + id, "PATCH", payload);
          const body = await response.json().catch(() => ({}));
          modalStatus.textContent = response.ok ? buildRecurrenceUpdateMessage(body) : ((body.error && body.error.message) || "Não foi possível concluir a ação.");
          if (response.ok) window.setTimeout(() => window.location.reload(), 450);
        });

        installmentsForm && installmentsForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const data = new FormData(installmentsForm);
          const id = String(data.get("id"));
          const payload = { through: String(data.get("through") || "") };
          const maxOccurrences = String(data.get("maxOccurrences") || "");
          if (maxOccurrences) payload.maxOccurrences = Number(maxOccurrences);
          modalStatus.textContent = "Gerando parcelas...";
          const response = await send("/api/recurrences/" + id + "/generate-installments", "POST", payload);
          modalStatus.textContent = response.ok ? "Parcelas geradas. Atualizando..." : await readMessage(response);
          if (response.ok) window.setTimeout(() => window.location.reload(), 450);
        });

        document.querySelectorAll("[data-recurrence-action]").forEach((button) => {
          button.addEventListener("click", async () => {
            const confirmation = button.dataset.recurrenceActionConfirm;
            if (confirmation && !window.confirm(confirmation)) return;
            button.disabled = true;
            const response = await send(button.dataset.recurrenceActionPath, button.dataset.recurrenceActionMethod || "POST", {});
            if (!response.ok) {
              window.alert(await readMessage(response));
              button.disabled = false;
              return;
            }
            window.setTimeout(() => window.location.reload(), 450);
          });
        });
      })();
    </script>
  `;
}

function renderFrequencyOptions(selected?: string): string {
  return [
    ["daily", "Diária"],
    ["weekly", "Semanal"],
    ["monthly", "Mensal"],
    ["yearly", "Anual"],
  ]
    .map(
      ([value, label]) =>
        `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`,
    )
    .join("");
}

function renderCategoryOptions(categories: RecurrenceSectionCategory[]): string {
  return categories
    .map(
      (category) =>
        `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`,
    )
    .join("");
}

function renderRepeatIcon(): string {
  return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M17 2.1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 12.6V12a9 9 0 0 1 9-9h9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 21.9l-4-4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 11.4v.6a9 9 0 0 1-9 9H3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function renderTrashIcon(): string {
  return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 7h14M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M7 7l1 13a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function serializeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
