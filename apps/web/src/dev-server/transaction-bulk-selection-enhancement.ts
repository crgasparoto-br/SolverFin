import { icon as renderIcon } from "./icons.js";

const STYLE_MARKER = "data-transaction-bulk-selection-enhancement";
const SCRIPT_MARKER = "data-transaction-bulk-selection-controller";

export function enhanceTransactionBulkSelection(html: string): string {
  if (!html.includes("data-selection-bar") || html.includes(STYLE_MARKER)) return html;

  const styles = `
    <style ${STYLE_MARKER}>
      .selection-bar .bulk-selection-actions{display:flex;flex-wrap:wrap;gap:7px}
      .selection-bar .bulk-selection-action{align-items:center;display:inline-flex;gap:6px;min-height:34px;white-space:nowrap}
      .selection-bar .bulk-selection-action.danger{background:var(--surface);border:1px solid var(--danger);color:var(--danger)}
      .selection-bar .bulk-selection-action.danger:hover,.selection-bar .bulk-selection-action.danger:focus-visible{background:var(--danger-bg)}
      .selection-bar .bulk-selection-help{color:var(--muted);flex-basis:100%;font-size:.8125rem;line-height:1.35;text-align:right}
      .selection-bar .bulk-selection-status{color:var(--muted);flex-basis:100%;font-size:.8125rem;text-align:right}
      .selection-bar .bulk-selection-status.error{color:var(--danger)}
      .selection-bar .bulk-selection-status.success{color:var(--success)}
      .grouped-row:has(> .col-select input[data-selection-entity="group"]:checked){background:var(--primary-soft);box-shadow:inset 3px 0 0 var(--primary)}
      .grouped-row .grouped-status{align-items:center;display:inline-flex;gap:6px}
      .grouped-row .grouped-status>.statement-status{flex:0 0 auto}
      .grouped-row .transaction-group-state{align-items:center;border-radius:999px;color:var(--primary);display:inline-flex;flex:0 0 auto;justify-content:center;min-height:28px;min-width:28px;outline-offset:2px}
      .grouped-row .transaction-group-state:focus-visible{outline:2px solid var(--primary)}
      .grouped-row .transaction-group-state svg{display:block}
      @media(max-width:760px){
        .selection-bar .bulk-selection-actions{display:grid;flex:1 1 100%;grid-template-columns:repeat(2,minmax(0,1fr))}
        .selection-bar .bulk-selection-action{justify-content:center;white-space:normal}
        .selection-bar .bulk-selection-action.danger{grid-column:1/-1}
        .selection-bar .bulk-selection-help,.selection-bar .bulk-selection-status{text-align:left}
      }
    </style>`;

  const script = `
    <script ${SCRIPT_MARKER}>
      (function () {
        const selectionBar = document.querySelector("[data-selection-bar]");
        const groupOpen = document.querySelector("[data-group-open]");
        if (!selectionBar || selectionBar.dataset.bulkSelectionEnhanced === "true") return;
        selectionBar.dataset.bulkSelectionEnhanced = "true";

        const icon = ${JSON.stringify({
          check: renderIcon("check", 16),
          undo: renderIcon("refresh-cw", 16),
          trash: renderIcon("trash-2", 16),
          group: renderIcon("layers", 16),
        })};

        const actions = document.createElement("span");
        actions.className = "bulk-selection-actions";
        actions.innerHTML =
          '<button type="button" class="ghost-btn bulk-selection-action" data-bulk-selection-action="reconcile">' + icon.check + '<span>Marcar como conciliado</span></button>' +
          '<button type="button" class="ghost-btn bulk-selection-action" data-bulk-selection-action="unreconcile">' + icon.undo + '<span>Desmarcar conciliado</span></button>' +
          '<button type="button" class="bulk-selection-action danger" data-bulk-selection-action="void">' + icon.trash + '<span>Excluir selecionados</span></button>';
        selectionBar.insertBefore(actions, groupOpen || null);

        const helpNode = document.createElement("span");
        helpNode.id = "bulk-selection-help";
        helpNode.className = "bulk-selection-help";
        helpNode.dataset.bulkSelectionHelp = "";
        helpNode.setAttribute("aria-live", "polite");
        selectionBar.appendChild(helpNode);

        const statusNode = document.createElement("span");
        statusNode.className = "bulk-selection-status";
        statusNode.dataset.bulkSelectionStatus = "";
        statusNode.setAttribute("aria-live", "polite");
        selectionBar.appendChild(statusNode);

        document.querySelectorAll("script[data-group]").forEach(function (node) {
          let group;
          try { group = JSON.parse(node.textContent || "{}"); } catch { return; }
          if (!group || !group.id || !Array.isArray(group.members)) return;
          const row = document.querySelector('[data-group-row="' + CSS.escape(group.id) + '"]');
          const indicator = row && row.querySelector(".col-select.group-indicator");
          if (!indicator || indicator.querySelector("input")) return;

          const label = document.createElement("label");
          label.className = "col-select";
          const input = document.createElement("input");
          input.type = "checkbox";
          input.value = group.id;
          input.dataset.selectTransaction = "";
          input.dataset.selectionEntity = "group";
          input.dataset.groupId = group.id;
          input.dataset.kind = group.kind || "";
          input.dataset.status = group.status || "";
          input.dataset.currency = group.currency || "BRL";
          input.dataset.amount = String((group.kind === "expense" ? -1 : 1) * Math.abs(Number(group.totalAmountMinor || 0)));
          input.dataset.memberCount = String(group.members.length);
          input.setAttribute("aria-label", "Selecionar agrupamento " + (group.description || "sem descrição") + ", " + group.members.length + " lançamentos");
          label.appendChild(input);
          indicator.replaceWith(label);

          const financialStatus = row.querySelector(".col-status");
          if (financialStatus && !row.querySelector("[data-transaction-group-state]")) {
            const groupedStatus = document.createElement("span");
            groupedStatus.className = "col-status grouped-status";
            financialStatus.classList.remove("col-status");
            financialStatus.replaceWith(groupedStatus);
            groupedStatus.appendChild(financialStatus);

            const groupState = document.createElement("span");
            const groupStateLabel = "Agrupamento com " + group.members.length + " lançamentos";
            groupState.className = "transaction-group-state";
            groupState.dataset.transactionGroupState = "";
            groupState.setAttribute("role", "img");
            groupState.setAttribute("aria-label", groupStateLabel);
            groupState.setAttribute("title", groupStateLabel);
            groupState.setAttribute("data-tooltip", groupStateLabel);
            groupState.tabIndex = 0;
            groupState.innerHTML = icon.group;
            groupedStatus.appendChild(groupState);
          }
        });

        function simpleInputs() {
          return Array.from(document.querySelectorAll('[data-select-transaction]:not([data-selection-entity="group"])'));
        }

        function groupInputs() {
          return Array.from(document.querySelectorAll('[data-select-transaction][data-selection-entity="group"]'));
        }

        function selectedSimple() {
          return simpleInputs().filter(function (input) { return input.checked; });
        }

        function selectedGroups() {
          return groupInputs().filter(function (input) { return input.checked; });
        }

        function selectedAll() {
          return selectedSimple().concat(selectedGroups());
        }

        function compatibleForGrouping(items) {
          return items.length >= 2 && items.every(function (item) {
            return item.dataset.kind === items[0].dataset.kind &&
              item.dataset.status === items[0].dataset.status &&
              item.dataset.currency === items[0].dataset.currency;
          });
        }

        function money(minor, currency) {
          return (Number(minor || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: currency || "BRL" });
        }

        function syncSelection() {
          const simple = selectedSimple();
          const groups = selectedGroups();
          const items = simple.concat(groups);
          const countNode = selectionBar.querySelector("[data-selection-count]");
          const totalNode = selectionBar.querySelector("[data-selection-total]");
          const transactionCount = items.reduce(function (sum, item) {
            return sum + Number(item.dataset.memberCount || 1);
          }, 0);
          selectionBar.hidden = items.length === 0;
          if (countNode) {
            countNode.textContent = items.length === transactionCount
              ? String(items.length)
              : items.length + " itens · " + transactionCount + " lançamentos";
          }
          if (totalNode) {
            totalNode.textContent = money(
              items.reduce(function (sum, item) { return sum + Number(item.dataset.amount || 0); }, 0),
              items[0] && items[0].dataset.currency || "BRL",
            );
          }

          if (groupOpen) {
            const canGroup = groups.length === 0 && compatibleForGrouping(simple);
            groupOpen.disabled = !canGroup;
            groupOpen.title = groups.length > 0
              ? "Desmarque os agrupamentos para unificar somente lançamentos simples."
              : simple.length > 1 && !canGroup
                ? "Selecione lançamentos do mesmo tipo, moeda e situação."
                : "";
            groupOpen.setAttribute("aria-describedby", helpNode.id);
          }

          const eligibleStatuses = items.every(function (item) {
            return item.dataset.status === "posted" || item.dataset.status === "reconciled";
          });
          const reconcileButton = actions.querySelector('[data-bulk-selection-action="reconcile"]');
          const unreconcileButton = actions.querySelector('[data-bulk-selection-action="unreconcile"]');
          const voidButton = actions.querySelector('[data-bulk-selection-action="void"]');
          const hasPosted = items.some(function (item) { return item.dataset.status === "posted"; });
          const hasReconciled = items.some(function (item) { return item.dataset.status === "reconciled"; });
          reconcileButton.disabled = items.length === 0 || !eligibleStatuses || !hasPosted;
          unreconcileButton.disabled = items.length === 0 || !eligibleStatuses || !hasReconciled;
          voidButton.disabled = items.length === 0;
          reconcileButton.title = eligibleStatuses ? "" : "Efetive os lançamentos previstos antes de conciliá-los.";
          unreconcileButton.title = eligibleStatuses ? "" : "Somente lançamentos efetivados ou conciliados podem ser alterados.";
          reconcileButton.setAttribute("aria-describedby", helpNode.id);
          unreconcileButton.setAttribute("aria-describedby", helpNode.id);
          voidButton.setAttribute("aria-describedby", helpNode.id);

          const explanations = [];
          if (groups.length > 0) {
            explanations.push("Unificar lançamentos indisponível: desmarque os agrupamentos para unificar somente lançamentos simples.");
          } else if (simple.length > 1 && !compatibleForGrouping(simple)) {
            explanations.push("Unificar lançamentos indisponível: selecione lançamentos do mesmo tipo, moeda e situação.");
          }
          if (items.length > 0 && !eligibleStatuses) {
            explanations.push("Conciliação indisponível: efetive os lançamentos previstos antes de alterar a conciliação.");
          } else if (items.length > 0) {
            if (!hasPosted) explanations.push("Marcar como conciliado indisponível: todos os lançamentos selecionados já estão conciliados.");
            if (!hasReconciled) explanations.push("Desmarcar conciliado indisponível: nenhum lançamento selecionado está conciliado.");
          }
          helpNode.textContent = explanations.join(" ");
        }

        simpleInputs().forEach(function (input) { input.addEventListener("change", syncSelection); });
        groupInputs().forEach(function (input) { input.addEventListener("change", syncSelection); });
        selectionBar.querySelector("[data-selection-clear]")?.addEventListener("click", function () {
          simpleInputs().concat(groupInputs()).forEach(function (input) { input.checked = false; });
          showStatus("", "");
          syncSelection();
        });

        actions.addEventListener("click", async function (event) {
          const button = event.target.closest("[data-bulk-selection-action]");
          if (!button || button.disabled) return;
          const action = button.dataset.bulkSelectionAction;
          const items = selectedAll();
          const transactionCount = items.reduce(function (sum, item) {
            return sum + Number(item.dataset.memberCount || 1);
          }, 0);
          const confirmation = action === "void"
            ? "Excluir logicamente " + transactionCount + " lançamentos selecionados? Os agrupamentos selecionados também serão removidos."
            : action === "reconcile"
              ? "Marcar " + transactionCount + " lançamentos selecionados como conciliados?"
              : "Desmarcar a conciliação de " + transactionCount + " lançamentos selecionados?";
          if (!window.confirm(confirmation)) return;

          setBusy(true);
          showStatus("Processando...", "");
          try {
            const response = await fetch("/api/transactions/bulk-actions", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                action: action,
                transactionIds: selectedSimple().map(function (input) { return input.value; }),
                groupIds: selectedGroups().map(function (input) { return input.dataset.groupId; })
              })
            });
            const body = await response.json().catch(function () { return {}; });
            if (!response.ok) {
              showStatus(body.error && body.error.message || "Não foi possível concluir a ação em massa.", "error");
              setBusy(false);
              syncSelection();
              return;
            }
            showStatus(
              action === "void"
                ? "Lançamentos excluídos. Atualizando..."
                : action === "reconcile"
                  ? "Lançamentos conciliados. Atualizando..."
                  : "Conciliação desmarcada. Atualizando...",
              "success",
            );
            window.setTimeout(function () { window.location.reload(); }, 350);
          } catch {
            showStatus("Não foi possível comunicar com o servidor. Verifique sua conexão e tente novamente.", "error");
            setBusy(false);
            syncSelection();
          }
        });

        function setBusy(busy) {
          actions.querySelectorAll("button").forEach(function (button) { button.disabled = busy; });
          if (groupOpen) groupOpen.disabled = busy;
          simpleInputs().concat(groupInputs()).forEach(function (input) { input.disabled = busy; });
          const clearButton = selectionBar.querySelector("[data-selection-clear]");
          if (clearButton) clearButton.disabled = busy;
        }

        function showStatus(message, tone) {
          statusNode.textContent = message || "";
          statusNode.className = "bulk-selection-status" + (tone ? " " + tone : "");
        }

        syncSelection();
      })();
    </script>`;

  return html.replace("</head>", `${styles}</head>`).replace("</body>", `${script}</body>`);
}
