const STYLE_MARKER = "data-transaction-group-member-form-guard";
const SCRIPT_MARKER = "data-transaction-group-member-form-controller";

export function enhanceTransactionGroupMemberFormGuard(html: string): string {
  if (
    !html.includes("data-group-modal") ||
    !html.includes("data-form") ||
    html.includes(STYLE_MARKER)
  ) {
    return html;
  }

  const styles = `
    <style ${STYLE_MARKER}>
      [data-group-member-context]{background:var(--bg);border:1px solid var(--line);border-radius:var(--radius);display:grid;gap:8px;grid-column:1/-1;padding:10px 12px}
      [data-group-member-context][hidden]{display:none}
      [data-group-member-context] strong{font-size:.875rem}
      [data-group-member-context] p{color:var(--muted);font-size:.75rem;margin:0}
      [data-group-member-context] dl{display:grid;gap:8px;grid-template-columns:repeat(4,minmax(0,1fr));margin:0}
      [data-group-member-context] dl div{min-width:0}
      [data-group-member-context] dt{color:var(--muted);font-size:.6875rem;font-weight:700;text-transform:uppercase}
      [data-group-member-context] dd{font-size:.8125rem;font-weight:700;margin:2px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      @media(max-width:760px){[data-group-member-context] dl{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:520px){[data-group-member-context] dl{grid-template-columns:1fr}}
    </style>`;

  const script = `
    <script ${SCRIPT_MARKER}>
      (function () {
        const groupModal = document.querySelector("[data-group-modal]");
        const groupForm = document.querySelector("[data-group-form]");
        const transactionModal = document.querySelector("[data-modal]");
        const transactionForm = document.querySelector("[data-form]");
        if (!groupModal || !groupForm || !transactionModal || !transactionForm) return;

        const context = document.createElement("section");
        context.dataset.groupMemberContext = "";
        context.hidden = true;
        context.innerHTML =
          '<strong data-group-member-context-title></strong>' +
          '<p data-group-member-context-help></p>' +
          '<dl>' +
            '<div><dt>Conta</dt><dd data-group-member-context-account></dd></div>' +
            '<div><dt>Tipo</dt><dd data-group-member-context-kind></dd></div>' +
            '<div><dt>Situação</dt><dd data-group-member-context-status></dd></div>' +
            '<div><dt>Moeda</dt><dd data-group-member-context-currency></dd></div>' +
          '</dl>';
        const accountField = transactionForm.querySelector('[name="accountId"]');
        transactionForm.insertBefore(context, accountField && accountField.nextSibling);

        function formatKind(value) {
          return value === "income" ? "Entrada" : value === "expense" ? "Saída" : value;
        }

        function formatStatus(value) {
          if (value === "reconciled") return "Conciliado";
          if (value === "posted") return "Efetivado";
          if (value === "planned") return "Previsto";
          return value || "—";
        }

        function moneyInput(minor) {
          return (Number(minor || 0) / 100).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          });
        }

        function moneyToMinor(value) {
          const normalized = String(value || "").replace(/\\./g, "").replace(",", ".");
          return Math.round(Number.parseFloat(normalized || "0") * 100);
        }

        function loadGroup(groupId) {
          const node = document.querySelector('script[data-group="' + CSS.escape(groupId) + '"]');
          if (!node) return undefined;
          try { return JSON.parse(node.textContent || "{}"); } catch { return undefined; }
        }

        function returnToGroup(group, message, tone) {
          if (!group) {
            window.location.reload();
            return;
          }
          document.dispatchEvent(new CustomEvent("solverfin:transaction-group:return", {
            detail: { group: group, message: message || "", tone: tone || "success" }
          }));
        }

        function control(name) {
          return transactionForm.elements.namedItem(name);
        }

        function label(name) {
          const field = control(name);
          return field && field.closest ? field.closest("label") : undefined;
        }

        function setField(name, hidden, disabled) {
          const field = control(name);
          const fieldLabel = label(name);
          if (fieldLabel) fieldLabel.hidden = hidden;
          if (field && "disabled" in field) field.disabled = disabled;
        }

        function setLabelText(name, text) {
          const fieldLabel = label(name);
          if (!fieldLabel) return;
          const textNode = Array.from(fieldLabel.childNodes).find(function (node) {
            return node.nodeType === 3;
          });
          if (!textNode) return;
          if (fieldLabel.dataset.groupOriginalText === undefined) {
            fieldLabel.dataset.groupOriginalText = textNode.textContent || "";
          }
          textNode.textContent = text;
        }

        function restoreLabelText(name) {
          const fieldLabel = label(name);
          if (!fieldLabel || fieldLabel.dataset.groupOriginalText === undefined) return;
          const textNode = Array.from(fieldLabel.childNodes).find(function (node) {
            return node.nodeType === 3;
          });
          if (textNode) textNode.textContent = fieldLabel.dataset.groupOriginalText;
          delete fieldLabel.dataset.groupOriginalText;
        }

        function setStatus(status) {
          const button = transactionForm.querySelector('[data-status-option="' + status + '"]');
          if (button) button.click();
          else if (transactionForm.status) transactionForm.status.value = status;
        }

        function clearMode() {
          delete transactionForm.dataset.groupMemberMode;
          delete transactionForm.dataset.groupId;
          delete transactionForm.dataset.memberId;
          delete transactionForm.dataset.groupReturnPending;
          context.hidden = true;
          [
            "kind",
            "plannedOn",
            "effectiveOn",
            "repeatMode",
            "destinationAccountId",
            "installments",
            "installmentStart",
            "installmentValueMode",
            "interval",
            "frequency",
            "endOn",
            "note"
          ].forEach(function (name) { setField(name, false, false); });
          restoreLabelText("plannedOn");
          const statusIcons = transactionForm.querySelector(".status-icons");
          if (statusIcons) statusIcons.hidden = false;
          transactionForm.querySelectorAll("[data-status-option]").forEach(function (button) {
            button.disabled = false;
            button.removeAttribute("aria-disabled");
          });
          const submit = transactionForm.querySelector('[type="submit"]');
          if (submit) {
            submit.disabled = false;
            submit.textContent = "Salvar lançamento";
          }
        }

        function applyMode(group, member, clone) {
          transactionForm.dataset.groupMemberMode = clone ? "clone" : "edit";
          transactionForm.dataset.groupId = group.id;
          transactionForm.dataset.memberId = member.id;
          transactionForm.dataset.groupReturnPending = "true";
          context.hidden = false;
          context.querySelector("[data-group-member-context-title]").textContent = clone
            ? "Clonagem de lançamento do agrupamento"
            : "Edição de lançamento do agrupamento";
          context.querySelector("[data-group-member-context-help]").textContent = clone
            ? "O clone será único, manual e independente. Tipo, situação, moeda, conta e repetição não podem ser alterados."
            : "Somente descrição, data, valor e categoria podem ser alterados.";
          const accountName = document.querySelector("[data-account-picker] .account-select-text");
          context.querySelector("[data-group-member-context-account]").textContent =
            accountName && accountName.textContent ? accountName.textContent.trim() : "Conta selecionada";
          context.querySelector("[data-group-member-context-kind]").textContent = formatKind(member.kind);
          context.querySelector("[data-group-member-context-status]").textContent = formatStatus(
            clone ? (member.effectiveOn ? "posted" : "planned") : member.status,
          );
          context.querySelector("[data-group-member-context-currency]").textContent =
            member.currency || group.currency || "BRL";

          [
            "kind",
            "effectiveOn",
            "repeatMode",
            "destinationAccountId",
            "installments",
            "installmentStart",
            "installmentValueMode",
            "interval",
            "frequency",
            "endOn",
            "note"
          ].forEach(function (name) { setField(name, true, true); });
          setField("plannedOn", false, false);
          setLabelText("plannedOn", "Data");
          const statusIcons = transactionForm.querySelector(".status-icons");
          if (statusIcons) statusIcons.hidden = true;
          transactionForm.querySelectorAll("[data-status-option]").forEach(function (button) {
            button.disabled = true;
            button.setAttribute("aria-disabled", "true");
          });
          const submit = transactionForm.querySelector('[type="submit"]');
          if (submit) submit.textContent = clone ? "Clonar lançamento" : "Salvar alterações";
        }

        function openFlow(group, member, clone) {
          groupModal.close();
          transactionForm.reset();
          transactionForm.dataset.path =
            "/api/transaction-groups/" +
            encodeURIComponent(group.id) +
            "/members/" +
            encodeURIComponent(member.id) +
            (clone ? "/clone" : "");
          transactionForm.dataset.method = clone ? "POST" : "PATCH";
          transactionForm.kind.value = member.kind;
          transactionForm.amountMinor.value = moneyInput(member.amountMinor);
          transactionForm.plannedOn.value =
            member.effectiveOn || member.plannedOn || member.occurredOn || "";
          transactionForm.effectiveOn.value = "";
          transactionForm.repeatMode.value = "single";
          transactionForm.destinationAccountId.value = "";
          transactionForm.categoryId.value = member.categoryId || "";
          transactionForm.description.value = clone ? "Cópia de " + member.description : member.description;
          setStatus(clone ? (member.effectiveOn ? "posted" : "planned") : member.status);
          transactionForm.kind.dispatchEvent(new Event("change", { bubbles: true }));
          applyMode(group, member, clone);
          const title = document.querySelector("[data-modal-title]");
          if (title) title.textContent = clone ? "Clonar lançamento" : "Editar lançamento";
          transactionModal.showModal();
        }

        document.addEventListener("click", function (event) {
          const button = event.target.closest(
            '[data-group-members] [data-member-action="edit"], [data-group-members] [data-member-action="clone"]',
          );
          if (!button) return;
          const groupId = groupForm.dataset.groupId;
          const group = groupId ? loadGroup(groupId) : undefined;
          const member = group && group.members.find(function (candidate) {
            return candidate.id === button.dataset.memberId;
          });
          if (!group || !member) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          openFlow(group, member, button.dataset.memberAction === "clone");
        }, true);

        transactionForm.addEventListener("reset", clearMode);
        document.addEventListener("submit", async function (event) {
          if (event.target !== transactionForm) return;
          const mode = transactionForm.dataset.groupMemberMode;
          if (!mode) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          const groupId = transactionForm.dataset.groupId;
          const formStatus = transactionForm.querySelector(".form-status");
          const submit = transactionForm.querySelector('[type="submit"]');
          if (submit) submit.disabled = true;
          if (formStatus) {
            formStatus.className = "form-status muted full";
            formStatus.textContent = mode === "clone" ? "Clonando..." : "Salvando...";
          }

          try {
            const response = await fetch(transactionForm.dataset.path, {
              method: transactionForm.dataset.method || (mode === "clone" ? "POST" : "PATCH"),
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                amountMinor: moneyToMinor(transactionForm.amountMinor.value),
                date: transactionForm.plannedOn.value,
                description: transactionForm.description.value,
                categoryId: transactionForm.categoryId.value || null
              })
            });
            const responseBody = await response.json().catch(function () { return {}; });
            if (!response.ok) {
              if (formStatus) {
                formStatus.className = "form-status error full";
                formStatus.textContent =
                  responseBody.error && responseBody.error.message ||
                  "Não foi possível concluir a ação.";
              }
              return;
            }

            const group = responseBody.group || (groupId ? loadGroup(groupId) : undefined);
            delete transactionForm.dataset.groupReturnPending;
            transactionModal.close();
            returnToGroup(
              group,
              mode === "clone" ? "Lançamento clonado." : "Lançamento atualizado.",
              "success",
            );
          } catch {
            if (formStatus) {
              formStatus.className = "form-status error full";
              formStatus.textContent =
                "Não foi possível comunicar com o servidor. Verifique sua conexão e tente novamente.";
            }
          } finally {
            if (submit) submit.disabled = false;
          }
        }, true);

        transactionModal.addEventListener("close", function () {
          const shouldReturn = transactionForm.dataset.groupReturnPending === "true";
          const groupId = transactionForm.dataset.groupId;
          const group = shouldReturn && groupId ? loadGroup(groupId) : undefined;
          if (transactionForm.dataset.groupMemberMode) clearMode();
          if (shouldReturn) returnToGroup(group, "", "success");
        });
      })();
    </script>`;

  return html.replace("</head>", `${styles}</head>`).replace("</body>", `${script}</body>`);
}
