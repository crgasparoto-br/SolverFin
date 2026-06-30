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
  return `<span class="recurrence-indicator" title="Lançamento recorrente" aria-label="Lançamento recorrente">${renderRepeatIcon()}</span>`;
}

export function renderRecurrenceEditModal(
  categories: RecurrenceSectionCategory[],
  targetKind: RecurrenceSectionTargetKind,
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
  return `.recurrence-indicator{color:var(--cyan);display:inline-flex}.recurrence-indicator svg{display:block}.secondary-button{background:var(--soft);border:1px solid #d4e6ec;color:var(--primary)}[data-recurrence-edit-form],[data-recurrence-installments-form]{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}[data-recurrence-edit-form] button,[data-recurrence-installments-form] button{grid-column:1/-1}@media(max-width:760px){[data-recurrence-edit-form],[data-recurrence-installments-form]{grid-template-columns:1fr}}`;
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

        const modal = document.querySelector("[data-recurrence-modal]");
        const modalStatus = modal && modal.querySelector("[data-recurrence-modal-status]");
        const editForm = modal && modal.querySelector("[data-recurrence-edit-form]");
        const installmentsForm = modal && modal.querySelector("[data-recurrence-installments-form]");

        document.querySelectorAll("[data-recurrence-edit]").forEach((button) => {
          button.addEventListener("click", () => {
            const json = document.querySelector('[data-recurrence="' + button.dataset.recurrenceEdit + '"]');
            const recurrence = JSON.parse(json.textContent);
            editForm.id.value = recurrence.id;
            editForm.description.value = recurrence.description;
            editForm.interval.value = recurrence.interval || 1;
            editForm.frequency.value = recurrence.frequency;
            editForm.amountMinor.value = minorToMoneyInput(recurrence.amountMinor);
            editForm.startOn.value = recurrence.startOn;
            editForm.endOn.value = recurrence.endOn || "";
            if (editForm.kind) editForm.kind.value = recurrence.kind;
            if (editForm.categoryId) editForm.categoryId.value = recurrence.categoryId || "";
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
          const kind = String(data.get("kind") || "");
          if (kind) payload.kind = kind;
          modalStatus.textContent = "Salvando...";
          const response = await send("/api/recurrences/" + id, "PATCH", payload);
          modalStatus.textContent = await readMessage(response);
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
