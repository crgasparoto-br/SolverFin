# API de relatorios

## Evolucao por categoria

`GET /api/reports/category-evolution` retorna uma matriz temporal somente leitura baseada em `Transaction` para o perfil financeiro resolvido no servidor.

### Autenticacao e tenant

O endpoint exige sessao valida e resolve organizacao/perfil com `resolveRequestTenantContext`. O cliente pode informar somente `profileId`; `organizationId` e `financialProfileId` nunca sao aceitos como escopo confiavel.

Perfis inexistentes, arquivados ou fora do contexto seguem o contrato publico de erros de tenant e nao retornam agregados parciais.

### Parametros

```text
interval=monthly|annual|rolling-year
start=AAAA-MM        # monthly e rolling-year
start=AAAA           # annual
periods=<inteiro>
profileId=<uuid>     # opcional, conforme docs/TENANT.md
```

Padroes e limites:

| Intervalo      | Inicio padrao                                         | Quantidade padrao | Limite |
| -------------- | ----------------------------------------------------- | ----------------: | -----: |
| `monthly`      | ultima coluna termina no mes UTC corrente             |                12 |     24 |
| `annual`       | ultima coluna e o ano UTC corrente                    |                 3 |     10 |
| `rolling-year` | ultima coluna de 12 meses termina no mes UTC corrente |                 3 |     10 |

Parametro ausente usa o padrao. Parametro presente e invalido retorna:

```text
400 REPORT_CATEGORY_EVOLUTION_FILTER_INVALID
```

A mensagem identifica com seguranca o campo que deve ser corrigido. Nenhuma consulta financeira e executada depois de falha de validacao.

### Fonte e consulta

A consulta considera uma vez cada `Transaction` que atenda simultaneamente:

- organizacao e perfil financeiro resolvidos;
- `kind` igual a `income` ou `expense`;
- `status` igual a `posted` ou `reconciled`;
- `occurredOn` dentro de um dos periodos, com limites inclusivos.

`transfer`, `planned`, `suggested` e `voided` nao entram. Vinculos com grupo, parcela, fatura, recorrencia, importacao, sugestao ou origem nao criam movimentos adicionais.

A implementacao usa uma consulta agregada por periodos/categoria/moeda e uma consulta da taxonomia atual. A quantidade de consultas nao cresce com a quantidade de colunas ou categorias. Nao ha escrita nem `AuditLogEntry` de mutacao.

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
- o payload nao contem lancamentos individuais, descricoes, contas, cartoes ou IDs de transacao.

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

A API nao retorna sucesso parcial. Alem dos erros de autenticacao/tenant e do erro de filtro, falhas inesperadas usam o envelope padrao com `correlationId`, sem dados financeiros brutos.

## Interface web relacionada

`/relatorios?view=category-evolution` consome este endpoint por SSR. A visao `view=installments` continua usando `GET /api/installments`. Consulte [`REPORTS.md`](./REPORTS.md) para navegacao, apresentacao e estados da interface.
