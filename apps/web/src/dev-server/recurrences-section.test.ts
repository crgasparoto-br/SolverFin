import assert from "node:assert/strict";

import {
  recurrencesSectionScript,
  renderRecurrenceActionMenuItems,
  renderRecurrenceEditModal,
  type RecurrenceRecord,
} from "./recurrences-section.js";

const categories = [{ id: "cat-food", name: "Alimentacao" }];
const cardInstrumentOptions = '<option value="physical-card">Cartao fisico</option>';
const recurrenceOnlyOption = '<option value="recurrence_only">Somente novas ocorrências</option>';
const recurrenceAndFuturePendingOption =
  '<option value="recurrence_and_future_pending">Novas ocorrências e futuras pendentes</option>';
const editScopeLabel = '<label class="full">Aplicar alteração<select name="editScope">';
const cardInstrumentOption = '<select name="cardInstrumentId"><option value="physical-card">';
const recurrence: RecurrenceRecord = {
  id: "recurrence-1",
  status: "active",
  kind: "expense",
  frequency: "monthly",
  interval: 1,
  startOn: "2026-07-10",
  amountMinor: 10000,
  currency: "BRL",
  description: "Assinatura",
  accountId: "account-1",
};

const cardModal = renderRecurrenceEditModal(categories, "card", cardInstrumentOptions);

assert.ok(cardModal.includes('<select name="editScope">'));
assert.ok(cardModal.includes(recurrenceOnlyOption));
assert.ok(cardModal.includes(recurrenceAndFuturePendingOption));
assert.ok(cardModal.includes(editScopeLabel));
assert.ok(cardModal.includes(cardInstrumentOption));
assert.match(cardModal, /data-recurrence-scope-modal/);
assert.match(cardModal, /aria-labelledby="recurrence-scope-title"/);
assert.match(cardModal, /aria-live="polite" data-recurrence-scope-status/);
assert.match(cardModal, /data-recurrence-scope="current" autofocus/);
assert.match(cardModal, /Alterar somente esta compra/);
assert.match(cardModal, /Alterar esta compra e as próximas/);
assert.match(cardModal, /Voltar para a edição/);
assert.doesNotMatch(cardModal, /<form[^>]*data-recurrence-scope/);

const accountModal = renderRecurrenceEditModal([], "account");

assert.equal(accountModal.includes('name="editScope"'), false);
assert.equal(accountModal.includes('name="cardInstrumentId"'), false);
assert.match(accountModal, /Alterar somente este lançamento/);
assert.match(accountModal, /Alterar este lançamento e os próximos/);

const menu = renderRecurrenceActionMenuItems(recurrence);
const script = recurrencesSectionScript();

assert.doesNotMatch(menu, /Editar recorrência/);
assert.doesNotMatch(menu, /data-recurrence-edit=/);
assert.match(menu, /Pausar recorrência/);
assert.match(menu, /Cancelar recorrência/);
assert.doesNotMatch(script, /recurrenceScopeMessage/);
assert.doesNotMatch(script, /cardPurchaseRecurrenceMessage/);
assert.match(script, /openScopeModal/);
assert.match(script, /data-recurrence-scope="current"/);
assert.match(script, /current_and_future/);
assert.match(script, /applyToFuturePlanned/);
assert.match(script, /requestPayload\.editScope = "current_and_future"/);
assert.match(script, /event\.key !== "Tab"/);
assert.match(script, /scopeModal\.addEventListener\("cancel"/);
