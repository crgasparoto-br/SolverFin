# API de relatorios

## Evolucao por categoria

`GET /api/reports/category-evolution` retorna uma matriz temporal somente leitura baseada em `Transaction` para o perfil financeiro resolvido no servidor.

### Autenticacao e tenant

O endpoint exige sessao valida e resolve organizacao/perfil com `resolveRequestTenantContext`. O cliente pode informar `profileId`; `organizationId` e `financialProfileId` nunca sao aceitos como escopo confiavel.

Quando `accountId` e informado, a API valida antes dos agregados que a conta existe, esta ativa e pertence simultaneamente a organizacao e ao perfil financeiro resolvidos.

Quando `cardId` e informado, a API valida que o cartao agrupador existe, possui status `active` ou `blocked` e pertence a mesma organizacao e perfil financeiro.

Conta ou cartao inexistente, arquivado ou fora desse escopo usa o mesmo contrato publico, sem revelar entidade, existencia, status ou vinculo:

```text
404 REPORT_CATEGORY_EVOLUTION_SOURCE_NOT_AVAILABLE
```

Nenhum agregado parcial e retornado nesses casos.

### Parametros

```text
interval=monthly|annual|rolling-year
start=AAAA-MM        # monthly e rolling-year
start=AAAA           # annual
periods=<inteiro>
profileId=<uuid>     # opcional, conforme docs/TENANT.md
accountId=<uuid>     # opcional e mutuamente exclusivo com cardId
cardId=<uuid>        # opcional e mutuamente exclusivo com accountId
```

A ausencia simultanea de `accountId` e `cardId` representa **Todas as contas e cartoes**. Enviar os dois identificadores na mesma requisicao nao representa intersecao ou precedencia; a API rejeita a requisicao antes da consulta financeira.

Padroes e limites:

| Intervalo      | Inicio padrao                                         | Quantidade padrao | Limite |
| -------------- | ----------------------------------------------------- | ----------------: | -----: |
| `monthly`      | ultima coluna termina no mes UTC corrente             |                12 |     24 |
| `annual`       | ultima coluna e o ano UTC corrente                    |                 3 |     10 |
| `rolling-year` | ultima coluna de 12 meses termina no mes UTC corrente |                 3 |     10 |

Parametro ausente usa o padrao. Parametro presente e invalido, inclusive `accountId`/`cardId` vazio, malformado ou combinado, retorna:

```text
400 REPORT_CATEGORY_EVOLUTION_FILTER_INVALID
```

A mensagem identifica com seguranca o campo ou o conflito que deve ser corrigido. A validacao dos filtros ocorre antes da consulta financeira do relatorio.

### Fonte e consulta

A consulta considera uma vez cada `Transaction` que atenda simultaneamente:

- organizacao e perfil financeiro resolvidos;
- `kind` igual a `income` ou `expense`;
- `status` igual a `posted` ou `reconciled`;
- `occurredOn` dentro de um dos periodos, com limites inclusivos;
- nao seja a transacao de liquidacao de uma fatura, identificada exclusivamente pela referencia canonica `Invoice.paymentTransactionId`.

A referencia `Invoice.paymentTransactionId` e o discriminador persistido entre **despesa economica da compra** e **movimento de caixa da liquidacao**. Uma transacao de pagamento de fatura continua existindo e pode afetar calculos de caixa apropriados, mas nao cria uma segunda despesa economica neste relatorio. Descricao, valor, data ou semelhanca textual nunca sao usados para inferir essa classificacao.

Sem `accountId` e sem `cardId`, entram todas as transacoes elegiveis do perfil, inclusive movimentos sem conta ou cartao vinculados, exceto as liquidacoes de fatura referenciadas por `Invoice.paymentTransactionId`.

Com `accountId`, entra somente a transacao cujo `Transaction.accountId` seja exatamente a conta selecionada. Movimentos de outra conta, sem `accountId` ou que mencionem a conta apenas em `destinationAccountId` nao entram no recorte. Se a conta for usada para pagar uma fatura, a transacao referenciada por `Invoice.paymentTransactionId` tambem e excluida; uma despesa legitima da mesma conta, ainda que tenha o mesmo valor ou descricao semelhante, permanece elegivel quando nao estiver referenciada.

Com `cardId`, entra somente a transacao cujo `Transaction.cardId` seja exatamente o cartao agrupador selecionado. Como todos os instrumentos da compra persistem o mesmo `cardId`, o recorte abrange instrumentos fisicos, virtuais, principais e adicionais, inclusive instrumento posteriormente arquivado quando a transacao historica continua elegivel. `cardInstrumentId` e `invoiceId` nao sao filtros desta API. A liquidacao referenciada por `Invoice.paymentTransactionId` permanece excluida pelo mesmo contrato canonico.

As exclusoes existentes de `transfer`, `planned`, `suggested` e `voided` permanecem efetivas. Vinculos com grupo, parcela, fatura, recorrencia, importacao, sugestao ou origem nao criam movimentos adicionais.

A implementacao usa uma validacao constante da origem, uma consulta agregada por periodos/categoria/moeda e uma consulta da taxonomia atual. A quantidade de consultas nao cresce com a quantidade de contas, cartoes, instrumentos, periodos ou categorias. Nao ha escrita nem `AuditLogEntry` de mutacao.

### Resposta

```json
{
  "report": {
    "interval": "monthly",
    "start": "2025-08",
    "periodCount": 12,
    "periods": [
      {
        "key": "2025-08",
        "label": "Ago/25",
        "accessibleLabel": "Agosto de 2025",
        "startsOn": "2025-08-01",
        "endsOn": "2025-08-31"
      }
    ],
    "currencyBlocks": [
      {
        "currency": "BRL",
        "income": {},
        "incomeCategories": [],
        "expense": {},
        "expenseCategories": [],
        "result": {}
      }
    ]
  }
}
```

Cada serie possui:

```json
{
  "cells": [{ "amountMinor": 10000, "percentage": 25 }],
  "totalMinor": 10000,
  "totalPercentage": 25,
  "averageMinor": 10000,
  "averagePercentage": 25
}
```

Regras:

- `currencyBlocks` e ordenado pelo codigo da moeda;
- receita e despesa usam magnitudes nao negativas no payload;
- resultado preserva o sinal real;
- cada celula segue a ordem de `periods`;
- denominador zero produz `percentage: null`;
- percentuais sao arredondados para ate duas casas;
- media monetaria inclui periodos zerados e usa empate afastado de zero;
- `averagePercentage` usa a mesma razao agregada de `totalPercentage`;
- o payload nao contem conta, cartao, instrumento, fatura, lancamentos individuais, descricoes ou IDs de transacao;
- `accountId` e `cardId` sao somente filtros de entrada e nao aparecem na resposta.

### Categorias

Cada no possui `categoryId`, `name`, `status`, `series` e `children`.

- pais consolidam valores diretos e toda a subarvore;
- cada lancamento conta uma vez no total da secao;
- a taxonomia e o nome atuais sao usados tambem para historico;
- categorias arquivadas aparecem quando possuem movimento;
- lancamentos sem categoria usam no sintetico `categoryId: null`, nome `Sem categoria` e status `synthetic`;
- nos zerados em todo o recorte sao omitidos;
- irmaos sao ordenados por magnitude total decrescente e depois por nome `pt-BR`.

### Erros

A API nao retorna sucesso parcial. Alem dos erros de autenticacao/tenant, de filtro e de origem nao consultavel, falhas inesperadas usam o envelope padrao com `correlationId`, sem dados financeiros brutos.

## Interface web relacionada

`/relatorios?view=category-evolution` consome este endpoint por SSR e consulta `GET /api/accounts?status=active` e `GET /api/credit-card-accounts?status=all` para montar um unico seletor agrupado. Se qualquer lista falhar, a pagina nao apresenta a outra como resultado parcial. A visao `view=installments` continua usando `GET /api/installments`. Consulte [`REPORTS.md`](./REPORTS.md) para navegacao, apresentacao e estados da interface.
