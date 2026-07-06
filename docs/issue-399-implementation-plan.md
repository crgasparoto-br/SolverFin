# Issue 399 implementation plan

## Escopo implementado

- `apps/web/src/dev-server/cards-page.ts`: o botao "Editar" de uma compra de cartao passou a configurar diretamente `PATCH /api/credit-card-accounts/:cardId/purchases/:transactionId`, sem depender de override de outro modulo. O seletor de instrumento permanece visivel na edicao; o modo de repeticao fica oculto.
- Compras de faturas `closed`, `paid` ou `cancelled` tem a acao de edicao desabilitada na UI (`disabled` no botao).
- `apps/web/src/dev-server/recurrences-section.ts`: removido totalmente o `setupCardPurchaseEditOverride()` que reescrevia rota/metodo/payload de edicao de compra por cima do handler de `cards-page.ts`.
- `apps/api/src/repositories/card-invoice-contracts.ts`: `updateCardPurchaseForContext` agora rejeita edicao quando a fatura vinculada esta `CLOSED`, `PAID` ou `CANCELLED`, lancando `InvoiceContractError("CARD_PURCHASE_INVOICE_LOCKED", ..., 409)` antes de qualquer mutacao.
- A secao "Historico da fatura" (parcelas) da tela `Cartoes` passou a filtrar a `Installment` tecnica vinculada a uma compra recorrente ja exibida na lista de compras (via `transaction.recurrenceId`), evitando duplicidade.
- Testes adicionados/ajustados: `card-purchase-edit-contract.integration.test.ts` (API, 3 status bloqueados), `cards-page.test.ts` e `cards-page-purchase-edit-route.test.ts` (web), `cards-page-recurring-render.test.ts` atualizado para refletir a nao duplicacao da parcela tecnica. Removido `card-purchase-edit-script.test.ts`, que testava exclusivamente o override eliminado.
- `npm run test`, `npm run test:integration` e `npm run validate` passam.
