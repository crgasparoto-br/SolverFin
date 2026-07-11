import fs from "node:fs";

function replaceExact(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(before)) {
    throw new Error(`Expected fragment not found in ${path}: ${before.slice(0, 120)}`);
  }
  fs.writeFileSync(path, source.replace(before, after));
}

const cardsPage = "apps/web/src/dev-server/cards-page.ts";
const recurrencesSection = "apps/web/src/dev-server/recurrences-section.ts";
const cardsPageTest = "apps/web/src/dev-server/cards-page.test.ts";
const recurringRenderTest = "apps/web/src/dev-server/cards-page-recurring-render.test.ts";
const recurrenceScriptTest = "apps/web/src/dev-server/recurrence-card-instrument-script.test.ts";

replaceExact(
  cardsPage,
  '          <button type="button" class="actions-item" data-edit-purchase="${escapeHtml(purchase.id)}"${invoiceLocked ? " disabled" : ""}>${renderEditIcon()}<span>Editar</span></button>',
  '          <button type="button" class="actions-item" data-edit-purchase="${escapeHtml(purchase.id)}"${purchase.recurrenceId ? ` data-recurrence-id="${escapeHtml(purchase.recurrenceId)}"` : ""}${invoiceLocked ? " disabled" : ""}>${renderEditIcon()}<span>Editar</span></button>',
);

replaceExact(
  cardsPage,
  '        <form data-purchase-form data-path="/api/credit-card-accounts/${escapeHtml(selectedCard?.id ?? "")}/purchases">\n          <label>Valor (R$)<input name="amountMinor" data-money inputmode="decimal" required placeholder="0,00" /></label>',
  '        <form data-purchase-form data-path="/api/credit-card-accounts/${escapeHtml(selectedCard?.id ?? "")}/purchases">\n          <input type="hidden" name="currentPurchaseId" />\n          <input type="hidden" name="recurrenceId" />\n          <label>Valor (R$)<input name="amountMinor" data-money inputmode="decimal" required placeholder="0,00" /></label>',
);

replaceExact(
  cardsPage,
  '          purchaseForm.reset();\n          purchaseForm.dataset.method = "POST";\n          if (purchaseRepeatModeLabel) purchaseRepeatModeLabel.hidden = false;',
  '          purchaseForm.reset();\n          purchaseForm.dataset.method = "POST";\n          delete purchaseForm.dataset.currentPurchaseId;\n          delete purchaseForm.dataset.recurrenceId;\n          if (purchaseRepeatModeLabel) purchaseRepeatModeLabel.hidden = false;',
);

replaceExact(
  cardsPage,
  '          form.dataset.path = "/api/credit-card-accounts/" + purchase.cardId + "/purchases/" + purchase.id;\n          form.dataset.method = "PATCH";\n          form.amountMinor.value = minorToMoneyInput(purchase.amountMinor);',
  '          form.dataset.path = "/api/credit-card-accounts/" + purchase.cardId + "/purchases/" + purchase.id;\n          form.dataset.method = "PATCH";\n          form.dataset.currentPurchaseId = purchase.id;\n          if (purchase.recurrenceId) form.dataset.recurrenceId = purchase.recurrenceId;\n          else delete form.dataset.recurrenceId;\n          if (form.currentPurchaseId) form.currentPurchaseId.value = purchase.id;\n          if (form.recurrenceId) form.recurrenceId.value = purchase.recurrenceId || "";\n          form.amountMinor.value = minorToMoneyInput(purchase.amountMinor);',
);

replaceExact(
  recurrencesSection,
  '          function clearCurrentPurchase() {\n            delete form.dataset.currentPurchaseId;\n            delete form.dataset.recurrenceId;\n          }',
  '          function clearCurrentPurchase() {\n            delete form.dataset.currentPurchaseId;\n            delete form.dataset.recurrenceId;\n            if (form.currentPurchaseId) form.currentPurchaseId.value = "";\n            if (form.recurrenceId) form.recurrenceId.value = "";\n          }',
);

replaceExact(
  recurrencesSection,
  '          function setCurrentPurchase(purchase) {\n            form.dataset.currentPurchaseId = purchase.id;\n            if (purchase.recurrenceId) form.dataset.recurrenceId = purchase.recurrenceId;\n            else delete form.dataset.recurrenceId;\n            normalizeCardInstrumentLabels();\n          }',
  '          function setCurrentPurchase(purchase) {\n            form.dataset.currentPurchaseId = purchase.id;\n            if (purchase.recurrenceId) form.dataset.recurrenceId = purchase.recurrenceId;\n            else delete form.dataset.recurrenceId;\n            if (form.currentPurchaseId) form.currentPurchaseId.value = purchase.id;\n            if (form.recurrenceId) form.recurrenceId.value = purchase.recurrenceId || "";\n            normalizeCardInstrumentLabels();\n          }',
);

replaceExact(
  recurrencesSection,
  '            const purchase = purchasesById.get(target.dataset.editPurchase);\n            if (purchase) setCurrentPurchase(purchase);',
  '            const purchase = purchasesById.get(target.dataset.editPurchase) || { id: target.dataset.editPurchase, recurrenceId: target.dataset.recurrenceId || "" };\n            if (purchase && purchase.id) setCurrentPurchase(purchase);',
);

replaceExact(
  recurrencesSection,
  '            const method = form.dataset.method || "POST";\n            const currentPurchaseId = form.dataset.currentPurchaseId || purchaseIdFromPath(form.dataset.path || form.getAttribute("data-path") || "");\n            const purchase = purchasesById.get(currentPurchaseId);\n            const recurrenceId = form.dataset.recurrenceId || (purchase && purchase.recurrenceId) || "";\n            if (method !== "PATCH" || !recurrenceId) return;',
  '            const formData = new FormData(form);\n            const path = form.dataset.path || form.getAttribute("data-path") || "";\n            const purchaseIdFromForm = String(formData.get("currentPurchaseId") || "");\n            const currentPurchaseId = form.dataset.currentPurchaseId || purchaseIdFromForm || purchaseIdFromPath(path);\n            const method = form.dataset.method || (currentPurchaseId ? "PATCH" : "POST");\n            const purchase = purchasesById.get(currentPurchaseId);\n            const editButton = currentPurchaseId ? document.querySelector(\'[data-edit-purchase="\' + currentPurchaseId + \'"]\') : null;\n            const recurrenceId = form.dataset.recurrenceId || String(formData.get("recurrenceId") || "") || (purchase && purchase.recurrenceId) || (editButton && editButton.dataset.recurrenceId) || "";\n            if (method !== "PATCH" || !recurrenceId) return;',
);

replaceExact(
  cardsPageTest,
  '  assert.match(html, /data-edit-purchase="purchase-1"/);',
  '  assert.match(html, /data-edit-purchase="purchase-1" data-recurrence-id="recurrence-card-1"/);\n  assert.match(html, /name="currentPurchaseId"/);\n  assert.match(html, /name="recurrenceId"/);',
);

replaceExact(
  recurringRenderTest,
  '    assert.match(html, /data-edit-purchase="purchase-1"/);',
  '    assert.match(html, /data-edit-purchase="purchase-1" data-recurrence-id="recurrence-1"/);\n    assert.match(html, /form\.dataset\.currentPurchaseId = purchase\.id/);\n    assert.match(html, /form\.dataset\.recurrenceId = purchase\.recurrenceId/);',
);

replaceExact(
  recurrenceScriptTest,
  'assert.match(script, /form\\.dataset\\.recurrenceId/);',
  'assert.match(script, /form\\.dataset\\.recurrenceId/);\nassert.match(script, /formData\\.get\\("recurrenceId"\\)/);\nassert.match(script, /editButton && editButton\\.dataset\\.recurrenceId/);',
);

fs.rmSync("scripts/apply-fix-418-card-modal.mjs");
fs.rmSync(".github/workflows/apply-fix-418-card-modal.yml");
