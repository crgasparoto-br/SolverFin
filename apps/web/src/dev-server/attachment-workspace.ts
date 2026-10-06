export type OperationalAttachmentEntityKind = "transaction" | "invoice" | "import_batch";

export function renderAttachmentWorkspace(input: {
  entityKind: OperationalAttachmentEntityKind;
  entityId?: string;
  title?: string;
  className?: string;
}): string {
  const title = input.title ?? "Anexos";
  const entityId = input.entityId ?? "";
  return `
    <section class="attachment-workspace ${escapeHtml(input.className ?? "")}" data-attachment-workspace data-entity-kind="${escapeHtml(input.entityKind)}" data-entity-id="${escapeHtml(entityId)}" ${entityId ? "" : "hidden"}>
      <div class="section-heading">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p class="muted small-note">Adicione comprovantes, faturas, extratos, recibos ou contratos relacionados a este registro.</p>
        </div>
      </div>
      <div data-attachment-list class="attachment-list" aria-live="polite"></div>
      <form data-attachment-form class="edit-grid attachment-form">
        <label>Tipo
          <select name="kind" required>
            <option value="receipt">Comprovante/recibo</option>
            <option value="invoice">Fatura</option>
            <option value="statement">Extrato</option>
            <option value="contract">Contrato</option>
            <option value="message">Mensagem</option>
            <option value="other">Outro</option>
          </select>
        </label>
        <label class="full-span">Arquivo
          <input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv,.xls,.xlsx,.docx,application/pdf,image/jpeg,image/png,image/webp,text/plain,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
          <small>Até 5 MiB. O arquivo fica privado e só pode ser aberto no perfil autorizado.</small>
        </label>
        <div class="dialog-actions full-span">
          <button type="submit" class="secondary-button">Adicionar anexo</button>
        </div>
      </form>
      <p data-attachment-status class="form-status muted" role="status" aria-live="polite"></p>
    </section>
  `;
}

export function attachmentWorkspaceScript(): string {
  return `
    <script>
      (() => {
        if (window.SolverFinAttachments) return;

        const MAX_BYTES = 5 * 1024 * 1024;
        const initialized = new WeakSet();

        const escapeHtml = (value) => String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");

        const withProfile = (path) => {
          const profileId = new URL(window.location.href).searchParams.get("profileId");
          if (!profileId) return path;
          return path + (path.includes("?") ? "&" : "?") + "profileId=" + encodeURIComponent(profileId);
        };

        const messageFrom = async (response, fallback) => {
          const body = await response.json().catch(() => ({}));
          if (response.ok) return body;
          throw new Error(body?.error?.message || fallback);
        };

        const setStatus = (workspace, message, kind = "muted") => {
          const node = workspace.querySelector("[data-attachment-status]");
          if (!node) return;
          node.textContent = message;
          node.className = "form-status " + kind;
        };

        const formatSize = (bytes) => {
          const value = Number(bytes || 0);
          if (value < 1024) return value + " B";
          if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KiB";
          return (value / (1024 * 1024)).toFixed(1) + " MiB";
        };

        const kindLabel = (kind) => ({
          receipt: "Comprovante/recibo",
          invoice: "Fatura",
          statement: "Extrato",
          contract: "Contrato",
          message: "Mensagem",
          other: "Outro"
        })[kind] || "Anexo";

        const render = (workspace, attachments) => {
          const list = workspace.querySelector("[data-attachment-list]");
          if (!list) return;
          list.innerHTML = attachments.length
            ? attachments.map((item) => {
                const contentPath = withProfile("/api/attachments/" + encodeURIComponent(item.id) + "/content");
                return '<article class="maintenance-item attachment-item">' +
                  '<div class="maintenance-summary"><div><strong>' + escapeHtml(item.fileName) + '</strong>' +
                  '<span>' + escapeHtml(kindLabel(item.kind)) + ' · ' + escapeHtml(formatSize(item.byteSize)) + '</span></div></div>' +
                  '<div class="maintenance-actions">' +
                  '<a class="secondary-button button-link" href="' + escapeHtml(contentPath) + '" target="_blank" rel="noopener">Abrir</a>' +
                  '<button type="button" class="secondary-button danger-action" data-delete-attachment="' + escapeHtml(item.id) + '">Excluir</button>' +
                  '</div></article>';
              }).join("")
            : '<div class="empty-state"><strong>Nenhum anexo.</strong><p class="muted">Adicione um arquivo relacionado a este registro.</p></div>';

          list.querySelectorAll("[data-delete-attachment]").forEach((button) => {
            button.addEventListener("click", async () => {
              if (!window.confirm("Excluir este anexo? Ele deixará de ficar disponível para abertura.")) return;
              button.disabled = true;
              setStatus(workspace, "Excluindo anexo...");
              try {
                const response = await fetch(withProfile("/api/attachments/" + encodeURIComponent(button.dataset.deleteAttachment)), {
                  method: "DELETE",
                  headers: { accept: "application/json" }
                });
                await messageFrom(response, "Não foi possível excluir o anexo.");
                setStatus(workspace, "Anexo excluído.", "success");
                await refresh(workspace);
              } catch (error) {
                setStatus(workspace, error.message || "Não foi possível excluir o anexo.", "error");
              } finally {
                button.disabled = false;
              }
            });
          });
        };

        const refresh = async (workspace) => {
          const entityKind = workspace.dataset.entityKind || "";
          const entityId = workspace.dataset.entityId || "";
          workspace.hidden = !entityId;
          if (!entityId) return;

          setStatus(workspace, "Carregando anexos...");
          try {
            const response = await fetch(withProfile(
              "/api/attachments?linkedEntityKind=" + encodeURIComponent(entityKind) +
              "&linkedEntityId=" + encodeURIComponent(entityId)
            ), { headers: { accept: "application/json" } });
            const body = await messageFrom(response, "Não foi possível carregar os anexos.");
            render(workspace, Array.isArray(body.attachments) ? body.attachments : []);
            setStatus(workspace, "");
          } catch (error) {
            setStatus(workspace, error.message || "Não foi possível carregar os anexos.", "error");
          }
        };

        const fileAsBase64 = (file) => new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
          reader.onload = () => {
            const result = String(reader.result || "");
            resolve(result.includes(",") ? result.slice(result.indexOf(",") + 1) : result);
          };
          reader.readAsDataURL(file);
        });

        const initialize = (workspace) => {
          if (initialized.has(workspace)) return;
          initialized.add(workspace);
          const form = workspace.querySelector("[data-attachment-form]");
          form?.addEventListener("submit", async (event) => {
            event.preventDefault();
            const file = form.elements.file?.files?.[0];
            const entityId = workspace.dataset.entityId || "";
            if (!file || !entityId) return;
            if (file.size <= 0) {
              setStatus(workspace, "Selecione um arquivo com conteúdo.", "error");
              return;
            }
            if (file.size > MAX_BYTES) {
              setStatus(workspace, "O arquivo excede o limite de 5 MiB.", "error");
              return;
            }

            const submit = form.querySelector('[type="submit"]');
            if (submit) submit.disabled = true;
            setStatus(workspace, "Enviando anexo...");
            try {
              const contentBase64 = await fileAsBase64(file);
              const response = await fetch(withProfile("/api/attachments"), {
                method: "POST",
                headers: { "content-type": "application/json", accept: "application/json" },
                body: JSON.stringify({
                  kind: String(form.elements.kind?.value || "other"),
                  fileName: file.name,
                  mimeType: file.type || "application/octet-stream",
                  linkedEntityKind: workspace.dataset.entityKind,
                  linkedEntityId: entityId,
                  contentBase64
                })
              });
              await messageFrom(response, "Não foi possível adicionar o anexo.");
              form.reset();
              setStatus(workspace, "Anexo adicionado.", "success");
              await refresh(workspace);
            } catch (error) {
              setStatus(workspace, error.message || "Não foi possível adicionar o anexo.", "error");
            } finally {
              if (submit) submit.disabled = false;
            }
          });
          void refresh(workspace);
        };

        const refreshAll = () => {
          document.querySelectorAll("[data-attachment-workspace]").forEach(initialize);
        };

        const mount = (container, entityKind, entityId, title = "Anexos") => {
          if (!container || !entityId) return null;
          const existing = container.querySelector('[data-attachment-workspace][data-entity-kind="' + entityKind + '"]');
          if (existing) {
            existing.dataset.entityId = entityId;
            existing.hidden = false;
            void refresh(existing);
            return existing;
          }
          const section = document.createElement("section");
          section.className = "attachment-workspace";
          section.dataset.attachmentWorkspace = "";
          section.dataset.entityKind = entityKind;
          section.dataset.entityId = entityId;
          section.innerHTML =
            '<div class="section-heading"><div><h3>' + escapeHtml(title) + '</h3><p class="muted small-note">Adicione arquivos relacionados a este registro.</p></div></div>' +
            '<div data-attachment-list class="attachment-list" aria-live="polite"></div>' +
            '<form data-attachment-form class="edit-grid attachment-form">' +
              '<label>Tipo<select name="kind" required><option value="receipt">Comprovante/recibo</option><option value="invoice">Fatura</option><option value="statement">Extrato</option><option value="contract">Contrato</option><option value="message">Mensagem</option><option value="other">Outro</option></select></label>' +
              '<label class="full-span">Arquivo<input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv,.xls,.xlsx,.docx,application/pdf,image/jpeg,image/png,image/webp,text/plain,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document" /><small>Até 5 MiB. O arquivo fica privado e só pode ser aberto no perfil autorizado.</small></label>' +
              '<div class="dialog-actions full-span"><button type="submit" class="secondary-button">Adicionar anexo</button></div>' +
            '</form>' +
            '<p data-attachment-status class="form-status muted" role="status" aria-live="polite"></p>';
          container.append(section);
          initialize(section);
          return section;
        };

        const observer = new MutationObserver((mutations) => {
          let shouldRefresh = false;
          for (const mutation of mutations) {
            if (mutation.type === "childList") shouldRefresh = true;
            if (mutation.type === "attributes" && mutation.attributeName === "data-entity-id") {
              const workspace = mutation.target;
              initialize(workspace);
              void refresh(workspace);
            }
          }
          if (shouldRefresh) refreshAll();
        });
        observer.observe(document.documentElement, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["data-entity-id"]
        });

        window.SolverFinAttachments = { refresh, refreshAll, mount };
        refreshAll();
      })();
    </script>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
