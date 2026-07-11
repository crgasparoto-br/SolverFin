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
  const isCard = targetKind === "card";
  const scopeSubject = isCard ? "Esta compra" : "Este lançamento";
  const currentScopeLabel = isCard
    ? "Alterar somente esta compra"
    : "Alterar somente este lançamento";
  const futureScopeLabel = isCard
    ? "Alterar esta compra e as próximas"
    : "Alterar este lançamento e os próximos";

  return `
    <dialog data-recurrence-modal>
      <section class="modal-panel">
        <form method="dialog" class="close-form"><button type="submit">Fechar</button></form>
        <div>
          <p class="eyebrow">Recorrência</p>
          <h2>Gerar parcelas da recorrência</h2>
        </div>
        <form data-recurrence-edit-form hidden>
          <input type="hidden" name="id" />
          <label class="full">Descrição<input name="description" /></label>
          ${
            targetKind === "account"
              ? `<label>Tipo<select name="kind"><option value="income">Entrada</option><option value="expense">Saída</option></select></label>`
              : ""
          }
          <label>A cada<input name="interval" type="number" min="1" max="60" value="1" /></label>
          <label>Frequência<select name="frequency">${renderFrequencyOptions()}</select></label>
          <label>Valor (R$)<input name="amountMinor" data-money inputmode="decimal" placeholder="0,00" /></label>
          <label>Início<input name="startOn" type="date" /></label>
          <label>Fim opcional<input name="endOn" type="date" /></label>
          <label>Categoria<select name="categoryId"><option value="">Sem categoria</option>${renderCategoryOptions(categories)}</select></label>
          ${
            targetKind === "card"
              ? `<label>Instrumento<select name="cardInstrumentId">${cardInstrumentOptions}</select></label><label class="full">Aplicar alteração<select name="editScope"><option value="recurrence_only">Somente novas ocorrências</option><option value="recurrence_and_future_pending">Novas ocorrências e futuras pendentes</option></select></label>`
              : ""
          }
          <button type="submit" class="full" title="Salvar alterações da recorrência"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style="display:inline-block;vertical-align:middle;margin-right:4px"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="17 21 17 13 7 13 7 21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="7 3 7 8 15 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Salvar recorrência</button>
        </form>
        <form data-recurrence-installments-form>
          <input type="hidden" name="id" />
          <label>Gerar parcelas até<input name="through" type="date" required /></label>
          <label>Limite<input name="maxOccurrences" type="number" min="1" max="60" value="12" /></label>
          <button type="submit" class="full secondary-button" title="Gerar parcelas da recorrência"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style="display:inline-block;vertical-align:middle;margin-right:4px"><path d="M17 2.1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 12.6V12a9 9 0 0 1 9-9h9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 21.9l-4-4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 11.4v.6a9 9 0 0 1-9 9H3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Gerar parcelas</button>
        </form>
        <p class="muted" aria-live="polite" data-recurrence-modal-status></p>
      </section>
    </dialog>
    <dialog data-recurrence-scope-modal data-target-kind="${targetKind}" aria-labelledby="recurrence-scope-title">
      <section class="modal-panel recurrence-scope-panel">
        <button type="button" class="close-form" data-recurrence-scope-cancel aria-label="Fechar">Fechar</button>
        <div>
          <p class="eyebrow">Escolha o alcance</p>
          <h2 id="recurrence-scope-title">O que deseja alterar?</h2>
          <p class="muted">${scopeSubject} faz parte de uma recorrência. Escolha uma opção antes de salvar.</p>
        </div>
        <div class="recurrence-scope-actions">
          <button type="button" data-recurrence-scope="current" autofocus>${currentScopeLabel}</button>
          <button type="button" class="secondary-button" data-recurrence-scope="current_and_future">${futureScopeLabel}</button>
          <button type="button" class="ghost-button" data-recurrence-scope-cancel>Voltar para a edição</button>
        </div>
        <p class="muted" aria-live="polite" data-recurrence-scope-status></p>
      </section>
    </dialog>
  `;
}

export function recurrencesSectionStyles(): string {
  return `.recurrence-indicator{align-items:center;background:#e0f2fe;border:1px solid #bae6fd;border-radius:999px;color:#0369a1;display:inline-flex;font-size:.6875rem;font-weight:700;gap:3px;line-height:1;margin-left:6px;padding:2px 6px;text-transform:uppercase;vertical-align:middle}.recurrence-indicator svg{display:block;height:12px;width:12px}.secondary-button{background:var(--surface,#fff);border:1px solid var(--line,#cbd5e1);color:var(--primary)}.ghost-button{background:transparent;border:1px solid var(--line,#cbd5e1);color:var(--text)}.modal-panel form[data-form] label:has([name=editScope]){display:none}[data-recurrence-edit-form],[data-recurrence-installments-form]{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr))}[data-recurrence-edit-form] button,[data-recurrence-installments-form] button{grid-column:1/-1}.recurrence-scope-panel{max-width:520px}.recurrence-scope-actions{display:grid;gap:8px}.recurrence-scope-actions button{min-height:36px;text-align:left}.recurrence-scope-panel [data-recurrence-scope-status].error{color:var(--danger,#b91c1c)}.recurrence-scope-panel [data-recurrence-scope-status].success{color:var(--success,#15803d)}.statement-heading-actions{align-items:center;display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}.account-summary .quick-actions[data-actions-moved=true]{display:none}@media(max-width:760px){[data-recurrence-edit-form],[data-recurrence-installments-form]{grid-template-columns:1fr}.statement-heading-actions{justify-content:stretch}.statement-heading-actions button{width:100%}}`;
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

        function normalizeCardInstrumentLabels() {
          document.querySelectorAll('select[name="cardInstrumentId"] option').forEach((option) => {
            option.textContent = String(option.textContent || "").replace(/\\s*·\\s*limite\\s+.+$/i, "");
          });
        }

        function moveStatementQuickActionsToHeading() {
          const heading = document.querySelector(".statement-heading");
          const quickActions = document.querySelector(".account-summary .quick-actions");
          if (!heading || !quickActions || heading.querySelector(".statement-heading-actions")) return;
          const buttons = Array.from(quickActions.querySelectorAll("button[data-open-modal]"));
          if (buttons.length === 0) return;
          const target = document.createElement("div");
          target.className = "statement-heading-actions";
          target.setAttribute("aria-label", "Ações rápidas do extrato");
          buttons.forEach((button) => target.appendChild(button));
          heading.appendChild(target);
          quickActions.dataset.actionsMoved = "true";
        }

        function purchaseMoveErrorMessage(responseBody) {
          const code = responseBody && responseBody.error && responseBody.error.code;
          if (code === "CARD_PURCHASE_INVOICE_PERIOD_INVALID") return "Informe um período válido no formato AAAA-MM.";
          if (code === "CARD_PURCHASE_INVOICE_PERIOD_UNCHANGED") return "A compra já está nesta fatura.";
          if (code === "CARD_PURCHASE_INVOICE_LOCKED") return "A fatura de origem está fechada, paga ou cancelada.";
          if (code === "CARD_PURCHASE_DESTINATION_INVOICE_LOCKED") return "A fatura de destino está fechada, paga ou cancelada.";
          return (responseBody && responseBody.error && responseBody.error.message) || "Não foi possível mover a compra.";
        }

        function renderMoveIcon() {
          return '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 7h11l-3-3m3 3-3 3M17 17H6l3 3m-3-3 3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        }

        function setupCardPurchaseMoveAction() {
          document.querySelectorAll("[data-purchase]").forEach((node) => {
            const purchase = JSON.parse(node.textContent || "{}");
            const editButton = document.querySelector('[data-edit-purchase="' + purchase.id + '"]');
            if (!editButton || editButton.disabled) return;
            const menu = editButton.closest(".actions-menu");
            if (!menu || menu.querySelector('[data-move-purchase="' + purchase.id + '"]')) return;
            const button = document.createElement("button");
            button.type = "button";
            button.className = "actions-item";
            button.dataset.movePurchase = purchase.id;
            button.innerHTML = renderMoveIcon() + "<span>Mover fatura</span>";
            button.addEventListener("click", async () => {
              const invoicePeriod = window.prompt("Informe o período da fatura destino no formato AAAA-MM");
              if (invoicePeriod === null) return;
              const normalizedPeriod = String(invoicePeriod || "").trim();
              if (!/^\\d{4}-\\d{2}$/.test(normalizedPeriod)) {
                window.alert("Informe um período válido no formato AAAA-MM.");
                return;
              }
              button.disabled = true;
              const response = await send("/api/credit-card-accounts/" + purchase.cardId + "/purchases/" + purchase.id + "/move-invoice-period", "POST", { invoicePeriod: normalizedPeriod });
              const body = await response.json().catch(() => ({}));
              if (!response.ok) {
                window.alert(purchaseMoveErrorMessage(body));
                button.disabled = false;
                return;
              }
              window.setTimeout(() => window.location.reload(), 450);
            });
            const divider = menu.querySelector(".actions-divider");
            if (divider) menu.insertBefore(button, divider);
            else menu.appendChild(button);
          });
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

        async function readResponse(response) {
          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            return { body, message: (body.error && body.error.message) || "Não foi possível concluir a ação." };
          }
          if (Number(body.skippedCount || 0) > 0) {
            const count = Number(body.skippedCount);
            return { body, message: "Alteração salva. " + count + (count === 1 ? " ocorrência não foi alterada por estar bloqueada ou conciliada." : " ocorrências não foram alteradas por estarem bloqueadas ou conciliadas.") };
          }
          return { body, message: "Ação concluída. Atualizando..." };
        }

        async function readMessage(response) {
          return (await readResponse(response)).message;
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

        const scopeModal = document.querySelector("[data-recurrence-scope-modal]");
        const scopeStatus = scopeModal && scopeModal.querySelector("[data-recurrence-scope-status]");
        const scopeButtons = scopeModal ? Array.from(scopeModal.querySelectorAll("[data-recurrence-scope]")) : [];
        const scopeCancelButtons = scopeModal ? Array.from(scopeModal.querySelectorAll("[data-recurrence-scope-cancel]")) : [];
        let scopeOperation = null;
        let scopeOrigin = null;
        let scopeBusy = false;

        function setScopeBusy(busy) {
          scopeBusy = busy;
          scopeButtons.concat(scopeCancelButtons).forEach((button) => { button.disabled = busy; });
        }

        function closeScopeModal() {
          if (!scopeModal || scopeBusy) return;
          scopeModal.close();
          scopeOperation = null;
          if (scopeOrigin && typeof scopeOrigin.focus === "function") scopeOrigin.focus();
          scopeOrigin = null;
        }

        function openScopeModal(origin, operation) {
          if (!scopeModal || scopeModal.open) return;
          scopeOrigin = origin;
          scopeOperation = operation;
          setScopeBusy(false);
          if (scopeStatus) {
            scopeStatus.textContent = "";
            scopeStatus.className = "muted";
          }
          scopeModal.showModal();
          const currentButton = scopeModal.querySelector('[data-recurrence-scope="current"]');
          if (currentButton) currentButton.focus();
        }

        scopeCancelButtons.forEach((button) => button.addEventListener("click", closeScopeModal));
        scopeModal && scopeModal.addEventListener("cancel", (event) => {
          event.preventDefault();
          closeScopeModal();
        });
        scopeModal && scopeModal.addEventListener("keydown", (event) => {
          if (event.key !== "Tab") return;
          const focusable = Array.from(scopeModal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'));
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        });
        scopeButtons.forEach((button) => button.addEventListener("click", async () => {
          if (!scopeOperation || scopeBusy) return;
          setScopeBusy(true);
          if (scopeStatus) {
            scopeStatus.textContent = "Salvando...";
            scopeStatus.className = "muted";
          }
          try {
            const result = await scopeOperation(button.dataset.recurrenceScope);
            if (scopeStatus) {
              scopeStatus.textContent = result.message;
              scopeStatus.className = result.ok ? "success" : "error";
            }
            if (result.ok) {
              window.setTimeout(() => window.location.reload(), result.skippedCount > 0 ? 1200 : 450);
              return;
            }
          } catch (_error) {
            if (scopeStatus) {
              scopeStatus.textContent = "Não foi possível concluir a alteração. Tente novamente.";
              scopeStatus.className = "error";
            }
          }
          setScopeBusy(false);
        }));

        function setupTransactionFormOverride() {
          const form = document.querySelector("[data-form]");
          if (!form || !form.repeatMode || !form.plannedOn || !form.amountMinor) return;
          const editScope = form.querySelector('[name="editScope"]');
          if (editScope && editScope.closest("label")) editScope.closest("label").hidden = true;
          const statusNode = form.querySelector('[aria-live="polite"]');
          function basePayload(plannedOn, effectiveOn, amountMinor, description, applyToFuturePlanned) {
            const data = new FormData(form);
            const note = String(data.get("note") || "");
            const result = { kind: String(data.get("kind")), amountMinor, occurredOn: effectiveOn || plannedOn, plannedOn, effectiveOn: effectiveOn || null, accountId: String(data.get("accountId")), description, status: String(data.get("status")) };
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
            const amountMinor = valueMode === "total" ? installmentAmountMinor(enteredAmountMinor, totalCount, parcelNumber) : enteredAmountMinor;
            const description = String(data.get("description") || "") + " " + parcelNumber + "/" + totalCount;
            return basePayload(dates.plannedOn, dates.effectiveOn, amountMinor, description, false);
          }
          function clearCurrentTransaction() {
            delete form.dataset.currentTransactionId;
            delete form.dataset.recurrenceId;
          }
          document.querySelectorAll("[data-open-modal]").forEach((button) => button.addEventListener("click", clearCurrentTransaction));
          document.querySelectorAll("[data-transaction]").forEach((node) => {
            const transaction = JSON.parse(node.textContent);
            const editButton = document.querySelector('[data-edit="' + transaction.id + '"]');
            const cloneButton = document.querySelector('[data-clone="' + transaction.id + '"]');
            if (editButton) editButton.addEventListener("click", () => { form.dataset.currentTransactionId = transaction.id; if (transaction.recurrenceId) form.dataset.recurrenceId = transaction.recurrenceId; else delete form.dataset.recurrenceId; if (form.note) form.note.value = transaction.note || ""; });
            if (cloneButton) cloneButton.addEventListener("click", () => { clearCurrentTransaction(); if (form.note) form.note.value = ""; });
          });
          form.addEventListener("submit", async (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (!form.checkValidity()) {
              form.reportValidity();
              return;
            }
            const mode = form.repeatMode.value;
            const method = form.dataset.method || "POST";
            const path = form.dataset.path || "/api/transactions";
            const execute = async (scope) => {
              let response;
              if (mode === "fixed" && method === "POST") {
                const item = payload(0, 1, false);
                response = await send("/api/recurrences", "POST", { frequency: form.frequency.value, interval: Math.max(1, Number(form.interval.value || 1)), startOn: form.plannedOn.value, endOn: form.endOn.value || undefined, amountMinor: item.amountMinor, description: String(new FormData(form).get("description") || ""), kind: item.kind, accountId: item.accountId, categoryId: item.categoryId });
              } else if (mode === "installment" && method === "POST") {
                const totalCount = Math.max(2, Number(form.installments.value || 2));
                const startParcel = Math.min(Math.max(1, Number(form.installmentStart.value || 1)), totalCount);
                const responses = [];
                let monthOffset = 0;
                for (let parcelNumber = startParcel; parcelNumber <= totalCount; parcelNumber += 1, monthOffset += 1) responses.push(await send("/api/transactions", "POST", installmentPayload(parcelNumber, totalCount, monthOffset)));
                response = responses.find((item) => !item.ok) || responses[responses.length - 1];
              } else {
                response = await send(path, method, payload(0, 1, scope === "current_and_future"));
              }
              const result = await readResponse(response);
              return { ok: response.ok, message: result.message, skippedCount: Number(result.body.skippedCount || 0) };
            };

            if (method === "PATCH" && Boolean(form.dataset.recurrenceId)) {
              openScopeModal(form.querySelector('button[type="submit"]'), execute);
              return;
            }

            if (statusNode) statusNode.textContent = "Salvando...";
            const result = await execute("current");
            if (statusNode) statusNode.textContent = result.message;
            if (result.ok) window.setTimeout(() => window.location.reload(), 450);
          }, true);
        }

        function setupCardPurchaseFormOverride() {
          const form = document.querySelector("[data-purchase-form]");
          if (!form) return;
          const purchasesById = new Map();
          function clearCurrentPurchase() {
            delete form.dataset.currentPurchaseId;
            delete form.dataset.recurrenceId;
            if (form.currentPurchaseId) form.currentPurchaseId.value = "";
            if (form.recurrenceId) form.recurrenceId.value = "";
          }
          function setCurrentPurchase(purchase) {
            form.dataset.currentPurchaseId = purchase.id;
            if (purchase.recurrenceId) form.dataset.recurrenceId = purchase.recurrenceId;
            else delete form.dataset.recurrenceId;
            if (form.currentPurchaseId) form.currentPurchaseId.value = purchase.id;
            if (form.recurrenceId) form.recurrenceId.value = purchase.recurrenceId || "";
            normalizeCardInstrumentLabels();
          }
          function purchaseIdFromPath(path) {
            const match = new RegExp("/purchases/([^/?#]+)").exec(path || "");
            return match ? match[1] : "";
          }
          document.querySelectorAll('[data-open-modal="purchase"]').forEach((button) => button.addEventListener("click", clearCurrentPurchase));
          document.querySelectorAll("[data-purchase]").forEach((node) => {
            const purchase = JSON.parse(node.textContent || "{}");
            purchasesById.set(purchase.id, purchase);
            const editButton = document.querySelector('[data-edit-purchase="' + purchase.id + '"]');
            if (!editButton) return;
            editButton.addEventListener("click", () => setCurrentPurchase(purchase));
          });
          document.addEventListener("click", (event) => {
            const target = event.target && event.target.closest ? event.target.closest("[data-edit-purchase]") : null;
            if (!target || target.disabled) return;
            const purchase = purchasesById.get(target.dataset.editPurchase) || { id: target.dataset.editPurchase, recurrenceId: target.dataset.recurrenceId || "" };
            if (purchase && purchase.id) setCurrentPurchase(purchase);
          }, true);
          form.addEventListener("submit", async (event) => {
            const formData = new FormData(form);
            const path = form.dataset.path || form.getAttribute("data-path") || "";
            const purchaseIdFromForm = String(formData.get("currentPurchaseId") || "");
            const currentPurchaseId = form.dataset.currentPurchaseId || purchaseIdFromForm || purchaseIdFromPath(path);
            const method = form.dataset.method || (currentPurchaseId ? "PATCH" : "POST");
            const purchase = purchasesById.get(currentPurchaseId);
            const editButton = currentPurchaseId ? document.querySelector('[data-edit-purchase="' + currentPurchaseId + '"]') : null;
            const recurrenceId = form.dataset.recurrenceId || String(formData.get("recurrenceId") || "") || (purchase && purchase.recurrenceId) || (editButton && editButton.dataset.recurrenceId) || "";
            if (method !== "PATCH" || !recurrenceId) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (!form.checkValidity()) {
              form.reportValidity();
              return;
            }
            const execute = async (scope) => {
              const data = new FormData(form);
              const requestPayload = { description: String(data.get("description") || ""), amountMinor: moneyToMinor(data.get("amountMinor")), occurredOn: String(data.get("occurredOn") || "") };
              const categoryId = String(data.get("categoryId") || "");
              requestPayload.categoryId = categoryId || null;
              const cardInstrumentId = String(data.get("cardInstrumentId") || "");
              if (cardInstrumentId) requestPayload.cardInstrumentId = cardInstrumentId;
              if (scope === "current_and_future") requestPayload.editScope = "current_and_future";
              const path = form.dataset.path || form.getAttribute("data-path");
              const response = await send(path, "PATCH", requestPayload);
              const result = await readResponse(response);
              return { ok: response.ok, message: result.message, skippedCount: Number(result.body.skippedCount || 0) };
            };
            openScopeModal(form.querySelector('button[type="submit"]'), execute);
          }, true);
        }

        normalizeCardInstrumentLabels();
        moveStatementQuickActionsToHeading();
        setupCardPurchaseMoveAction();
        setupTransactionFormOverride();
        setupCardPurchaseFormOverride();
        const modal = document.querySelector("[data-recurrence-modal]");
        const modalStatus = modal && modal.querySelector("[data-recurrence-modal-status]");
        const installmentsForm = modal && modal.querySelector("[data-recurrence-installments-form]");
        installmentsForm && installmentsForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const data = new FormData(installmentsForm);
          const id = String(data.get("id"));
          const payload = { through: String(data.get("through") || "") };
          const maxOccurrences = String(data.get("maxOccurrences") || "");
          if (maxOccurrences) payload.maxOccurrences = Number(maxOccurrences);
          if (modalStatus) modalStatus.textContent = "Gerando parcelas...";
          const response = await send("/api/recurrences/" + id + "/generate-installments", "POST", payload);
          if (modalStatus) modalStatus.textContent = response.ok ? "Parcelas geradas. Atualizando..." : await readMessage(response);
          if (response.ok) window.setTimeout(() => window.location.reload(), 450);
        });
        document.querySelectorAll("[data-recurrence-action]").forEach((button) => button.addEventListener("click", async () => { const confirmation = button.dataset.recurrenceActionConfirm; if (confirmation && !window.confirm(confirmation)) return; button.disabled = true; const response = await send(button.dataset.recurrenceActionPath, button.dataset.recurrenceActionMethod || "POST", {}); if (!response.ok) { window.alert(await readMessage(response)); button.disabled = false; return; } window.setTimeout(() => window.location.reload(), 450); }));
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
