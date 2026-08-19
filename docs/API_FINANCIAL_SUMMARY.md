# API de resumo financeiro

`GET /api/financial-summary` retorna os indicadores usados pelo dashboard para o contexto autenticado de organização e perfil financeiro. O endpoint mantém **caixa**, **resultado econômico realizado** e **compromissos futuros** como conceitos separados; o frontend apenas apresenta os valores devolvidos pela API e não recalcula regras financeiras.

## Escopo, tenant e moeda

A rota exige sessão válida e usa o `TenantContext` resolvido no servidor. Todas as consultas do resumo são filtradas simultaneamente por `organizationId` e `financialProfileId`.

A moeda faz parte do contrato financeiro. Os agregados são calculados e devolvidos em `currencyBlocks`, reutilizando o vocabulário definido em [`API_REPORTS.md`](./API_REPORTS.md):

- cada bloco contém valores de uma única moeda nativa;
- os blocos são ordenados de forma determinística pelo código da moeda;
- valores de moedas diferentes nunca são somados entre si;
- não existe conversão cambial nem moeda de referência implícita;
- a moeda vem de `Account.currency` e `Transaction.currency`, nunca de formatter ou variável de apresentação.

### Compatibilidade mono-moeda

Quando a resposta contém **exatamente um** `currencyBlock`, a API também preserva temporariamente os campos escalares históricos `currency`, `availableBalanceMinor`, `incomeMinor`, `expensesMinor` e `plannedCommitmentsMinor`, todos copiados daquele mesmo bloco.

Esses campos não são emitidos quando há zero ou mais de uma moeda. A compatibilidade nunca soma moedas diferentes e nunca inventa BRL.

## Data de referência e determinismo

O backend resolve um único instante `now` por cálculo. A data civil UTC de `generatedAt` é a data de referência usada pelos agregados temporais. O mesmo valor é reutilizado em todas as consultas do resumo, evitando que consultas paralelas atravessem uma virada de dia ou mês com referências diferentes.

O método interno `buildFinancialSummary` aceita esse instante como dependência injetável para testes. A rota pública não aceita uma data fornecida pelo cliente.

As fontes temporais seguem [`TRANSACTION_DATES.md`](./TRANSACTION_DATES.md):

- caixa realizado: `effectiveOn`;
- receitas e despesas realizadas do mês: `occurredOn`;
- compromissos ainda não efetivados: `plannedOn`.

Não existe `COALESCE` temporal universal entre esses campos.

## Campos de cada `currencyBlock`

### `availableBalanceMinor`

Representa a posição de caixa das contas **ativas** daquela moeda na data de referência:

1. soma o `openingBalanceMinor` das contas ativas da moeda;
2. soma receitas `posted`/`reconciled` da mesma moeda vinculadas a conta ativa quando `effectiveOn` existe e é menor ou igual à data de referência;
3. subtrai despesas nas mesmas condições;
4. para transferências, debita a conta de origem ativa e credita a conta de destino ativa, sem introduzir conversão cambial.

Consequências do contrato:

- uma compra no cartão não reduz o saldo bancário apenas por representar despesa econômica;
- o pagamento da fatura reduz a conta pagadora exatamente uma vez quando a transação de liquidação se torna efetiva;
- uma transferência entre duas contas ativas do mesmo perfil e moeda tem efeito líquido zero no disponível agregado;
- compromissos `planned`/`suggested` não reduzem o disponível antes de `effectiveOn` existir.

### `incomeMinor` e `expensesMinor`

Representam o resultado econômico realizado do **mês civil da data de referência** e da moeda do bloco.

Entram somente `Transaction` com:

- `kind` igual a `income` ou `expense`;
- `status` igual a `posted` ou `reconciled`;
- `occurredOn` dentro do mês de referência;
- organização, perfil financeiro e moeda do bloco.

Transferências não entram no resultado econômico.

A transação usada para liquidar uma fatura é excluída de receitas/despesas exclusivamente quando estiver referenciada por `Invoice.paymentTransactionId`, sempre dentro do mesmo tenant e perfil. Essa é a mesma referência canônica documentada em [`CARDS.md`](./CARDS.md) e [`API_REPORTS.md`](./API_REPORTS.md).

### `plannedCommitmentsMinor`

Compromissos do mês usam `plannedOn` e entram somente quando:

- `kind = expense`;
- `status` é `planned` ou `suggested`;
- `effectiveOn` está ausente;
- `plannedOn` pertence ao mês da data de referência;
- a transação possui a moeda do bloco.

## Itens recentes

`recentItems` continua sendo uma lista operacional das transações não anuladas mais recentes. Cada item inclui `currency`, permitindo ao consumidor identificar o valor sem inferir moeda pelo contexto da tela.

## Resposta multi-moeda

```json
{
  "currencyBlocks": [
    {
      "currency": "BRL",
      "availableBalanceMinor": 125000,
      "incomeMinor": 80000,
      "expensesMinor": 42000,
      "plannedCommitmentsMinor": 18000
    },
    {
      "currency": "USD",
      "availableBalanceMinor": 23000,
      "incomeMinor": 15000,
      "expensesMinor": 4000,
      "plannedCommitmentsMinor": 2500
    }
  ],
  "recentItems": [
    {
      "id": "transaction-demo",
      "description": "Compra ficticia",
      "kind": "expense",
      "amountMinor": 4000,
      "currency": "USD",
      "occurredOn": "2035-07-10",
      "status": "posted"
    }
  ],
  "generatedAt": "2035-07-12T12:00:00.000Z"
}
```

Nesse caso os campos escalares de compatibilidade não aparecem.

## Resposta mono-moeda

```json
{
  "currencyBlocks": [
    {
      "currency": "BRL",
      "availableBalanceMinor": 125000,
      "incomeMinor": 80000,
      "expensesMinor": 42000,
      "plannedCommitmentsMinor": 18000
    }
  ],
  "currency": "BRL",
  "availableBalanceMinor": 125000,
  "incomeMinor": 80000,
  "expensesMinor": 42000,
  "plannedCommitmentsMinor": 18000,
  "recentItems": [],
  "generatedAt": "2035-07-12T12:00:00.000Z"
}
```

## Resposta sem dados agregáveis

```json
{
  "currencyBlocks": [],
  "recentItems": [],
  "generatedAt": "2035-07-12T12:00:00.000Z"
}
```

Ausência de dados não é convertida em total zero rotulado como BRL.

Todos os valores monetários permanecem em unidades menores.

## Consumidor web

O dashboard usa `currencyBlocks` como forma canônica, cria uma seção por moeda e passa `currency` explicitamente ao formatter de cada valor. Cálculo financeiro e consolidação entre moedas permanecem proibidos no cliente.

## Validação esperada

Mudanças nesta área devem provar, no mesmo cenário integrado:

- saldo inicial de conta;
- receita e despesa realizadas;
- transferência sem alteração do resultado econômico líquido;
- compra de cartão sem redução antecipada do saldo bancário;
- previsão de pagamento como compromisso enquanto ainda não efetiva;
- pagamento da fatura reduzindo a conta pagadora uma única vez e sem duplicar despesa econômica;
- datas divergentes entre `occurredOn`, `plannedOn` e `effectiveOn` obedecendo à fonte temporal de cada métrica;
- pelo menos duas moedas no mesmo perfil, com valores distintos validados separadamente;
- ordenação determinística de `currencyBlocks`;
- ausência dos campos escalares quando a resposta for multi-moeda;
- `recentItems` com moeda explícita.
