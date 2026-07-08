# Patch sugerido para a issue #414

Este arquivo descreve o patch funcional esperado para orientar a implementação.

## `apps/web/src/dev-server/cards-page.ts`

### Remover limite do label do instrumento

Substituir `formatInstrumentLabel` por:

```ts
function formatInstrumentLabel(instrument: CardInstrumentRecord): string {
  const name = instrument.name?.trim();
  const title =
    name ||
    `${formatInstrumentType(instrument.type)} - ${formatInstrumentHolder(instrument.holder)}`;
  const identifier = instrument.maskedIdentifier ? ` · ${instrument.maskedIdentifier}` : "";

  return `${title}${identifier}`;
}
```

### Pergunta de escopo ao editar compra recorrente

O fluxo existente em `recurrences-section.ts` já intercepta `PATCH` de compra recorrente com `form.dataset.recurrenceId` e chama `window.confirm(...)`. Validar se a compra editada está carregando `recurrenceId` no JSON `data-purchase`. Se não estiver, ajustar o contrato/listagem de compras para incluir `recurrenceId`.

## `apps/web/src/dev-server/transactions-page.ts`

### Subir ações rápidas para o cabeçalho

Mover os botões rápidos para dentro de `.statement-heading`, no mesmo padrão de `.cards-heading`:

```html
<section class="statement-heading">
  <div>
    <p class="eyebrow">Conta e movimentações</p>
    <h1>Extrato Bancário</h1>
    <p class="muted">Acompanhe lançamentos, saldo e pendências por conta e mês.</p>
  </div>
  <div class="statement-heading-actions">
    <button type="button" data-open-modal data-quick-kind="expense" disabled?>Nova saída</button>
    <button type="button" data-open-modal data-quick-kind="income" disabled?>Nova entrada</button>
    <button type="button" data-open-modal data-quick-kind="transfer" disabled?>
      Nova transferência
    </button>
  </div>
</section>
```

Manter os mesmos atributos usados hoje pelos botões existentes para não alterar o `clientScript()`.

Atualizar CSS para `.statement-heading` usar `align-items:end; display:flex; gap:16px; justify-content:space-between`, seguindo o padrão de `.cards-heading`.
