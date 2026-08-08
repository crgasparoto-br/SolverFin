import { enhanceInboxReviewQueue } from "./inbox-review-queue-enhancement.js";

const ENHANCEMENT_MARKER = "data-inbox-ofx-import-enhanced";

export function enhanceInboxOfxImport(html: string): string {
  const finalize = (value: string): string => enhanceInboxReviewQueue(value);
  if (!html.includes('id="csv-import-dialog"')) return finalize(html);
  if (html.includes(ENHANCEMENT_MARKER)) return finalize(html);

  const replacements: ReadonlyArray<readonly [string, string]> = [
    [
      'data-open-dialog="csv-import-dialog" title="Importar extrato CSV"',
      'data-open-dialog="csv-import-dialog" title="Importar extrato CSV ou OFX"',
    ],
    [
      '<h2 id="csv-import-title">Extratos CSV</h2>',
      '<h2 id="csv-import-title">Extratos importados</h2>',
    ],
    [
      "Pré-visualize, corrija e confirme somente as linhas desejadas.",
      "Importe CSV ou OFX, revise os diagnósticos e confirme somente as linhas desejadas.",
    ],
    [
      '<h2 id="csv-import-dialog-title">Importar CSV</h2>',
      '<h2 id="csv-import-dialog-title">Importar CSV ou OFX</h2>',
    ],
    [
      `<label class="full-span">Arquivo CSV
          <input id="csv-import-file" name="file" type="file" accept=".csv,text/csv,text/plain" required />`,
      `<label class="full-span">Arquivo CSV ou OFX
          <input id="csv-import-file" name="file" type="file" accept=".csv,.ofx,text/csv,text/plain,application/x-ofx" required />`,
    ],
    ["        <label>Separador", '        <label id="csv-delimiter-field">Separador'],
    ["const MAX_CSV_BYTES = 5 * 1024 * 1024;", "const MAX_IMPORT_BYTES = 5 * 1024 * 1024;"],
    [
      '            const result = await api("/api/import-batches?sourceKind=csv&status=all");',
      '            const result = await api("/api/import-batches?status=all");',
    ],
    [
      `        function formatStatus(status) {
          const labels = { reviewing: "Em revisão", completed: "Concluído", failed: "Com falha", discarded: "Descartado", pending_review: "Pendente", approved: "Aprovada", rejected: "Rejeitada", expired: "Expirada" };
          return labels[status] || status;
        }`,
      `        function formatStatus(status) {
          const labels = { ready: "Pronto para revisão", blocked: "Importação bloqueada", reviewing: "Em revisão", completed: "Concluído", failed: "Com falha", discarded: "Descartado", pending_review: "Pendente", approved: "Aprovada", rejected: "Rejeitada", expired: "Expirada" };
          return labels[status] || status;
        }
        function formatSourceKind(sourceKind) {
          const labels = { csv: "CSV", ofx: "OFX", bank_message: "Mensagem bancária", manual: "Manual" };
          return labels[sourceKind] || "Outra origem";
        }`,
    ],
    [
      `              '<strong>' + escapeHtml(batch.originalFileName || "Importação CSV") + '</strong>' +
              '<span>' + escapeHtml(formatStatus(batch.status)) + ' · ' + escapeHtml(String(batch.validRows || 0)) + ' linha(s) válidas</span>' +`,
      `              '<strong>' + escapeHtml(batch.originalFileName || "Importação") + '</strong>' +
              '<span>' + escapeHtml(formatSourceKind(batch.sourceKind)) + ' · ' + escapeHtml(formatStatus(batch.status)) + ' · ' + escapeHtml(String(batch.validRows || 0)) + ' linha(s) válidas</span>' +`,
    ],
    [
      `          const sampleRows = csv.sampleRows || [];`,
      `          const sampleRows = (csv.sampleRows && csv.sampleRows.length ? csv.sampleRows : preview.suggestions) || [];`,
    ],
    [
      `        async function readSelectedFile() {
          const file = document.getElementById("csv-import-file").files[0];
          if (!file) throw new Error("Selecione um arquivo CSV.");
          if (!file.name.toLowerCase().endsWith(".csv")) throw new Error("Selecione um arquivo com extensão .csv.");
          if (file.size === 0) throw new Error("O arquivo está vazio.");
          if (file.size > MAX_CSV_BYTES) throw new Error("O arquivo excede o limite de 5 MB.");
          return { content: await file.text(), fileName: file.name };
        }`,
      `        function selectedImportKind() {
          const file = document.getElementById("csv-import-file").files[0];
          const name = String(file && file.name || "").toLowerCase();
          if (name.endsWith(".ofx")) return "ofx";
          if (name.endsWith(".csv")) return "csv";
          return undefined;
        }
        function refreshImportKindControls() {
          const kind = selectedImportKind();
          const csvOnly = kind !== "ofx";
          const delimiterField = document.getElementById("csv-delimiter-field");
          if (delimiterField) delimiterField.hidden = !csvOnly;
          if (!csvOnly) {
            mappingFields.hidden = true;
            form.elements.csvDelimiter.value = "";
          }
        }
        async function readSelectedFile() {
          const file = document.getElementById("csv-import-file").files[0];
          if (!file) throw new Error("Selecione um arquivo CSV ou OFX.");
          const kind = selectedImportKind();
          if (!kind) throw new Error("Selecione um arquivo com extensão .csv ou .ofx.");
          if (file.size === 0) throw new Error("O arquivo está vazio.");
          if (file.size > MAX_IMPORT_BYTES) throw new Error("O arquivo excede o limite de 5 MB.");
          return { content: await file.text(), fileName: file.name, kind };
        }`,
    ],
    [
      `            state.preview = await api("/api/import-batches/csv/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ originalFileName: fileData.fileName, content: fileData.content, accountId: form.elements.accountId.value, consentAccepted: true, csvDelimiter: form.elements.csvDelimiter.value || undefined, csvMapping: currentMapping() }) });
            renderPreview(state.preview);
            setStatus(previewStatus, state.preview.state === "ready" ? "Preview pronto. Nenhum lançamento foi criado." : "Ajuste o mapeamento ou o separador e visualize novamente.", state.preview.state === "ready" ? "success" : "warning");`,
      `            const previewPayload = { originalFileName: fileData.fileName, content: fileData.content, accountId: form.elements.accountId.value, consentAccepted: true, ...(fileData.kind === "csv" ? { csvDelimiter: form.elements.csvDelimiter.value || undefined, csvMapping: currentMapping() } : {}) };
            state.preview = await api("/api/import-batches/" + fileData.kind + "/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(previewPayload) });
            renderPreview(state.preview);
            const blockedMessage = fileData.kind === "csv" ? "Ajuste o mapeamento ou o separador e visualize novamente." : "O OFX não possui linhas válidas. Revise os diagnósticos antes de tentar novamente.";
            setStatus(previewStatus, state.preview.state === "ready" ? "Preview pronto. Nenhum lançamento foi criado." : blockedMessage, state.preview.state === "ready" ? "success" : "warning");`,
    ],
    [
      `        form.addEventListener("change", (event) => { if (event.target && event.target.name === "mappingStrategy") updateMappingStrategy(); state.preview = null; createButton.disabled = true; });`,
      `        form.addEventListener("change", (event) => {
          if (event.target && event.target.name === "mappingStrategy") updateMappingStrategy();
          if (event.target && event.target.name === "file") refreshImportKindControls();
          state.preview = null;
          createButton.disabled = true;
        });`,
    ],
    [
      `            const result = await api("/api/import-batches/csv", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ originalFileName: fileData.fileName, content: fileData.content, accountId: form.elements.accountId.value, consentAccepted: true, csvDelimiter: form.elements.csvDelimiter.value || undefined, csvMapping: currentMapping() }) });`,
      `            const createPayload = { originalFileName: fileData.fileName, content: fileData.content, accountId: form.elements.accountId.value, consentAccepted: true, ...(fileData.kind === "csv" ? { csvDelimiter: form.elements.csvDelimiter.value || undefined, csvMapping: currentMapping() } : {}) };
            const result = await api("/api/import-batches/" + fileData.kind, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(createPayload) });`,
    ],
    [
      `            form.reset(); state.preview = null; state.fileName = ""; previewResult.innerHTML = ""; mappingFields.hidden = true;`,
      `            form.reset(); state.preview = null; state.fileName = ""; previewResult.innerHTML = ""; mappingFields.hidden = true; refreshImportKindControls();`,
    ],
    [
      `          } catch (error) { setStatus(previewStatus, error.message, "error"); createButton.disabled = false; }`,
      `          } catch (error) {
            setStatus(previewStatus, error.message, "error");
            await loadBatches();
            createButton.disabled = false;
          }`,
    ],
  ];

  let enhanced = html;
  for (const [source, target] of replacements) {
    if (!enhanced.includes(source)) return finalize(html);
    enhanced = enhanced.replace(source, target);
  }

  enhanced = enhanced.replace("<main>", `<main ${ENHANCEMENT_MARKER}>`);
  return finalize(enhanced);
}
