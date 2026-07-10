import assert from "node:assert/strict";

import {
  recurrencesSectionScript,
  recurrencesSectionStyles,
  renderRecurrenceEditModal,
} from "./recurrences-section.js";

const script = recurrencesSectionScript();
const styles = recurrencesSectionStyles();
const accountScopeModal = renderRecurrenceEditModal([], "account");
const cardScopeModal = renderRecurrenceEditModal([], "card");

assert.match(
  script,
  /normalizeCardInstrumentLabels\(\)/,
  "deve normalizar o label do instrumento para remover limite do campo Instrumento",
);
assert.match(
  script,
  /limite/,
  "deve conter regra especifica para remover o trecho de limite do label do instrumento",
);
assert.match(
  accountScopeModal,
  /Este lançamento faz parte de uma recorrência/,
  "deve perguntar o escopo ao editar lançamento recorrente",
);
assert.match(
  accountScopeModal,
  /Alterar somente este lançamento/,
  "o modal deve deixar clara a opção de alterar apenas o lançamento editado",
);
assert.match(
  accountScopeModal,
  /Alterar este lançamento e os próximos/,
  "o modal deve deixar clara a opção de alterar o lançamento e os próximos",
);
assert.match(
  cardScopeModal,
  /Esta compra faz parte de uma recorrência/,
  "deve perguntar o escopo ao editar compra recorrente no cartão",
);
assert.match(
  cardScopeModal,
  /Alterar esta compra e as próximas/,
  "o modal de cartão deve deixar clara a opção de alterar a compra e as futuras",
);
assert.match(
  cardScopeModal,
  /Alterar somente esta compra/,
  "o modal de cartão deve deixar clara a opção de alterar somente a compra",
);
assert.match(
  script,
  /purchasesById/,
  "deve manter mapa local de compras para derivar recurrenceId no submit",
);
assert.match(
  script,
  /purchaseIdFromPath/,
  "deve conseguir identificar a compra editada pela URL do formulário",
);
assert.match(
  script,
  /moveStatementQuickActionsToHeading\(\)/,
  "deve mover as ações rápidas do extrato para o cabeçalho",
);
assert.match(
  styles,
  /statement-heading-actions/,
  "deve estilizar as ações rápidas movidas para o cabeçalho do extrato",
);
assert.match(
  script,
  /setupCardPurchaseMoveAction\(\)/,
  "deve registrar a ação visual de mover compra entre faturas",
);
assert.match(script, /data-move-purchase/, "deve marcar a ação de mover compra no menu da compra");
assert.match(
  script,
  /move-invoice-period/,
  "deve chamar o endpoint dedicado de movimentação de compra entre faturas",
);
assert.match(
  script,
  /invoicePeriod: normalizedPeriod/,
  "deve enviar somente o periodo operacional da fatura destino no payload",
);
assert.doesNotMatch(
  script,
  /destinationInvoiceId|invoiceId: normalizedPeriod/,
  "não deve calcular nem enviar invoiceId de destino no frontend",
);
assert.match(
  script,
  /editButton\.disabled/,
  "deve omitir a ação quando a compra não estiver editável",
);
