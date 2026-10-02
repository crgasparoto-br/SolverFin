const DOCUMENT_IMPORT_MARKER = "data-inbox-document-import-enhanced";
const RENDERED_BLOCK_INDENT = "        ";

function indentRenderedBlock(value: string): string {
  return value
    .split("\n")
    .map((line) => (line.length > 0 ? RENDERED_BLOCK_INDENT + line : line))
    .join("\n");
}

export function enhanceInboxDocumentImport(html: string): string {
  if (!html.includes("data-inbox-ofx-import-enhanced")) return html;
  if (html.includes(DOCUMENT_IMPORT_MARKER)) return html;

  // Exact source/target whitespace is part of this legacy post-processor contract.
  // prettier-ignore
  const replacements: ReadonlyArray<readonly [string, string]> = [
    [
      'title="Importar extrato CSV ou OFX"',
      'title="Importar extrato CSV, OFX, XLSX ou PDF"',
    ],
    [
      "Importe CSV ou OFX, revise os diagnósticos e confirme somente as linhas desejadas.",
      "Importe CSV, OFX, XLSX ou PDF, revise os diagnósticos e confirme somente as linhas desejadas.",
    ],
    [
      '<h2 id="csv-import-dialog-title">Importar CSV ou OFX</h2>',
      '<h2 id="csv-import-dialog-title">Importar CSV, OFX, XLSX ou PDF</h2>',
    ],
    [
      `<label class="full-span">Arquivo CSV ou OFX
          <input id="csv-import-file" name="file" type="file" accept=".csv,.ofx,text/csv,text/plain,application/x-ofx" required />`,
      `<label class="full-span">Arquivo CSV, OFX, XLSX ou PDF
          <input id="csv-import-file" name="file" type="file" accept=".csv,.ofx,.xlsx,.pdf,text/csv,text/plain,application/x-ofx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf" required />`,
    ],
    [
      `        <label id="csv-delimiter-field">Separador`,
      `        <label id="document-class-field" hidden>Tipo de documento
          <select name="documentClass">
            <option value="bank_statement">Extrato bancário</option>
            <option value="credit_card_invoice">Fatura de cartão</option>
          </select>
        </label>
        <label id="document-card-field" hidden>Cartão
          <select name="cardId"><option value="">Selecione</option></select>
        </label>
        <label id="document-sheet-field" hidden>Aba do XLSX
          <select name="sheetName"><option value="">Selecione após a pré-visualização</option></select>
        </label>
        <label id="csv-delimiter-field">Separador`,
    ],
    [
      `        <label>Conta
          <select id="csv-import-account" name="accountId" required>`,
      `        <label id="document-account-field">Conta
          <select id="csv-import-account" name="accountId" required>`,
    ],
    [
      `        <label>Conta Destino<select name="accountId" required></select></label>`,
      `        <label id="csv-line-account-field">Conta Destino<select name="accountId" required></select></label>
        <label id="csv-line-card-instrument-field" hidden>Instrumento do cartão<select name="cardInstrumentId"></select></label>`,
    ],
    [
      `        const accountById = new Map(accounts.map((account) => [account.id, account]));
        const categoryById = new Map(categories.map((category) => [category.id, category]));`,
      `        const accountById = new Map(accounts.map((account) => [account.id, account]));
        const categoryById = new Map(categories.map((category) => [category.id, category]));
        const cards = [];
        const cardById = new Map();
        let cardsLoaded = false;`,
    ],
    [
      `          const labels = { csv: "CSV", ofx: "OFX", bank_message: "Mensagem bancária", manual: "Manual" };`,
      `          const labels = { csv: "CSV", ofx: "OFX", xlsx: "XLSX", pdf: "PDF", bank_message: "Mensagem bancária", manual: "Manual" };`,
    ],
    [
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
        }`,
      `        function selectedImportKind() {
          const file = document.getElementById("csv-import-file").files[0];
          const name = String(file && file.name || "").toLowerCase();
          if (name.endsWith(".ofx")) return "ofx";
          if (name.endsWith(".csv")) return "csv";
          if (name.endsWith(".xlsx")) return "xlsx";
          if (name.endsWith(".pdf")) return "pdf";
          return undefined;
        }
        function isStructuredImport(kind) { return kind === "xlsx" || kind === "pdf"; }
        function selectedDocumentClass() {
          return String(form.elements.documentClass && form.elements.documentClass.value || "bank_statement");
        }
        async function ensureCardsLoaded() {
          if (cardsLoaded) return;
          const result = await api("/api/credit-card-accounts?status=all");
          cards.splice(0, cards.length, ...((result && result.creditCardAccounts) || []).filter((card) => card.status === "active"));
          cards.forEach((card) => cardById.set(card.id, card));
          form.elements.cardId.innerHTML = '<option value="">Selecione</option>' + cards.map((card) => '<option value="' + escapeHtml(card.id) + '">' + escapeHtml(card.name) + '</option>').join("");
          cardsLoaded = true;
        }
        async function refreshImportKindControls() {
          const kind = selectedImportKind();
          const structured = isStructuredImport(kind);
          const csvOnly = kind === "csv";
          const xlsx = kind === "xlsx";
          const cardDocument = structured && selectedDocumentClass() === "credit_card_invoice";
          const delimiterField = document.getElementById("csv-delimiter-field");
          const classField = document.getElementById("document-class-field");
          const accountField = document.getElementById("document-account-field");
          const cardField = document.getElementById("document-card-field");
          const sheetField = document.getElementById("document-sheet-field");
          if (delimiterField) delimiterField.hidden = !csvOnly;
          if (classField) classField.hidden = !structured;
          if (accountField) accountField.hidden = cardDocument;
          if (cardField) cardField.hidden = !cardDocument;
          if (sheetField) sheetField.hidden = !xlsx;
          form.elements.accountId.required = !cardDocument;
          form.elements.cardId.required = cardDocument;
          if (cardDocument) await ensureCardsLoaded();
          if (!csvOnly && !xlsx) mappingFields.hidden = true;
          if (!csvOnly) form.elements.csvDelimiter.value = "";
          if (xlsx) {
            mappingFields.hidden = false;
            form.elements.mappingStrategy.value = "signed";
            updateMappingStrategy();
          }
        }
        function arrayBufferToBase64(buffer) {
          const bytes = new Uint8Array(buffer);
          let binary = "";
          for (let offset = 0; offset < bytes.length; offset += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
          }
          return btoa(binary);
        }
        function currentXlsxMapping() {
          const date = form.elements.mappingDate && form.elements.mappingDate.value;
          const description = form.elements.mappingDescription && form.elements.mappingDescription.value;
          const amount = form.elements.mappingAmount && form.elements.mappingAmount.value;
          return { version: 1, ...(date ? { date } : {}), ...(description ? { description } : {}), ...(amount ? { amount } : {}) };
        }
        function normalizeStructuredPreview(result) {
          if (!result || !result.preview) return result;
          const structured = result.preview;
          const problems = structured.problems || [];
          const suggestions = (result.suggestions || []).map((item) => item.payload || item);
          return {
            ...result,
            ...structured,
            suggestions,
            batch: {
              validRows: suggestions.length,
              problemRows: problems.filter((problem) => problem.severity === "error").length
            }
          };
        }`,
    ],
    [
      `        async function readSelectedFile() {
          const file = document.getElementById("csv-import-file").files[0];
          if (!file) throw new Error("Selecione um arquivo CSV ou OFX.");
          const kind = selectedImportKind();
          if (!kind) throw new Error("Selecione um arquivo com extensão .csv ou .ofx.");
          if (file.size === 0) throw new Error("O arquivo está vazio.");
          if (file.size > MAX_IMPORT_BYTES) throw new Error("O arquivo excede o limite de 5 MB.");
          return { content: await file.text(), fileName: file.name, kind };
        }`,
      `        async function readSelectedFile() {
          const file = document.getElementById("csv-import-file").files[0];
          if (!file) throw new Error("Selecione um arquivo CSV, OFX, XLSX ou PDF.");
          const kind = selectedImportKind();
          if (!kind) throw new Error("Selecione um arquivo com extensão .csv, .ofx, .xlsx ou .pdf.");
          if (file.size === 0) throw new Error("O arquivo está vazio.");
          if (file.size > MAX_IMPORT_BYTES) throw new Error("O arquivo excede o limite de 5 MB.");
          if (isStructuredImport(kind)) {
            return { contentBase64: arrayBufferToBase64(await file.arrayBuffer()), fileName: file.name, kind };
          }
          return { content: await file.text(), fileName: file.name, kind };
        }`,
    ],
    [
      `          const csv = preview.csv || {};
          if (csv.headers && csv.headers.length) fillMapping(csv.headers, csv.mapping || {}, csv.valueStrategy, csv.valueCandidates || {});
          const problems = preview.problems || [];
          const sampleRows = (csv.sampleRows && csv.sampleRows.length ? csv.sampleRows : preview.suggestions) || [];`,
      `          const csv = preview.csv || {};
          const xlsx = preview.xlsx || {};
          if (csv.headers && csv.headers.length) fillMapping(csv.headers, csv.mapping || {}, csv.valueStrategy, csv.valueCandidates || {});
          if (xlsx.headers && xlsx.headers.length) fillMapping(xlsx.headers, xlsx.mapping || {}, "signed", {});
          if (xlsx.sheets && xlsx.sheets.length) {
            const sheetSelect = form.elements.sheetName;
            const current = xlsx.selectedSheet || sheetSelect.value;
            sheetSelect.innerHTML = '<option value="">Selecione</option>' + xlsx.sheets.map((sheet) => '<option value="' + escapeHtml(sheet) + '">' + escapeHtml(sheet) + '</option>').join("");
            if (current) sheetSelect.value = current;
          }
          const problems = preview.problems || [];
          const pdf = preview.pdf || {};
          const pdfLayoutSummary = pdf.parserId
            ? '<div class="mapping-interpretation"><strong>Layout PDF reconhecido</strong><ul><li>' + escapeHtml(pdf.institution || "Instituição homologada") + ' · ' + escapeHtml(pdf.parserId) + ' · versão ' + escapeHtml(pdf.parserVersion || "não informada") + '</li></ul></div>'
            : "";
          const sampleRows = (csv.sampleRows && csv.sampleRows.length ? csv.sampleRows : preview.suggestions) || [];`,
    ],
    [
      `            renderInterpretation(csv) +`,
      `            pdfLayoutSummary +
            renderInterpretation(csv) +`,
    ],
    [
      `          createButton.disabled = preview.state !== "ready" || Number(preview.batch.validRows || 0) < 1 || !form.elements.accountId.value || !form.elements.consentAccepted.checked;`,
      `          const cardDocument = isStructuredImport(selectedImportKind()) && selectedDocumentClass() === "credit_card_invoice";
          const targetSelected = cardDocument ? Boolean(form.elements.cardId.value) : Boolean(form.elements.accountId.value);
          createButton.disabled = preview.state !== "ready" || Number(preview.batch.validRows || 0) < 1 || !targetSelected || !form.elements.consentAccepted.checked;`,
    ],
    [
      `          if (!form.elements.accountId.value) { setStatus(previewStatus, "Selecione uma conta ativa.", "error"); return; }`,
      `          const kind = selectedImportKind();
          const cardDocument = isStructuredImport(kind) && selectedDocumentClass() === "credit_card_invoice";
          if (cardDocument && !form.elements.cardId.value) { setStatus(previewStatus, "Selecione um cartão ativo.", "error"); return; }
          if (!cardDocument && !form.elements.accountId.value) { setStatus(previewStatus, "Selecione uma conta ativa.", "error"); return; }`,
    ],
    [
      `            const previewPayload = { originalFileName: fileData.fileName, content: fileData.content, accountId: form.elements.accountId.value, consentAccepted: true, ...(fileData.kind === "csv" ? { csvDelimiter: form.elements.csvDelimiter.value || undefined, csvMapping: currentMapping() } : {}) };
            state.preview = await api("/api/import-batches/" + fileData.kind + "/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(previewPayload) });
            renderPreview(state.preview);
            const blockedMessage = fileData.kind === "csv" ? "Ajuste o mapeamento ou o separador e visualize novamente." : "O OFX não possui linhas válidas. Revise os diagnósticos antes de tentar novamente.";`,
      `            const structured = isStructuredImport(fileData.kind);
            const previewPayload = structured
              ? {
                  originalFileName: fileData.fileName,
                  contentBase64: fileData.contentBase64,
                  documentClass: selectedDocumentClass(),
                  consentAccepted: true,
                  ...(selectedDocumentClass() === "credit_card_invoice" ? { cardId: form.elements.cardId.value } : { accountId: form.elements.accountId.value }),
                  ...(fileData.kind === "xlsx" ? { sheetName: form.elements.sheetName.value || undefined, xlsxMapping: currentXlsxMapping() } : {})
                }
              : { originalFileName: fileData.fileName, content: fileData.content, accountId: form.elements.accountId.value, consentAccepted: true, ...(fileData.kind === "csv" ? { csvDelimiter: form.elements.csvDelimiter.value || undefined, csvMapping: currentMapping() } : {}) };
            state.preview = normalizeStructuredPreview(await api("/api/import-batches/" + fileData.kind + "/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(previewPayload) }));
            renderPreview(state.preview);
            const blockedMessage = fileData.kind === "csv" ? "Ajuste o mapeamento ou o separador e visualize novamente." : fileData.kind === "xlsx" ? "Escolha a aba, revise o mapeamento e visualize novamente." : fileData.kind === "pdf" ? "O PDF não pôde ser preparado. Revise os diagnósticos." : "O OFX não possui linhas válidas. Revise os diagnósticos antes de tentar novamente.";`,
    ],
    [
      `          if (event.target && event.target.name === "file") refreshImportKindControls();`,
      `          if (event.target && (event.target.name === "file" || event.target.name === "documentClass")) void refreshImportKindControls();`,
    ],
    [
      `            const createPayload = { originalFileName: fileData.fileName, content: fileData.content, accountId: form.elements.accountId.value, consentAccepted: true, ...(fileData.kind === "csv" ? { csvDelimiter: form.elements.csvDelimiter.value || undefined, csvMapping: currentMapping() } : {}) };
            const result = await api("/api/import-batches/" + fileData.kind, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(createPayload) });`,
      `            const structured = isStructuredImport(fileData.kind);
            const createPayload = structured
              ? {
                  originalFileName: fileData.fileName,
                  contentBase64: fileData.contentBase64,
                  documentClass: selectedDocumentClass(),
                  consentAccepted: true,
                  ...(selectedDocumentClass() === "credit_card_invoice" ? { cardId: form.elements.cardId.value } : { accountId: form.elements.accountId.value }),
                  ...(fileData.kind === "xlsx" ? { sheetName: form.elements.sheetName.value || undefined, xlsxMapping: currentXlsxMapping() } : {})
                }
              : { originalFileName: fileData.fileName, content: fileData.content, accountId: form.elements.accountId.value, consentAccepted: true, ...(fileData.kind === "csv" ? { csvDelimiter: form.elements.csvDelimiter.value || undefined, csvMapping: currentMapping() } : {}) };
            const result = await api("/api/import-batches/" + fileData.kind, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(createPayload) });`,
    ],
    [
      `          const referencesValid = account && account.status === "active" && (!payload.currency || account.currency === payload.currency) && transferValid && (!category || (category.status === "active" && category.kind === payload.kind));`,
      `          const cardTarget = payload.targetKind === "card" || Boolean(payload.cardId);
          const cardValid = cardTarget && Boolean(payload.cardId) && (!payload.cardInstrumentHint || Boolean(payload.cardInstrumentId));
          const referencesValid = cardTarget
            ? cardValid && (!category || (category.status === "active" && category.kind === payload.kind))
            : account && account.status === "active" && (!payload.currency || account.currency === payload.currency) && transferValid && (!category || (category.status === "active" && category.kind === payload.kind));`,
    ],
    [
      `        function readRowPayload(formElement) {
          const values = new FormData(formElement);
          const amountText = String(values.get("amount") || "").trim();
          const normalized = amountText.includes(",") ? amountText.replace(/\\\\./g, "").replace(",", ".") : amountText;
          const amount = Number(normalized);
          return {
            occurredOn: String(values.get("occurredOn") || ""),
            kind: String(values.get("kind") || "expense"),
            amountMinor: Math.round(amount * 100),
            description: String(values.get("description") || ""),
            accountId: String(values.get("accountId") || ""),
            otherAccountId: values.get("kind") === "transfer" && values.get("otherAccountId") ? String(values.get("otherAccountId")) : null,
            categoryId: values.get("categoryId") ? String(values.get("categoryId")) : null
          };
        }`,
      `        function readRowPayload(formElement) {
          const values = new FormData(formElement);
          const amountText = String(values.get("amount") || "").trim();
          const normalized = amountText.includes(",") ? amountText.replace(/\\\\./g, "").replace(",", ".") : amountText;
          const amount = Number(normalized);
          const current = state.detail?.suggestions.find((item) => item.id === state.editingSuggestionId);
          const cardTarget = current?.payload?.targetKind === "card" || Boolean(current?.payload?.cardId);
          return {
            occurredOn: String(values.get("occurredOn") || ""),
            kind: String(values.get("kind") || "expense"),
            amountMinor: Math.round(amount * 100),
            description: String(values.get("description") || ""),
            ...(cardTarget ? {} : { accountId: String(values.get("accountId") || "") }),
            ...(cardTarget ? { cardInstrumentId: values.get("cardInstrumentId") ? String(values.get("cardInstrumentId")) : null } : {}),
            otherAccountId: !cardTarget && values.get("kind") === "transfer" && values.get("otherAccountId") ? String(values.get("otherAccountId")) : null,
            categoryId: values.get("categoryId") ? String(values.get("categoryId")) : null
          };
        }`,
    ],
    [
      `          lineEditForm.elements.accountId.innerHTML = accountOptions(payload);
          lineEditForm.elements.accountId.value = payload.accountId || "";
          lineEditForm.elements.otherAccountId.innerHTML = otherAccountOptions(payload);
          lineEditForm.elements.otherAccountId.value = payload.otherAccountId || "";
          lineEditForm.elements.categoryId.innerHTML = categoryOptions(payload);
          lineEditForm.elements.categoryId.value = payload.categoryId || "";
          refreshLineEditTransferFields(payload);`,
      `          const cardTarget = payload.targetKind === "card" || Boolean(payload.cardId);
          const accountField = document.getElementById("csv-line-account-field");
          const instrumentField = document.getElementById("csv-line-card-instrument-field");
          accountField.hidden = cardTarget;
          instrumentField.hidden = !cardTarget;
          lineEditForm.elements.accountId.required = !cardTarget;
          lineEditForm.elements.accountId.innerHTML = accountOptions(payload);
          lineEditForm.elements.accountId.value = payload.accountId || "";
          lineEditForm.elements.otherAccountId.innerHTML = otherAccountOptions(payload);
          lineEditForm.elements.otherAccountId.value = payload.otherAccountId || "";
          if (cardTarget) {
            const card = cardById.get(payload.cardId);
            const instruments = (card?.instruments || []).filter((instrument) => instrument.status === "active");
            lineEditForm.elements.cardInstrumentId.innerHTML = '<option value="">Selecione para confirmar</option>' + instruments.map((instrument) => '<option value="' + escapeHtml(instrument.id) + '">' + escapeHtml(instrument.name || instrument.maskedIdentifier || instrument.type) + '</option>').join("");
            lineEditForm.elements.cardInstrumentId.value = payload.cardInstrumentId || "";
          }
          lineEditForm.elements.categoryId.innerHTML = categoryOptions(payload);
          lineEditForm.elements.categoryId.value = payload.categoryId || "";
          if (cardTarget) {
            document.getElementById("csv-line-other-account-field").hidden = true;
            document.getElementById("csv-line-transfer-direction").hidden = true;
          } else {
            refreshLineEditTransferFields(payload);
          }`,
    ],
    [
      `if (fileData) fileData.content = "";`,
      `if (fileData) { fileData.content = ""; fileData.contentBase64 = ""; }`,
    ],
  ];

  let enhanced = html;
  for (const [source, target] of replacements) {
    if (enhanced.includes(source)) {
      enhanced = enhanced.replace(source, target);
      continue;
    }

    const renderedSource = indentRenderedBlock(source);
    if (enhanced.includes(renderedSource)) {
      enhanced = enhanced.replace(renderedSource, indentRenderedBlock(target));
    }
  }

  const requiredEnhancements = [
    'accept=".csv,.ofx,.xlsx,.pdf,text/csv,text/plain,application/x-ofx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf"',
    'name="documentClass"',
    'name="cardId"',
    'name="sheetName"',
    "csv-line-card-instrument-field",
    'name.endsWith(".xlsx")',
    'name.endsWith(".pdf")',
    "contentBase64: arrayBufferToBase64",
    "function currentXlsxMapping()",
    "function normalizeStructuredPreview(result)",
  ];

  if (!requiredEnhancements.every((fragment) => enhanced.includes(fragment))) return html;

  return enhanced.replace(
    "data-inbox-ofx-import-enhanced",
    `data-inbox-ofx-import-enhanced ${DOCUMENT_IMPORT_MARKER}`,
  );
}
