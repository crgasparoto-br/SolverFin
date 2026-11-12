# Conciliacao de transacoes

Este documento descreve a regra de dominio para conciliar uma origem financeira prevista, importada ou ja realizada com uma transacao do extrato operacional.

## Objetivo

A conciliacao cria um vinculo auditavel entre uma origem e uma transacao existente. O fluxo permite confirmar que a transacao representa aquela origem, registrar o historico da decisao e desfazer o vinculo sem apagar o rastro de auditoria.

As origens suportadas sao:

- transacao planejada;
- transacao importada;
- transacao postada;
- contas a pagar ou receber;
- recorrencia;
- fatura.

## Previa e conflitos

Antes de confirmar, `previewReconciliation` compara a origem com a transacao dentro do contexto financeiro ativo. A previa retorna `ready` quando os dados batem ou `conflict` quando alguma divergencia precisa de revisao.

Os conflitos cobertos sao:

- valor ou moeda divergente;
- data fora da tolerancia configurada;
- conta financeira divergente;
- categoria divergente;
- tipo de movimentacao divergente.

A tolerancia padrao de data e de 2 dias. Chamadores podem informar `dateToleranceDays` para fluxos mais restritivos.

## Confirmacao

`reconcileTransaction` confirma o vinculo quando a previa esta pronta. Se existirem conflitos, a conciliacao so e criada quando o chamador declarar explicitamente `allowConflicts: true`, representando uma revisao humana ou regra superior.

Ao confirmar, o dominio:

- altera a transacao para `reconciled`;
- preenche `reconciledAt`;
- cria um `ReconciliationLink` ativo entre origem e transacao;
- recalcula as movimentacoes da transacao;
- gera entradas de auditoria para o vinculo e para a transacao.

Transacoes ja conciliadas sao rejeitadas para evitar vinculos duplicados sobre o mesmo lancamento.

## Desfazer

`undoReconciliation` desfaz um vinculo ativo sem apagar o historico. A transacao volta para `posted`, o campo `reconciledAt` e removido e o link passa para `undone`, com usuario e data do desfazimento.

Tentar desfazer o mesmo link mais de uma vez retorna erro de dominio.

## Isolamento por contexto financeiro

Todas as operacoes usam o tenant ativo como fronteira. Origem, transacao e link precisam pertencer a mesma organizacao e ao mesmo perfil financeiro do `TenantContext`; caso contrario, a operacao e tratada como recurso inexistente naquele contexto.

## Cobertura de testes

A suite de dominio cobre:

- previa pronta e confirmacao com auditoria;
- rejeicao de conflitos sem aprovacao explicita;
- desfazer conciliacao e impedir segundo desfazimento;
- rejeicao de transacao ja conciliada;
- isolamento entre tenants/perfis financeiros.
