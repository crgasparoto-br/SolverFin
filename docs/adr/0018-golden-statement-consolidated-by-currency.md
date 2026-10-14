# ADR 0018 — Extrato consolidado por moeda na Golden Screen

**Data:** 2026-10-14
**Escopo:** Issue #702, PR #713, rota `/lancamentos`
**Estado:** decisão de produto aprovada; implementação sujeita à CI e auditoria independente

## Contexto

O usuário precisa alternar entre a movimentação de uma conta e a de todas as contas do mesmo perfil financeiro, preservando a Golden Screen e identificando a origem de cada lançamento. Criar outra tela duplicaria a interface. Somar valores de moedas distintas contrariaria a política existente de agregação multi-moeda (ADR 0013).

## Decisão

A mesma tela terá dois modos de leitura:

- **Conta individual:** comportamento legado, incluindo saldos, filtros, lançamentos, criação e edição.
- **Todas as contas:** opção explícita `accountId=all`, agrupando apenas contas ativas de uma moeda selecionada. A moeda é obrigatória no controle; BRL é a escolha inicial quando disponível, caso contrário é selecionada a primeira moeda cadastrada. O mês e a moeda são preservados durante a navegação de períodos.

Cada linha da lista identifica a conta abaixo da descrição; transferências mostram origem → destino. No modo consolidado, ações de mutação são desabilitadas, e **Ver** abre o lançamento no extrato da conta que pertence à moeda selecionada: origem para a perna enviada, destino para a perna recebida. O texto auxiliar indica **Enviada para** ou **Recebida de** a partir dessa mesma perspectiva, evitando contexto contraditório em transferências cambiais. A edição permanece restrita à visão individual.

## Regras financeiras

1. Saldo inicial consolidado = soma dos saldos de abertura das contas ativas selecionadas + movimentos efetivos anteriores ao período.
2. Saldo efetivo consolidado = saldo inicial + efeito líquido dos movimentos efetivos no período. Lançamentos previstos não alteram esse saldo.
3. Uma transferência entre contas BRL selecionadas é projetada uma única vez, com efeito líquido zero. Não gera fluxo consolidado de entrada ou saída e não vira receita ou despesa operacional.
4. Na transferência entre moedas, apenas a perna correspondente à moeda selecionada altera o saldo; a entrada utiliza `destinationAmountMinor` quando aplicável. **Os cards Entradas e Saídas representam fluxos líquidos na moeda, não apenas lançamentos com os tipos receita e despesa**: uma transferência cambial recebida aparece em Entradas e uma enviada em Saídas. Isso não reclassifica a transação de transferência como receita/despesa no cadastro ou na API.
5. Jamais converter moedas automaticamente ou apresentar saldo sintético misturando BRL e USD. Uma moeda inexistente não origina total fictício. Contas sem moeda definida não são tratadas implicitamente como BRL, nem incluídas na soma de uma moeda conhecida.
6. Grupos de lançamentos são mostrados pelos seus movimentos componentes na visão consolidada, sem duplicar projeções agregadas.

## Limites técnicos e autorização

Nenhuma migração de banco é necessária: `accountId`, `destinationAccountId` e `currency` já estão modelados. A leitura usa `GET /api/transactions` sem filtro `accountId`, com escopo de organização e perfil financeiro já aplicado pela API. Registros vinculados a cartão ou fatura não entram no extrato bancário.

A implementação inicial reaproveita a consulta do perfil. Para históricos muito grandes, a busca deve evoluir para filtragem/paginação no banco, sem alterar a semântica dos saldos.

## Critérios de validação

Testar BRL versus USD, conta identificada, primeiro mês sem movimento, saldo inicial, previsto, transferências internas e intermoedas, seleção de moeda, retorno à conta individual, ausência de edição consolidada, responsividade e isolamento por tenant/profile. Resultado de CI não equivale a auditoria visual independente.

## Alternativas rejeitadas

- Outra tela: aumenta navegação, manutenção e divergência do design system.
- Consolidar sem moeda: agrega unidades monetárias incompatíveis.
- Permitir edição sem conta selecionada: cria ambiguidade sobre origem/destino da operação.
