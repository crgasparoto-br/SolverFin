# Plano de transicao segura de PayableReceivable

## Status

`PayableReceivable` fica como dominio/API legado de compatibilidade. Nenhuma tabela, endpoint, migration antiga ou dado historico deve ser removido nesta etapa.

As fontes operacionais preferenciais sao:

- `Transaction` para compromissos de conta corrente, incluindo receitas e despesas planejadas;
- `Invoice` para compromissos de cartao;
- recorrencias e parcelas materializadas no fluxo de origem.

## Inventario de dependencias

Dependencias que precisam continuar funcionando durante a compatibilidade:

- dominio: `packages/domain/src/payables-receivables.ts`;
- plano de transicao: `packages/domain/src/payables-receivables-transition.ts`;
- API legada: `apps/api/src/payables-receivables-router.ts`;
- repositorio: `apps/api/src/repositories/payables-receivables.ts`;
- schema: `prisma/schema.prisma`, model `PayableReceivable` e relacao `settlementTransactionId`;
- migration de criacao: `prisma/migrations/20260617194000_add_payables_receivables/migration.sql`;
- migration relacionada: `prisma/migrations/20260620013345_20260619/migration.sql`;
- documentacao: `docs/PAYABLES_RECEIVABLES.md`, `docs/API_PAYABLES_RECEIVABLES.md`, `docs/STATUS_MATRIX.md`;
- testes: `packages/domain/src/payables-receivables.test.ts`, `packages/domain/src/payables-receivables-transition.test.ts`, `apps/api/src/api-persistence.integration.test.ts`, `packages/domain/src/daily-availability.test.ts`;
- web/dev server residual: `apps/web/src/dev-server/payables-receivables-page.ts` e `apps/web/src/dev-server/pages.ts`.

## Mapeamento de dados

| Estado legado | Destino tecnico | Regra |
| --- | --- | --- |
| `pending` com `accountId` e sem transacao equivalente | criar `Transaction` planejada | `payable -> expense`, `receivable -> income`, `plannedOn = dueOn`, `effectiveOn` ausente |
| `pending` sem `accountId` | revisao manual | `Transaction` exige conta; nao inferir automaticamente |
| `pending` com `Transaction` equivalente | manter referencia legada | evita dupla contagem |
| `settled` com `settlementTransactionId` valido | manter referencia legada | preservar auditoria e evitar recriacao |
| `settled` sem link, mas com `Transaction` equivalente postada ou conciliada | vincular transacao existente em script futuro | nao criar duplicata |
| `settled` sem link nem equivalente | revisao manual | risco de auditoria incompleta |
| `cancelled` | manter historico legado | nao migrar para `Transaction` ativa |

## Contrato da API legada

Durante a compatibilidade:

- `GET /api/payables-receivables` continua disponivel para consulta historica e integracoes antigas;
- baixa e cancelamento continuam preservando auditoria enquanto existirem registros antigos;
- novas experiencias de produto nao devem usar `POST /api/payables-receivables` para criar compromissos operacionais;
- uma etapa futura pode bloquear novas criacoes nessa API com erro controlado ou mover o contrato para uma versao legada explicita.

## Script futuro

Antes de remover qualquer model ou campo, criar um script idempotente que:

1. leia todos os `PayableReceivable` por tenant e perfil financeiro;
2. gere um plano usando `buildPayableReceivableTransitionPlan`;
3. crie `Transaction` planejada apenas para itens `create_planned_transaction` ainda sem equivalente;
4. vincule `settlementTransactionId` apenas para itens `link_existing_settlement_transaction`;
5. preserve `cancelled` e itens duplicados como historico legado;
6. registre itens `manual_review` para acao humana, sem alteracao automatica;
7. grave auditoria ou correlacao por lote;
8. possa ser executado novamente sem duplicar transacoes.

## Guardrails

- Nao excluir tabela/modelo antes de rodar e validar o plano em ambiente real.
- Nao criar `Transaction` sem `accountId`.
- Nao migrar faturas de cartao para `PayableReceivable`; cartao permanece em `Invoice`.
- Nao somar `PayableReceivable` em Dashboard, disponibilidade ou relatorios quando houver `Transaction` ou `Invoice` equivalente.
- Nao expor valores completos em logs de migracao; usar contadores, ids tecnicos e erros redigidos.

## Criterios para encerrar a compatibilidade

A remocao estrutural so deve ser considerada quando:

- o script idempotente tiver sido executado com sucesso em ambiente controlado e depois no ambiente final;
- todos os itens `manual_review` tiverem destino definido;
- integracoes internas nao chamarem mais criacao, edicao, baixa ou cancelamento da API legada;
- relatorios, Dashboard, disponibilidade, Extrato e Cartoes estiverem cobertos por testes sem dependencia operacional de `PayableReceivable`;
- existir backup ou exportacao dos dados historicos antes de qualquer migration irreversivel.
