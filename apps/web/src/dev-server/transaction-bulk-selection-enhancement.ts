import { icon as renderIcon } from "./icons.js";
import { renderStatementStatusActionIcon } from "./statement-status.js";

const STYLE_MARKER = "data-transaction-bulk-selection-enhancement";
const SCRIPT_MARKER = "data-transaction-bulk-selection-controller";

function renderBulkSelectionActionIcon(
  name: "trash-2" | "layers" | "x",
  tone: "neutral" | "danger",
): string {
  return `<span class="statement-status bulk-icon-${tone}" aria-hidden="true">${renderIcon(name, 15)}</span>`;
}

export function enhanceTransactionBulkSelection(html: string): string {
  if (!html.includes("data-selection-bar") || html.includes(STYLE_MARKER)) return html;

  const styles = `
    <style ${STYLE_MARKER}>
      .selection-bar .bulk-selection-actions{align-items:center;display:flex;flex-wrap:wrap;gap:7px}
      .selection-bar .bulk-selection-actions button.bulk-icon-action{align-items:center;background:transparent;border:0;border-radius:999px;box-sizing:border-box;cursor:pointer;display:inline-flex;flex:0 0 44px;height:44px;justify-content:center;min-height:44px;min-width:44px;padding:0;width:44px}
      .selection-bar .bulk-icon-action>.statement-status{box-sizing:border-box;flex:0 0 26px;height:26px;width:26px}
      .selection-bar .bulk-icon-action>.statement-status svg{display:block;height:15px;width:15px}
      .selection-bar .bulk-icon-action>.statement-status-ok{background:var(--sf-color-success-surface);border-color:var(--sf-color-success-border);color:var(--sf-color-success)}
      .selection-bar .bulk-icon-action>.statement-status-posted{background:var(--sf-color-neutral-control-hover);border-color:var(--sf-color-line);color:var(--sf-color-muted-text)}
      .selection-bar .bulk-icon-action>.bulk-icon-neutral{background:var(--sf-color-neutral-control-hover);border-color:var(--sf-color-line);color:var(--primary)}
      .selection-bar .bulk-icon-action>.bulk-icon-danger{background:var(--danger-bg);border-color:var(--danger);color:var(--danger)}
      .selection-bar .bulk-selection-actions button.bulk-icon-action:hover:not(:disabled),.selection-bar .bulk-selection-actions button.bulk-icon-action:focus-visible{background:transparent;border-color:transparent}
      .selection-bar .bulk-selection-actions button.bulk-icon-action:hover:not(:disabled)>.statement-status,.selection-bar .bulk-selection-actions button.bulk-icon-action:focus-visible>.statement-status{box-shadow:0 0 0 2px var(--neutral-control-border-hover)}
      .selection-bar .bulk-selection-actions button.bulk-icon-action.danger:hover:not(:disabled)>.statement-status,.selection-bar .bulk-selection-actions button.bulk-icon-action.danger:focus-visible>.statement-status{box-shadow:0 0 0 2px var(--danger)}
      .selection-bar .bulk-icon-action:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
      .selection-bar .bulk-icon-action.danger:focus-visible{outline-color:var(--danger)}
      .selection-bar .bulk-icon-action:disabled{cursor:not-allowed;opacity:.55}
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
    </style>`;

  const script = `
    <script ${SCRIPT_MARKER}>
      (function () {
        const selectionBar = document.querySelector("[data-selection-bar]");
        const groupOpen = document.querySelector("[data-group-open]");
        if (!selectionBar || selectionBar.dataset.bulkSelectionEnhanced === "true") return;
        selectionBar.dataset.bulkSelectionEnhanced = "true";

        const icon = ${JSON.stringify({
          reconcile: renderStatementStatusActionIcon("reconciled"),
          unreconcile: renderStatementStatusActionIcon("posted"),
          trash: renderBulkSelectionActionIcon("trash-2", "danger"),
          groupAction: renderBulkSelectionActionIcon("layers", "neutral"),
          clear: renderBulkSelectionActionIcon("x", "neutral"),
          group: renderIcon("layers", 16),
        })};

        function updateTooltip(button, label, reason) {
          if (!button) return;
          const tooltip = reason ? label + ": " + reason : label;
          button.title = tooltip;
          button.setAttribute("data-tooltip", tooltip);
        }

        function decorateIconButton(button, label, glyph, danger) {
          button.type = "button";
          button.classList.remove("ghost-btn");
          button.classList.add("bulk-icon-action");
          if (danger) {
            button.classList.add("danger");
          } else {
            button.setAttribute("data-button-variant", "neutral");
          }
          button.setAttribute("aria-label", label);
          updateTooltip(button, label, "");
          button.innerHTML = glyph;
          return button;
        }

        function createIconButton(action, label, glyph, danger) {
          const button = document.createElement("button");
          button.dataset.bulkSelectionAction = action;
          return decorateIconButton(button, label, glyph, danger);
        }

        const actions = document.createElement("span");
        actions.className = "bulk-selection-actions";
        actions.setAttribute("role", "group");
        actions.setAttribute("aria-label", "Ações dos lançamentos selecionados");
        selectionBar.insertBefore(actions, groupOpen || null);
        actions.appendChild(createIconButton("reconcile", "Marcar como conciliado", icon.reconcile, false));
        actions.appendChild(createIconButton("unreconcile", "Desmarcar conciliado", icon.unreconcile, false));
        if (groupOpen) actions.appendChild(decorateIconButton(groupOpen, "Unificar lançamentos", icon.groupAction, false));
        const clearButton = selectionBar.querySelector("[data-selection-clear]");
        if (clearButton) actions.appendChild(decorateIconButton(clearButton, "Limpar seleção", icon.clear, false));
        actions.appendChild(createIconButton("void", "Excluir selecionados", icon.trash, true));

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
          input.dataset.reconcileProtected = String(group.reconcileProtected === true ||
            group.members.some(function (member) {
              return member.reconcileProtected === true || member.source === "account_remuneration" ||
                Boolean(member.cardId || member.invoiceId);
            }));
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
            groupState.className = "statement-status transaction-group-state";
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
            updateTooltip(groupOpen, "Unificar lançamentos", groups.length > 0
              ? "Desmarque os agrupamentos para unificar somente lançamentos simples."
              : simple.length > 1 && !canGroup
                ? "Selecione lançamentos do mesmo tipo, moeda e situação."
                : !canGroup ? "Selecione pelo menos dois lançamentos do mesmo tipo, moeda e situação." : "");
            groupOpen.setAttribute("aria-describedby", helpNode.id);
          }

          const hasProtected = items.some(function (item) {
            return item.dataset.reconcileProtected === "true";
          });
          const eligibleStatuses = !hasProtected && items.every(function (item) {
            return item.dataset.status === "planned" ||
              item.dataset.status === "posted" ||
              item.dataset.status === "reconciled";
          });
          const reconcileButton = actions.querySelector('[data-bulk-selection-action="reconcile"]');
          const unreconcileButton = actions.querySelector('[data-bulk-selection-action="unreconcile"]');
          const voidButton = actions.querySelector('[data-bulk-selection-action="void"]');
          const hasReconcileTarget = items.some(function (item) {
            return item.dataset.status === "planned" || item.dataset.status === "posted";
          });
          const hasReconciled = items.some(function (item) { return item.dataset.status === "reconciled"; });
          reconcileButton.disabled = items.length === 0 || !eligibleStatuses || !hasReconcileTarget;
          unreconcileButton.disabled = items.length === 0 || !eligibleStatuses || !hasReconciled;
          voidButton.disabled = items.length === 0;
          updateTooltip(reconcileButton, "Marcar como conciliado", hasProtected
            ? "Conciliação de remuneração automática exige seu fluxo próprio."
            : !eligibleStatuses
              ? "Sugestões não confirmadas e lançamentos excluídos não podem ser conciliados."
              : hasReconcileTarget ? "" : "Todos os lançamentos selecionados já estão conciliados.");
          updateTooltip(unreconcileButton, "Desmarcar conciliado", hasProtected
            ? "Conciliação de remuneração automática exige seu fluxo próprio."
            : !eligibleStatuses
              ? "Esta seleção contém lançamentos com situação indisponível."
              : hasReconciled ? "" : "Nenhum lançamento selecionado está conciliado.");
          reconcileButton.setAttribute("aria-describedby", helpNode.id);
          unreconcileButton.setAttribute("aria-describedby", helpNode.id);
          voidButton.setAttribute("aria-describedby", helpNode.id);
          if (clearButton) clearButton.setAttribute("aria-describedby", helpNode.id);

          const explanations = [];
          if (groups.length > 0) {
            explanations.push("Unificar lançamentos indisponível: desmarque os agrupamentos para unificar somente lançamentos simples.");
          } else if (simple.length > 1 && !compatibleForGrouping(simple)) {
            explanations.push("Unificar lançamentos indisponível: selecione lançamentos do mesmo tipo, moeda e situação.");
          }
          if (items.length > 0 && hasProtected) {
            explanations.push("Conciliação indisponível: remuneração automática exige seu fluxo próprio.");
          } else if (items.length > 0 && !eligibleStatuses) {
            explanations.push("Conciliação indisponível: a seleção contém sugestões não confirmadas ou lançamentos excluídos.");
          } else if (items.length > 0) {
            if (!hasReconcileTarget) explanations.push("Marcar como conciliado indisponível: todos os lançamentos selecionados já estão conciliados.");
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
          selectionBar.setAttribute("aria-busy", String(busy));
          actions.querySelectorAll("button").forEach(function (button) { button.disabled = busy; });
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
