const STYLE_MARKER = "data-transaction-group-modal-enhancement";
const SCRIPT_MARKER = "data-transaction-group-modal-controller";

export function enhanceTransactionGroupModal(html: string): string {
  if (!html.includes("data-group-modal") || html.includes(STYLE_MARKER)) return html;

  const styles = `
    <style ${STYLE_MARKER}>
      .group-modal-panel{display:flex;flex-direction:column;max-height:min(92vh,920px);max-width:none;overflow:hidden;width:min(1060px,calc(100vw - 28px))}
      .group-modal-panel>header{background:var(--surface);border-bottom:1px solid var(--line);flex:0 0 auto;margin:0;padding-bottom:12px;position:sticky;top:0;z-index:4}
      .group-modal-panel form[data-group-form]{display:grid;gap:12px;grid-template-columns:repeat(3,minmax(0,1fr));min-height:0;overflow:auto;padding:2px 2px 0}
      .group-modal-panel form[data-group-form]>label{min-width:0}
      .group-modal-panel form[data-group-form]>label input{font-variant-numeric:tabular-nums;width:100%}
      .group-modal-panel [data-group-effective-input]{font-size:1rem;font-weight:800}
      .group-modal-panel .group-readonly{display:none}
      .group-modal-panel .group-members-heading{align-items:end;border-top:1px solid var(--line);display:flex;grid-column:1/-1;justify-content:space-between;margin-top:2px;padding-top:12px}
      .group-modal-panel .group-members-heading h3{font-size:.9375rem;margin:0}
      .group-modal-panel .group-members-heading span{color:var(--muted);font-size:.75rem;font-weight:700}
      .group-modal-panel .group-members{border:1px solid var(--line);border-radius:var(--radius);display:grid;grid-column:1/-1;max-height:min(42vh,390px);overflow:auto}
      .group-modal-panel .group-member-row{align-items:center;border-bottom:1px solid var(--line);display:grid;gap:10px;grid-template-columns:minmax(0,1fr) 7.5rem 8.5rem 7.25rem;padding:9px 10px}
      .group-modal-panel .group-member-row:last-child{border-bottom:0}
      .group-modal-panel .group-member-main{display:grid;gap:3px;min-width:0}
      .group-modal-panel .group-member-main strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .group-modal-panel .group-member-meta{color:var(--muted);display:flex;flex-wrap:wrap;font-size:.75rem;gap:5px}
      .group-modal-panel .group-member-meta span{background:var(--bg);border:1px solid var(--line);border-radius:999px;padding:2px 6px}
      .group-modal-panel .group-member-date,.group-modal-panel .group-member-amount{font-variant-numeric:tabular-nums;white-space:nowrap}
      .group-modal-panel .group-member-amount{text-align:right}
      .group-modal-panel .group-member-actions{display:flex;gap:4px;justify-content:flex-end}
      .group-modal-panel .group-member-action{align-items:center;background:transparent;border:1px solid transparent;border-radius:6px;color:var(--text);display:inline-flex;height:32px;justify-content:center;min-width:32px;padding:0}
      .group-modal-panel .group-member-action:hover,.group-modal-panel .group-member-action:focus-visible{background:var(--primary-soft);border-color:var(--line)}
      .group-modal-panel .group-member-action.danger{color:var(--danger)}
      .group-modal-panel .group-member-action.danger:hover,.group-modal-panel .group-member-action.danger:focus-visible{background:var(--danger-bg)}
      .group-modal-panel .group-actions{align-items:center;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:7px;grid-column:1/-1;padding-top:12px}
      .group-modal-panel .group-actions button{align-items:center;display:inline-flex;gap:6px;min-height:34px}
      .group-modal-panel .group-actions .group-action-danger{background:var(--surface);border:1px solid var(--danger);color:var(--danger)}
      .group-modal-panel .group-action-status{color:var(--muted);font-size:.8125rem;margin-left:auto}
      .group-modal-panel .group-action-status.error{color:var(--danger)}
      .group-modal-panel .group-action-status.success{color:var(--success)}
      .group-modal-panel [data-group-ungroup]{display:none!important}
      .group-modal-panel .save-row{background:var(--surface);border-top:1px solid var(--line);bottom:0;grid-column:1/-1;margin:0;padding-top:10px;position:sticky;z-index:3}
      [data-group-member-editor] .modal-panel{max-width:620px;width:min(620px,calc(100vw - 28px))}
      [data-group-member-editor-form]{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr))}
      [data-group-member-editor-form] .full{grid-column:1/-1}
      [data-group-member-editor-form] .editor-actions{display:flex;gap:8px;grid-column:1/-1;justify-content:flex-end}
      [data-group-member-editor-status].error{color:var(--danger)}
      [data-group-member-editor-status].success{color:var(--success)}
      @media(max-width:760px){
        .group-modal-panel{max-height:96vh;width:calc(100vw - 14px)}
        .group-modal-panel form[data-group-form]{grid-template-columns:1fr 1fr}
        .group-modal-panel .group-member-row{align-items:start;grid-template-columns:minmax(0,1fr) auto}
        .group-modal-panel .group-member-main{grid-column:1/-1}
        .group-modal-panel .group-member-date{grid-column:1}
        .group-modal-panel .group-member-amount{grid-column:2}
        .group-modal-panel .group-member-actions{grid-column:1/-1;justify-content:flex-start}
        .group-modal-panel .group-action-status{flex-basis:100%;margin-left:0}
      }
      @media(max-width:520px){
        .group-modal-panel form[data-group-form],[data-group-member-editor-form]{grid-template-columns:1fr}
        [data-group-member-editor-form] .full,[data-group-member-editor-form] .editor-actions{grid-column:auto}
      }
    </style>`;

  const script = `
    <script ${SCRIPT_MARKER}>
      (function () {
        const modal = document.querySelector("[data-group-modal]");
        const form = document.querySelector("[data-group-form]");
        if (!modal || !form || form.dataset.enhancedGroupModal === "true") return;
        form.dataset.enhancedGroupModal = "true";
        const membersNode = form.querySelector("[data-group-members]");
        const summaryNode = form.querySelector("[data-group-summary]");
        const saveRow = form.querySelector(".save-row");
        const titleNode = document.querySelector("[data-group-title]");
        if (!membersNode || !summaryNode || !saveRow) return;

        const icon = {
          clone: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
          edit: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 20h4.8L19.2 9.6a2.7 2.7 0 0 0 0-3.8l-1-1a2.7 2.7 0 0 0-3.8 0L4 15.2V20zm2-2v-2l9.8-9.8c.3-.3.7-.3 1 0l1 1c.3.3.3.7 0 1L8 18H6z" fill="currentColor"/></svg>',
          trash: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 7h14M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M7 7l1 13a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
          check: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
          ungroup: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8.5 15.5 6 18a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0M15.5 8.5 18 6a3 3 0 0 1 4 4l-4 4a3 3 0 0 1-4 0M9 15l6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
        };

        const effectiveField = readonlyField("Valor efetivo", "group-effective-input");
        const kindField = readonlyField("Tipo", "group-kind-input");
        const statusField = readonlyField("Situação", "group-status-input");
        form.insertBefore(effectiveField.label, form.firstElementChild);
        form.insertBefore(kindField.label, summaryNode);
        form.insertBefore(statusField.label, summaryNode);

        const heading = document.createElement("div");
        heading.className = "group-members-heading";
        heading.innerHTML = '<div><h3>Lançamentos unificados</h3><span>Revise ou altere cada lançamento individualmente.</span></div><span data-group-member-count></span>';
        form.insertBefore(heading, membersNode);

        const actions = document.createElement("div");
        actions.className = "group-actions";
        actions.hidden = true;
        actions.innerHTML =
          '<button type="button" data-group-action="status"></button>' +
          '<button type="button" class="ghost-btn" data-group-action="clone">' + icon.clone + '<span>Clonar grupo</span></button>' +
          '<button type="button" class="ghost-btn" data-group-action="ungroup">' + icon.ungroup + '<span>Desagrupar</span></button>' +
          '<button type="button" class="group-action-danger" data-group-action="void">' + icon.trash + '<span>Excluir grupo</span></button>' +
          '<span class="group-action-status" data-group-action-status aria-live="polite"></span>';
        form.insertBefore(actions, saveRow);

        const editor = createEditor();
        document.body.appendChild(editor);
        const editorForm = editor.querySelector("[data-group-member-editor-form]");
        const editorStatus = editor.querySelector("[data-group-member-editor-status]");
        let currentGroup;
        let editingMember;

        function readonlyField(labelText, dataName) {
          const label = document.createElement("label");
          label.textContent = labelText;
          const input = document.createElement("input");
          input.readOnly = true;
          input.dataset[dataName.replace(/-([a-z])/g, function (_, letter) { return letter.toUpperCase(); })] = "";
          label.appendChild(input);
          return { label: label, input: input };
        }

        function createEditor() {
          const dialog = document.createElement("dialog");
          dialog.setAttribute("data-group-member-editor", "");
          dialog.innerHTML =
            '<section class="modal-panel"><header><div><p class="eyebrow">Lançamento do grupo</p><h2>Editar lançamento</h2></div><button type="button" class="icon-btn" data-editor-close aria-label="Fechar">&times;</button></header>' +
            '<form data-group-member-editor-form>' +
              '<label class="full">Descrição<input name="description" maxlength="240" required></label>' +
              '<label>Data<input name="date" type="date" required></label>' +
              '<label>Valor (R$)<input name="amount" inputmode="decimal" required></label>' +
              '<label class="full">Categoria<select name="categoryId"></select></label>' +
              '<p class="full muted" data-group-member-editor-status aria-live="polite"></p>' +
              '<div class="editor-actions"><button type="button" class="ghost-btn" data-editor-close>Cancelar</button><button type="submit">Salvar alteração</button></div>' +
            '</form></section>';
          dialog.querySelectorAll("[data-editor-close]").forEach(function (button) {
            button.addEventListener("click", function () { dialog.close(); });
          });
          return dialog;
        }

        function money(minor, currency) {
          return (Number(minor || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: currency || "BRL" });
        }

        function moneyInput(minor) {
          return (Number(minor || 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        function moneyToMinor(value) {
          const normalized = String(value || "").replace(/\\./g, "").replace(",", ".");
          return Math.round(Number(normalized || 0) * 100);
        }

        function formatDate(value) {
          if (!value) return "—";
          const parts = String(value).split("-");
          return parts.length === 3 ? parts[2] + "/" + parts[1] + "/" + parts[0] : value;
        }

        function formatKind(value) {
          return value === "income" ? "Entrada" : value === "expense" ? "Saída" : value;
        }

        function formatStatus(value) {
          if (value === "reconciled") return "Conciliado";
          if (value === "posted") return "Efetivado";
          if (value === "planned") return "Previsto";
          return value || "—";
        }

        function escapeText(value) {
          return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
            return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character];
          });
        }

        function loadGroup(groupId) {
          const node = document.querySelector('script[data-group="' + CSS.escape(groupId) + '"]');
          if (!node) return undefined;
          try { return JSON.parse(node.textContent || "{}"); } catch { return undefined; }
        }

        function selectedItems() {
          return Array.from(document.querySelectorAll("[data-select-transaction]:checked"));
        }

        function renderCreateMode() {
          currentGroup = undefined;
          actions.hidden = true;
          titleNode && (titleNode.textContent = "Unificar lançamentos");
          const selected = selectedItems();
          const currency = selected[0] && selected[0].dataset.currency || "BRL";
          const total = selected.reduce(function (sum, item) { return sum + Number(item.dataset.amount || 0); }, 0);
          effectiveField.input.value = money(total, currency);
          kindField.input.value = formatKind(selected[0] && selected[0].dataset.kind || "");
          statusField.input.value = formatStatus(selected[0] && selected[0].dataset.status || "");
          heading.querySelector("[data-group-member-count]").textContent = selected.length + " itens";
          membersNode.innerHTML = selected.map(function (item) {
            return memberRow({
              id: item.value,
              description: item.dataset.description,
              categoryName: item.dataset.category,
              status: item.dataset.status,
              amountMinor: Math.abs(Number(item.dataset.amount || 0)),
              effectiveOn: item.dataset.date,
              currency: currency,
              kind: item.dataset.kind
            }, false);
          }).join("");
        }

        function renderDetailsMode(group) {
          currentGroup = group;
          actions.hidden = false;
          titleNode && (titleNode.textContent = "Editar agrupamento");
          const signedTotal = group.kind === "expense" ? -Math.abs(group.totalAmountMinor) : Math.abs(group.totalAmountMinor);
          effectiveField.input.value = money(signedTotal, group.currency);
          kindField.input.value = formatKind(group.kind);
          statusField.input.value = formatStatus(group.status);
          heading.querySelector("[data-group-member-count]").textContent = group.members.length + " itens";
          membersNode.innerHTML = group.members.map(function (member) { return memberRow(member, true); }).join("");
          const statusButton = actions.querySelector('[data-group-action="status"]');
          const reconcile = group.status !== "reconciled";
          statusButton.dataset.targetStatus = reconcile ? "reconciled" : "posted";
          statusButton.innerHTML = icon.check + '<span>' + (reconcile ? "Marcar como conciliado" : "Desconciliar") + '</span>';
        }

        function memberRow(member, actionable) {
          const date = member.effectiveOn || member.plannedOn || member.occurredOn;
          const signed = member.kind === "expense" ? -Math.abs(member.amountMinor) : Math.abs(member.amountMinor);
          const actionsMarkup = actionable
            ? '<div class="group-member-actions">' +
                '<button type="button" class="group-member-action" data-member-action="clone" data-member-id="' + escapeText(member.id) + '" aria-label="Clonar ' + escapeText(member.description) + '" title="Clonar">' + icon.clone + '</button>' +
                '<button type="button" class="group-member-action" data-member-action="edit" data-member-id="' + escapeText(member.id) + '" aria-label="Editar ' + escapeText(member.description) + '" title="Editar">' + icon.edit + '</button>' +
                '<button type="button" class="group-member-action danger" data-member-action="void" data-member-id="' + escapeText(member.id) + '" aria-label="Excluir ' + escapeText(member.description) + '" title="Excluir">' + icon.trash + '</button>' +
              '</div>'
            : '<span></span>';
          return '<article class="group-member-row" data-group-member="' + escapeText(member.id) + '">' +
            '<div class="group-member-main"><strong>' + escapeText(member.description || "(sem descrição)") + '</strong>' +
              '<div class="group-member-meta"><span>' + escapeText(member.categoryName || "Sem categoria") + '</span><span>' + escapeText(formatStatus(member.status)) + '</span></div></div>' +
            '<time class="group-member-date" datetime="' + escapeText(date) + '">' + escapeText(formatDate(date)) + '</time>' +
            '<strong class="group-member-amount">' + escapeText(money(signed, member.currency || (currentGroup && currentGroup.currency) || "BRL")) + '</strong>' +
            actionsMarkup + '</article>';
        }

        function refreshModal() {
          const groupId = form.dataset.groupId;
          if (groupId) {
            const group = loadGroup(groupId);
            if (group && Array.isArray(group.members)) renderDetailsMode(group);
          } else renderCreateMode();
        }

        modal.addEventListener("toggle", function () {
          if (modal.open) window.setTimeout(refreshModal, 0);
        });

        membersNode.addEventListener("click", async function (event) {
          const button = event.target.closest("[data-member-action]");
          if (!button || !currentGroup) return;
          const member = currentGroup.members.find(function (candidate) { return candidate.id === button.dataset.memberId; });
          if (!member) return;
          if (button.dataset.memberAction === "edit") {
            openEditor(member);
            return;
          }
          if (button.dataset.memberAction === "clone") {
            if (!window.confirm("Clonar este lançamento como um novo item independente?")) return;
            await runRequest(button, "/api/transaction-groups/" + encodeURIComponent(currentGroup.id) + "/members/" + encodeURIComponent(member.id) + "/clone", "POST", {}, "Lançamento clonado.");
            return;
          }
          if (button.dataset.memberAction === "void") {
            const message = member.status === "reconciled"
              ? "Este lançamento está conciliado. Excluir apenas esta linha?"
              : "Excluir apenas este lançamento do agrupamento?";
            if (!window.confirm(message)) return;
            await runRequest(button, "/api/transaction-groups/" + encodeURIComponent(currentGroup.id) + "/members/" + encodeURIComponent(member.id) + "/void", "POST", {}, "Lançamento excluído.");
          }
        });

        actions.addEventListener("click", async function (event) {
          const button = event.target.closest("[data-group-action]");
          if (!button || !currentGroup) return;
          const action = button.dataset.groupAction;
          if (action === "status") {
            const targetStatus = button.dataset.targetStatus;
            const message = targetStatus === "reconciled"
              ? "Marcar todos os lançamentos deste grupo como conciliados?"
              : "Desconciliar todos os lançamentos deste grupo?";
            if (!window.confirm(message)) return;
            await runRequest(button, "/api/transaction-groups/" + encodeURIComponent(currentGroup.id) + "/status", "PATCH", { status: targetStatus }, targetStatus === "reconciled" ? "Grupo conciliado." : "Grupo desconciliado.");
            return;
          }
          if (action === "clone") {
            if (!window.confirm("Clonar todos os lançamentos como itens independentes? O grupo original será preservado.")) return;
            await runRequest(button, "/api/transaction-groups/" + encodeURIComponent(currentGroup.id) + "/clone", "POST", {}, "Grupo clonado.");
            return;
          }
          if (action === "ungroup") {
            if (!window.confirm("Desagrupar estes lançamentos? Os lançamentos serão mantidos individualmente.")) return;
            await runRequest(button, "/api/transaction-groups/" + encodeURIComponent(currentGroup.id), "DELETE", {}, "Lançamentos desagrupados.");
            return;
          }
          if (action === "void") {
            if (!window.confirm("Excluir o grupo e todos os seus lançamentos? Esta ação não apenas desagrupa os itens.")) return;
            await runRequest(button, "/api/transaction-groups/" + encodeURIComponent(currentGroup.id) + "/void", "POST", {}, "Grupo excluído.");
          }
        });

        function openEditor(member) {
          editingMember = member;
          editorForm.reset();
          editorStatus.textContent = "";
          editorStatus.className = "full muted";
          editorForm.description.value = member.description || "";
          editorForm.date.value = member.effectiveOn || member.plannedOn || member.occurredOn || "";
          editorForm.amount.value = moneyInput(member.amountMinor);
          const categorySelect = editorForm.categoryId;
          const sourceSelect = document.querySelector('[data-form] select[name="categoryId"]');
          categorySelect.innerHTML = sourceSelect ? sourceSelect.innerHTML : '<option value="">Sem categoria</option>';
          Array.from(categorySelect.options).forEach(function (option) {
            const kind = option.dataset.kind;
            option.disabled = Boolean(kind && kind !== member.kind);
          });
          categorySelect.value = member.categoryId || "";
          editor.showModal();
        }

        editorForm.addEventListener("submit", async function (event) {
          event.preventDefault();
          if (!currentGroup || !editingMember) return;
          const submit = editorForm.querySelector('[type="submit"]');
          submit.disabled = true;
          editorStatus.textContent = "Salvando alteração...";
          editorStatus.className = "full muted";
          const response = await fetch(
            "/api/transaction-groups/" + encodeURIComponent(currentGroup.id) + "/members/" + encodeURIComponent(editingMember.id),
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                description: editorForm.description.value,
                date: editorForm.date.value,
                amountMinor: moneyToMinor(editorForm.amount.value),
                categoryId: editorForm.categoryId.value || null
              })
            }
          );
          const responseBody = await response.json().catch(function () { return {}; });
          submit.disabled = false;
          if (!response.ok) {
            editorStatus.textContent = responseBody.error && responseBody.error.message || "Não foi possível salvar a alteração.";
            editorStatus.className = "full error";
            return;
          }
          editorStatus.textContent = "Alteração salva. Atualizando o extrato...";
          editorStatus.className = "full success";
          window.setTimeout(function () { window.location.reload(); }, 350);
        });

        async function runRequest(button, path, method, body, successMessage) {
          const statusNode = actions.querySelector("[data-group-action-status]");
          button.disabled = true;
          statusNode.textContent = "Processando...";
          statusNode.className = "group-action-status";
          const response = await fetch(path, {
            method: method,
            headers: { "content-type": "application/json" },
            body: method === "DELETE" ? undefined : JSON.stringify(body)
          });
          const responseBody = await response.json().catch(function () { return {}; });
          button.disabled = false;
          if (!response.ok) {
            statusNode.textContent = responseBody.error && responseBody.error.message || "Não foi possível concluir a ação.";
            statusNode.className = "group-action-status error";
            return;
          }
          statusNode.textContent = successMessage + " Atualizando...";
          statusNode.className = "group-action-status success";
          window.setTimeout(function () { window.location.reload(); }, 350);
        }
      })();
    </script>`;

  return html.replace("</head>", `${styles}</head>`).replace("</body>", `${script}</body>`);
}
