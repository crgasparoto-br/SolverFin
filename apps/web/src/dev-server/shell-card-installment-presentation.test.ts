import assert from "node:assert/strict";

import { renderAuthenticatedShell } from "./shell.js";

const cardShell = renderAuthenticatedShell({
  activePathname: "/cartoes",
  currentLabel: "Cartões de Crédito",
  content: '<article data-purchase-item><button data-edit-purchase="purchase-1">Editar compra</button><button data-move-purchase="purchase-1">Mover fatura</button><script type="application/json" data-purchase="purchase-1">{"id":"purchase-1","cardId":"card-1","installmentId":"installment-2"}</script></article>',
});

assert.doesNotMatch(
  cardShell,
  /data-operational-installments-styles/,
  "cartões não deve carregar o decorador legado de parcelas que duplica a projeção nativa",
);
assert.match(
  cardShell,
  /removeBlockedInstallmentMoveActions/,
  "o shell deve remover ações de mover fatura das ocorrências parceladas canônicas",
);
assert.match(
  cardShell,
  /purchase && purchase\.installmentId\) button\.remove\(\)/,
  "a supressão de mover fatura deve depender do vínculo canônico installmentId",
);

const statementShell = renderAuthenticatedShell({
  activePathname: "/lancamentos",
  currentLabel: "Lançamentos",
  content: "<section>Lançamentos</section>",
});

assert.match(
  statementShell,
  /data-operational-installments-styles/,
  "lançamentos deve preservar o controlador operacional de parcelas",
);
