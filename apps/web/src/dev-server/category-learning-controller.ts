import { icon } from "./icons.js";

export function categoryLearningControllerScript(): string {
  const applyIcon = JSON.stringify(icon("play", 14));
  const ignoreIcon = JSON.stringify(icon("archive", 13));
  const revertIcon = JSON.stringify(icon("refresh-cw", 13));
  const correctIcon = JSON.stringify(icon("tag", 13));

  return `
    <script>
      (() => {
        const applyIcon = ${applyIcon};
        const ignoreIcon = ${ignoreIcon};
        const revertIcon = ${revertIcon};
        const correctIcon = ${correctIcon};

        function apiUrl(path) {
          const url = new URL(path, window.location.origin);
          const profileId = new URLSearchParams(window.location.search).get("profileId");
          if (profileId) url.searchParams.set("profileId", profileId);
          return url;
        }

        async function readJson(path) {
          const response = await fetch(apiUrl(path));
          if (!response.ok) throw new Error("request_failed");
          return response.json();
        }

        async function postJson(path, body) {
          const response = await fetch(apiUrl(path), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload?.error?.message || "Não foi possível concluir a ação.");
          }
          return payload;
        }

        function categoryKindLabel(kind) {
          if (kind === "income") return "Receita";
          if (kind === "expense") return "Despesa";
          if (kind === "transfer") return "Transferência";
          return kind || "Lançamento";
        }

        function learningStatusLabel(status) {
          if (status === "active") return "Ativo";
          if (status === "ignored") return "Ignorado";
          if (status === "reverted") return "Revertido";
          return status || "-";
        }

        async function initSettingsLearning() {
          if (window.location.pathname !== "/configuracoes") return;
          const section = new URLSearchParams(window.location.search).get("section") || "profiles";
          if (section !== "rules") return;
          const main = document.querySelector("main");
          if (!main || main.querySelector("[data-category-learning-panel]")) return;

          const panel = document.createElement("section");
          panel.className = "panel settings-section-panel";
          panel.dataset.categoryLearningPanel = "";
          panel.innerHTML =
            '<div class="page-heading secondary-heading">' +
              '<div><h2>Aprendizado por correções</h2><p class="muted">Correções confirmadas podem ajudar em lançamentos semelhantes do mesmo perfil.</p></div>' +
              '<button type="button" data-apply-categorization aria-label="Aplicar categorização às sugestões pendentes" title="Aplicar categorização às sugestões pendentes">' + applyIcon + ' Aplicar</button>' +
            '</div>' +
            '<p class="form-status" data-learning-status aria-live="polite"></p>' +
            '<div class="rows maintenance-rows" data-learning-list></div>';
          main.appendChild(panel);

          panel.addEventListener("click", async (event) => {
            const target = event.target instanceof Element ? event.target.closest("button") : null;
            if (!target) return;
            const status = panel.querySelector("[data-learning-status]");

            if (target.matches("[data-apply-categorization]")) {
              target.disabled = true;
              if (status) status.textContent = "Aplicando categorização...";
              try {
                const result = await postJson("/api/category-learning/apply");
                if (status) status.textContent = String(result.created || 0) + " sugestão(ões) criada(s) para revisão.";
              } catch (error) {
                if (status) status.textContent = error instanceof Error ? error.message : "Não foi possível aplicar a categorização.";
              } finally {
                target.disabled = false;
              }
              return;
            }

            const entryId = target.dataset.learningEntryId;
            const action = target.dataset.learningAction;
            if (!entryId || (action !== "ignore" && action !== "revert")) return;
            const confirmation = action === "ignore"
              ? "Ignorar este aprendizado nas próximas sugestões?"
              : "Reverter este aprendizado nas próximas sugestões?";
            if (!window.confirm(confirmation)) return;

            target.disabled = true;
            try {
              await postJson("/api/category-learning/" + encodeURIComponent(entryId) + "/" + action);
              if (status) status.textContent = action === "ignore" ? "Aprendizado ignorado." : "Aprendizado revertido.";
              await renderLearningRows(panel);
            } catch (error) {
              if (status) status.textContent = error instanceof Error ? error.message : "Não foi possível atualizar o aprendizado.";
              target.disabled = false;
            }
          });

          await renderLearningRows(panel);
        }

        async function renderLearningRows(panel) {
          const list = panel.querySelector("[data-learning-list]");
          const status = panel.querySelector("[data-learning-status]");
          if (!list) return;
          list.replaceChildren();

          try {
            const [learningBody, categoriesBody] = await Promise.all([
              readJson("/api/category-learning?status=all"),
              readJson("/api/categories"),
            ]);
            const entries = Array.isArray(learningBody.entries) ? learningBody.entries : [];
            const categories = Array.isArray(categoriesBody.categories) ? categoriesBody.categories : [];
            const categoryNames = new Map(categories.map((category) => [category.id, category.name]));

            if (entries.length === 0) {
              const empty = document.createElement("p");
              empty.className = "muted";
              empty.textContent = "Nenhuma correção aprendida neste perfil.";
              list.appendChild(empty);
              return;
            }

            for (const entry of entries) {
              const row = document.createElement("article");
              row.className = "maintenance-item";
              const summary = document.createElement("div");
              summary.className = "maintenance-summary";
              const summaryInner = document.createElement("div");
              const title = document.createElement("strong");
              title.textContent = entry.merchantKey || "Padrão de lançamento";
              const detail = document.createElement("span");
              const categoryName = categoryNames.get(entry.categoryId) || "Categoria indisponível";
              detail.textContent = categoryKindLabel(entry.transactionKind) + " - " + categoryName + " - " + String(entry.correctionCount || 1) + " correção(ões) - " + learningStatusLabel(entry.status);
              summaryInner.append(title, detail);
              summary.appendChild(summaryInner);
              row.appendChild(summary);

              if (entry.status === "active") {
                const actions = document.createElement("div");
                actions.className = "maintenance-actions";
                actions.setAttribute("aria-label", "Ações do aprendizado");
                const ignoreButton = document.createElement("button");
                ignoreButton.type = "button";
                ignoreButton.className = "secondary-button";
                ignoreButton.dataset.learningEntryId = entry.id;
                ignoreButton.dataset.learningAction = "ignore";
                ignoreButton.title = "Ignorar este aprendizado";
                ignoreButton.innerHTML = ignoreIcon + " Ignorar";
                const revertButton = document.createElement("button");
                revertButton.type = "button";
                revertButton.className = "secondary-button";
                revertButton.dataset.learningEntryId = entry.id;
                revertButton.dataset.learningAction = "revert";
                revertButton.title = "Reverter este aprendizado";
                revertButton.innerHTML = revertIcon + " Reverter";
                actions.append(ignoreButton, revertButton);
                row.appendChild(actions);
              }

              list.appendChild(row);
            }
          } catch {
            if (status) status.textContent = "Não foi possível carregar os aprendizados deste perfil.";
          }
        }

        function originLabel(item) {
          const provider = typeof item.provider === "string" ? item.provider : "";
          if (provider.startsWith("solverfin-learning")) return "correção anterior";
          if (provider.startsWith("solverfin-history")) return "histórico";
          if (provider.startsWith("solverfin-automation")) return "regra";
          if (provider.startsWith("solverfin-categorization")) return "revisão manual";
          if (item.kind === "categorization") return "IA";
          if (item.origin === "rule") return "regra";
          if (item.origin === "automation") return "regra";
          if (item.origin === "ai") return "IA";
          return undefined;
        }

        function findSuggestionRow(id) {
          const reviewRow = document.querySelector('[data-review-id="' + CSS.escape(id) + '"]');
          if (reviewRow) return reviewRow;
          const action = document.querySelector('[data-api-path*="/api/ai-review-queue/' + CSS.escape(id) + '/"]');
          return action?.closest("article.maintenance-item");
        }

        function updateSuggestionOrigin(row, label) {
          if (!row || !label) return;
          const detail = row.querySelector(".maintenance-summary span");
          if (!detail || !detail.textContent) return;
          detail.textContent = detail.textContent.replace(
            /origem .*?([·-]) confiança /,
            "origem " + label + " $1 confiança ",
          );
        }

        async function initInboxLearning() {
          if (window.location.pathname !== "/inbox") return;
          try {
            const [queueBody, categoriesBody] = await Promise.all([
              readJson("/api/ai-review-queue?status=pending_review&includeLowConfidence=true"),
              readJson("/api/categories"),
            ]);
            const suggestions = Array.isArray(queueBody.suggestions) ? queueBody.suggestions : [];
            const categories = Array.isArray(categoriesBody.categories) ? categoriesBody.categories : [];

            for (const item of suggestions) {
              const row = findSuggestionRow(item.id);
              if (!row) continue;
              updateSuggestionOrigin(row, originLabel(item));

              if (item.kind !== "transaction_extraction" || item.origin === "import") continue;
              const transactionKind = item.proposedTransaction?.kind;
              if (!transactionKind) continue;
              const compatibleCategories = categories.filter(
                (category) => category.status === "active" && category.kind === transactionKind,
              );
              if (compatibleCategories.length === 0) continue;
              const actions = row.querySelector(".maintenance-actions");
              if (!actions || actions.querySelector("[data-correct-and-approve]")) continue;

              const button = document.createElement("button");
              button.type = "button";
              button.className = "secondary-button";
              button.dataset.correctAndApprove = item.id;
              button.title = "Escolher outra categoria e aprovar";
              button.innerHTML = correctIcon + " Corrigir e aprovar";
              button.addEventListener("click", () => openCorrectionDialog(item, compatibleCategories));
              actions.prepend(button);
            }
          } catch {
            // A Inbox continua operável mesmo se o enriquecimento de aprendizado falhar.
          }
        }

        function observeInboxReviewQueue() {
          if (window.location.pathname !== "/inbox") return;
          const observer = new MutationObserver((mutations) => {
            const insertedReviewCard = mutations.some((mutation) =>
              Array.from(mutation.addedNodes).some(
                (node) =>
                  node instanceof Element &&
                  (node.matches("[data-review-id]") ||
                    Boolean(node.querySelector("[data-review-id]"))),
              ),
            );
            if (insertedReviewCard) void initInboxLearning();
          });
          observer.observe(document.body, { childList: true, subtree: true });
        }

        function openCorrectionDialog(item, categories) {
          const previous = document.querySelector("[data-category-correction-dialog]");
          previous?.remove();
          const dialog = document.createElement("dialog");
          dialog.className = "master-dialog";
          dialog.dataset.categoryCorrectionDialog = "";
          dialog.setAttribute("aria-labelledby", "category-correction-title");

          const closeForm = document.createElement("form");
          closeForm.method = "dialog";
          closeForm.className = "dialog-close-form";
          const closeButton = document.createElement("button");
          closeButton.type = "submit";
          closeButton.className = "secondary-button";
          closeButton.textContent = "Fechar";
          closeForm.appendChild(closeButton);

          const heading = document.createElement("div");
          heading.className = "dialog-heading";
          const title = document.createElement("h2");
          title.id = "category-correction-title";
          title.textContent = "Corrigir categoria";
          heading.appendChild(title);

          const form = document.createElement("form");
          form.className = "edit-grid";
          const label = document.createElement("label");
          label.textContent = "Categoria";
          const select = document.createElement("select");
          select.required = true;
          for (const category of categories) {
            const option = document.createElement("option");
            option.value = category.id;
            option.textContent = category.name;
            if (item.proposedTransaction?.categoryId === category.id) option.selected = true;
            select.appendChild(option);
          }
          label.appendChild(select);
          const status = document.createElement("p");
          status.className = "form-status";
          status.setAttribute("aria-live", "polite");
          const submit = document.createElement("button");
          submit.type = "submit";
          submit.innerHTML = correctIcon + " Corrigir e aprovar";
          form.append(label, status, submit);
          form.addEventListener("submit", async (event) => {
            event.preventDefault();
            submit.disabled = true;
            status.textContent = "Salvando correção...";
            try {
              await postJson("/api/ai-review-queue/" + encodeURIComponent(item.id) + "/approve", {
                payloadOverride: { categoryId: select.value },
              });
              dialog.close();
              window.location.reload();
            } catch (error) {
              status.textContent = error instanceof Error ? error.message : "Não foi possível salvar a correção.";
              submit.disabled = false;
            }
          });

          dialog.append(closeForm, heading, form);
          document.body.appendChild(dialog);
          dialog.addEventListener("close", () => dialog.remove(), { once: true });
          dialog.showModal();
          select.focus();
        }

        void initSettingsLearning();
        void initInboxLearning();
        observeInboxReviewQueue();
      })();
    </script>
  `;
}
