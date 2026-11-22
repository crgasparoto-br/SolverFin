# API operacional do Dashboard

`GET /api/dashboard-overview` é uma fonte autenticada somente leitura de detalhamento para
`/dashboard`. Não substitui `GET /api/financial-summary` nem o cálculo de
`GET /api/cash-flow-projection`: os KPIs canônicos e a projeção continuam nos contratos
originais. Os novos dados são produzidos no backend com escopo de
`organizationId` e `financialProfileId` resolvido pela autenticação.

## Entrada e referência temporal

- `purchaseOn=YYYY-MM-DD` (opcional): simula apenas a classificação de cartão para compras
  entre o dia civil atual de São Paulo e os próximos 365 dias. Formato inválido, data inexistente,
  dia anterior ou data fora do limite retornam HTTP 400 com
  `DASHBOARD_PURCHASE_DATE_INVALID`.
- Sem `purchaseOn`, a compra simulada considera a data civil atual de São Paulo, coerente com o Extrato. `purchaseToday` informa essa data; `referenceDate` continua UTC, seguindo o resumo financeiro canônico.
- `referenceDate`, `periodStartOn` e `periodEndOn` são resolvidos no backend a
  partir de um mesmo `now` e usam o mês civil corrente UTC. Na virada do mês, `purchaseToday` pode indicar o dia anterior em São Paulo, sem deslocar o mês dos saldos e compromissos.
- `purchaseOn` nunca altera os demais agregados: saldo, vencimentos e gastos do
  mês permanecem referenciados à data real.

## Saída

```json
{
  "referenceDate": "2026-11-19",
  "purchaseToday": "2026-11-19",
  "purchaseOn": "2026-11-19",
  "periodStartOn": "2026-11-01",
  "periodEndOn": "2026-11-30",
  "accountBalances": [],
  "cardSpending": [],
  "cardAdvice": [],
  "payables": [],
  "payableTotals": [],
  "categoryExpenses": [],
  "monthlyTrend": []
}
```

### Saldos de contas

`accountBalances[]` entrega `id`, `name`, `kind`, `currency` e
`balanceMinor` de cada conta ativa. O cálculo corresponde ao
`availableBalanceMinor` canônico: saldo inicial + movimentos efetivados
até `referenceDate`; transferências debitam a origem e creditam o destino
(inclusive valores nativos distintos em transferências entre moedas).

Os tipos `checking`, `savings`, `cash`, `investment` e `other` continuam
separados. Uma conta do tipo investimento não é rotulada como liquidez imediata.
Nunca consolidar moedas diferentes em um número.

### Contas a pagar

`payables[]` une os compromissos planejados/sugeridos de conta corrente
(`plannedOn`, `effectiveOn IS NULL`, ainda sem vínculo de fatura/cartão)
às faturas ainda não pagas `OPEN`, `CLOSED` e `OVERDUE` pelo `dueOn`, desde que o vencimento não ultrapasse
o fim do mês de referência. Inclui vencidas em meses anteriores ainda pendentes.

`payableTotals[]` entrega `currency`, `amountMinor`, `overdueMinor` e `count`
para **toda a coleção**, enquanto `payables[]` é limitada aos 10 vencimentos
mais próximos por moeda. Ambos são calculados no backend na mesma consulta;
a apresentação não soma as dez linhas para produzir um total incorreto.
A regra `invoiceId`/ `cardId` evita duplicar previsões ligadas a faturas.
O pagamento já efetivado não entra na lista pendente.

### Cartões

`cardSpending[]` inclui cartões ativos e cartões bloqueados/arquivados com compras realizadas, preservando o histórico e a soma de compras `EXPENSE`
`POSTED`/`RECONCILED` por cartão no mês de `occurredOn`.
A liquidação registrada como `Invoice.paymentTransactionId` não participa
do gasto econômico. Transferências não representam compras.

`cardAdvice[]` ordena cartões `ACTIVE` com ao menos um
`CardInstrument` `ACTIVE`, usando `calculateInvoicePeriod` do domínio:
a partir de `purchaseOn`, determina `closingOn`/`dueOn` e a distância em
**dias civis UTC** até o vencimento. Vários cartões podem receber
`recommended=true` se empatarem no maior prazo. O ranking não faz conversão
de moedas nem presume limite de crédito disponível. A data de vencimento é
estimada conforme calendário cadastrado; compras no dia do fechamento podem
ser processadas pela instituição em outro ciclo.

### Composição e tendência

`categoryExpenses[]` apresenta valor realizado por categoria e moeda no
mês corrente. `monthlyTrend[]` contém receitas/despesas realizadas por moeda
e mês nos últimos seis meses até o mês corrente. Ambos excluem a transação
`Invoice.paymentTransactionId` para não duplicar resultado econômico.

Todas as quantias financeiras são inteiros na unidade menor da moeda e
recebem verificação de inteiro seguro `addSafeMoneyMinor`. A interface faz
somente conversão de valor para texto e escalas visuais para gráficos.

## Falhas e consumo

O Dashboard mantém `/api/financial-summary` como fonte obrigatória. Falha em
`/api/dashboard-overview` produz `Dados parciais` e uma seção operacional
indisponível sem apagar os KPIs financeiros, a projeção ou os próximos passos.

As ações da tabela navegam para os módulos canônicos `/lancamentos`,
`/cartoes`, `/contas-cartoes` e `/relatorios`; não reintroduzem
`/pagar-receber`.

## Verificações

- `apps/api/src/dashboard-overview.integration.test.ts`: fatura em aberto/vencida/paga, baixa,
  histórico de compras em cartões bloqueados/arquivados, posição de caixa e não duplicidade de compromissos e despesas.
- `apps/api/src/repositories/dashboard-overview.test.ts`: fechamentos,
  vencimentos, ano bissexto, elegibilidade, empates e entrada de data.
- `apps/web/src/dev-server/dashboard-page.test.ts`: widgets SSR, escopo,
  navegação e invariantes da hierarquia.
- Verificação integrada do endpoint, SQL e evidência Chrome autenticada em
  desktop/mobile continuam obrigatórias para homologação e auditoria.
