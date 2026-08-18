# API de resumo financeiro

`GET /api/financial-summary` retorna os indicadores usados pelo dashboard para o contexto autenticado de organização e perfil financeiro. O endpoint mantém **caixa**, **resultado econômico realizado** e **compromissos futuros** como conceitos separados; o frontend apenas apresenta os valores devolvidos pela API e não recalcula regras financeiras.

## Escopo e tenant

A rota exige sessão válida e usa o `TenantContext` resolvido no servidor. Todas as consultas do resumo são filtradas simultaneamente por `organizationId` e `financialProfileId`.

O endpoint ainda preserva o contrato legado escalar `currency: "BRL"`. **Neste estágio ele não implementa a separação multi-moedas:** as consultas atuais não particionam contas e transações por `currency`, portanto um perfil que contenha valores em moedas diferentes pode produzir um agregado escalar financeiramente inválido. A migração para totais separados por moeda pertence à [Issue #595](https://github.com/crgasparoto-br/SolverFin/issues/595) e à ADR 0013. Até essa migração, este contrato deve ser tratado como válido somente para recortes mono-moeda compatíveis com BRL; nenhuma conversão, paridade ou consolidação implícita é autorizada.

## Data de referência e determinismo

O backend resolve um único instante `now` por cálculo. A data civil UTC de `generatedAt` é a data de referência usada pelos agregados temporais. O mesmo valor é reutilizado em todas as consultas do resumo, evitando que consultas paralelas atravessem uma virada de dia ou mês com referências diferentes.

O método interno `buildFinancialSummary` aceita esse instante como dependência injetável para testes. A rota pública não aceita uma data fornecida pelo cliente.

As fontes temporais seguem [`TRANSACTION_DATES.md`](./TRANSACTION_DATES.md):

- caixa realizado: `effectiveOn`;
- receitas e despesas realizadas do mês: `occurredOn`;
- compromissos ainda não efetivados: `plannedOn`.

Não existe `COALESCE` temporal universal entre esses campos.

## `availableBalanceMinor`

O disponível estimado representa a posição de caixa das contas **ativas** do perfil na data de referência:

1. soma o `openingBalanceMinor` das contas ativas;
2. soma receitas `posted`/`reconciled` vinculadas a conta ativa quando `effectiveOn` existe e é menor ou igual à data de referência;
3. subtrai despesas com as mesmas condições;
4. para transferências, debita a conta de origem ativa e credita a conta de destino ativa.

Consequências do contrato:

- uma compra no cartão não reduz o saldo bancário apenas por representar despesa econômica; ela não possui efeito de caixa na conta pagadora nesse momento;
- o pagamento da fatura reduz a conta pagadora exatamente uma vez quando a transação de liquidação se torna efetiva;
- uma transferência entre duas contas ativas do mesmo perfil tem efeito líquido zero no disponível agregado;
- compromissos `planned`/`suggested` não reduzem o disponível antes de `effectiveOn` existir.

## `incomeMinor` e `expensesMinor`

Esses campos representam o resultado econômico realizado do **mês civil da data de referência**.

Entram somente `Transaction` com:

- `kind` igual a `income` ou `expense`;
- `status` igual a `posted` ou `reconciled`;
- `occurredOn` dentro do mês de referência;
- organização e perfil financeiro do contexto autenticado.

Transferências não entram no resultado econômico.

A transação usada para liquidar uma fatura é excluída de receitas/despesas exclusivamente quando estiver referenciada por `Invoice.paymentTransactionId`, sempre dentro do mesmo tenant e perfil. Essa é a mesma referência canônica documentada em [`CARDS.md`](./CARDS.md) e [`API_REPORTS.md`](./API_REPORTS.md).

Assim:

- a compra no cartão permanece como despesa econômica no período de `occurredOn`;
- o pagamento da fatura continua existindo como movimento de caixa, mas não cria uma segunda despesa econômica;
- descrição, valor, data, `cardId` isolado ou semelhança textual nunca classificam uma transação como liquidação;
- uma despesa comum com o mesmo valor e a mesma descrição do pagamento continua elegível quando não estiver referenciada por `Invoice.paymentTransactionId`.

## `plannedCommitmentsMinor`

Compromissos do mês usam `plannedOn` e entram somente quando:

- `kind = expense`;
- `status` é `planned` ou `suggested`;
- `effectiveOn` está ausente;
- `plannedOn` pertence ao mês da data de referência.

Quando uma compra de cartão gera a previsão de pagamento da fatura, essa previsão pode aparecer como compromisso futuro. Após a liquidação, a previsão é anulada pelo fluxo canônico do cartão e deixa de participar do total planejado; a transação efetiva do pagamento passa a afetar somente o caixa.

## Itens recentes

`recentItems` continua sendo uma lista operacional das transações não anuladas mais recentes. Uma liquidação de fatura pode aparecer nessa lista porque o evento de caixa é auditável. A presença em `recentItems` não significa que o mesmo item participe de `expensesMinor`.

## Exemplo de resposta

```json
{
  "currency": "BRL",
  "availableBalanceMinor": 125000,
  "incomeMinor": 80000,
  "expensesMinor": 42000,
  "plannedCommitmentsMinor": 18000,
  "recentItems": [],
  "generatedAt": "2035-07-12T12:00:00.000Z"
}
```

Todos os valores monetários permanecem em unidades menores.

## Consumidor web

O dashboard consome `GET /api/financial-summary` e usa diretamente `availableBalanceMinor`, `incomeMinor`, `expensesMinor` e `plannedCommitmentsMinor`. Cálculo financeiro no cliente permanece proibido para esses indicadores.

## Validação esperada

Mudanças nesta área devem provar, no mesmo cenário integrado:

- saldo inicial de conta;
- receita realizada em conta;
- despesa realizada em conta;
- transferência sem alteração do resultado econômico líquido;
- compra de cartão sem redução antecipada do saldo bancário;
- previsão de pagamento como compromisso enquanto ainda não efetiva;
- pagamento da fatura reduzindo a conta pagadora uma única vez;
- pagamento não duplicando a despesa econômica;
- uma despesa comum parecida com o pagamento permanecendo contabilizada;
- datas divergentes entre `occurredOn`, `plannedOn` e `effectiveOn` obedecendo à fonte temporal de cada métrica.
