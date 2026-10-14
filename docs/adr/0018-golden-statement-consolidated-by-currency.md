# Decisão: extrato consolidado por moeda na Golden Screen

**Data:** 2026-10-14  
**Escopo:** Issue #702, PR #713, rota autenticada /lancamentos  
**Estado:** decisão de produto aprovada; implementação sujeita à CI e auditoria independente.

## Contexto e decisão

Manter a mesma Golden Screen para duas perspectivas, em vez de criar outra página:

- **Conta individual:** permanece o padrão anterior. Saldo, lançamentos, criação, edição, agrupamento e transferência continuam no contexto da conta escolhida.
- **Todas as contas:** primeira opção do seletor, ativada explicitamente por accountId=all. Exige uma moeda, com BRL como padrão quando existente; caso contrário usa a primeira moeda disponível. A seleção de moeda só agrega contas ativas dessa moeda e é preservada na navegação mensal.

A lista mostra conta de origem abaixo da descrição; para transferências, origem → destino. Para editar, o usuário abre **Ver** e navega até a conta individual. No consolidado, ações rápidas de mutação e edição direta estão desabilitadas para não haver destino ambíguo.

## Semântica financeira

1. O saldo inicial consolidado soma o saldo de abertura das contas ativas da moeda e movimentos efetivos anteriores ao início do recorte.
2. O saldo efetivo consolidado inclui somente movimentos efetivos da moeda; lançamentos previstos não alteram esse saldo.
3. Cada transação é projetada **uma vez**. Transferências internas entre duas contas incluídas tê���q�^