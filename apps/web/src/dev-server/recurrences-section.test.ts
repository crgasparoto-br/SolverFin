import assert from "node:assert/strict";

import { renderRecurrenceEditModal } from "./recurrences-section.js";

const cardModal = renderRecurrenceEditModal(
  [
    {
      id: "cat-food",
      name: "Alimentacao",
    },
  ],
  "card",
  '<option value="physical-card">Cartao fisico</option>',
);

assert.match(cardModal, /<select name="editScope">/);
assert.match(
  cardModal,
  /<option value="recurrence_only">Somente novas ocorrências<\/option>/,
);
assert.match(
  cardModal,
  /<option value="recurrence_and_future_pending">Novas ocorrências e futuras pendentes<\/option>/,
);
assert.match(cardModal, /<label class="full">Aplicar alteração<select name="editScope">/);
assert.match(cardModal, /<select name="cardInstrumentId"><option value="physical-card">/);

const accountModal = renderRecurrenceEditModal([], "account");

assert.doesNotMatch(accountModal, /name="editScope"/);
assert.doesNotMatch(accountModal, /name="cardInstrumentId"/);
