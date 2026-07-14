# API de índices financeiros e remuneração de contas

Este documento descreve os contratos HTTP e operacionais implementados para a remuneração prevista de contas indexada ao CDI.

A regra funcional e as decisões de domínio permanecem em [`ACCOUNT_REMUNERATION_CDI.md`](./ACCOUNT_REMUNERATION_CDI.md) e no ADR [`0005-financial-indexes-shared-domain.md`](./adr/0005-financial-indexes-shared-domain.md).

## Fonte do CDI

- provider padrão: Banco Central do Brasil;
- série SGS: `12`;
- código interno: `CDI`;
- origem persistida: `BCB_SGS_12`;
- período enviado à fonte: `dataInicial` e `dataFinal`;
- formato esperado: lista JSON com `data` em `DD/MM/YYYY` e `valor` decimal;
- importação idempotente por `kind + referenceOn`.

O endpoint do provider pode ser sobrescrito por `BCB_SGS_CDI_URL` apenas para testes controlados ou migração de provider.

## Configuração por conta

### `GET /api/account-remuneration/configurations`

Lista todas as contas ativas do perfil financeiro corrente e a configuração de remuneração associada.

Resposta resumida:

```json
{
  "configurations": [
    {
      "accountId": "uuid",
      "accountName": "Conta principal",
      "accountCurrency": "BRL",
      "enabled": true,
      "indexKind": "cdi",
      "remunerationPercent": 100,
      "startsOn": "2026-07-01",
      "categoryId": "uuid"
    }
  ]
}
```

### `PUT /api/account-remuneration/configurations/:accountId`

Cria ou atualiza a configuração da conta no perfil corrente.

```json
{
  "enabled": true,
  "remunerationPercent": 100,
  "startsOn": "2026-07-01",
  "categoryId": "uuid opcional"
}
```

Regras:

- somente contas ativas e em `BRL` podem ser habilitadas;
- o percentual deve ser maior que zero e menor ou igual a `1000`;
- a data inicial e o percentual são obrigatórios quando `enabled=true`;
- a categoria, quando informada, deve ser uma categoria ativa de receita do mesmo tenant;
- alteração de percentual ou data inicial afeta apenas competências ainda não processadas.

## Administração global

Os endpoints abaixo exigem usuário master configurado em `SOLVERFIN_MASTER_EMAILS`.

### `GET /api/admin/financial-indexes/status`

Retorna:

- última taxa CDI confirmada;
- última importação;
- último processamento;
- quantidade de configurações ativas;
- quantidade de configurações pendentes por falta de taxa.

### `POST /api/admin/financial-indexes/cdi/import`

```json
{
  "startsOn": "2026-07-01",
  "endsOn": "2026-07-14"
}
```

Quando o período não é informado, a API consulta os últimos dez dias até a data atual. Taxas já persistidas não são atualizadas nem duplicadas.

### `POST /api/admin/account-remunerations/process`

```json
{
  "processedOn": "2026-07-14"
}
```

O processamento:

1. adquire lock transacional para impedir duas execuções concorrentes;
2. seleciona configurações ativas e taxas confirmadas anteriores à data de processamento;
3. ignora competências já registradas;
4. calcula o saldo final efetivo da conta até a competência;
5. aplica a taxa diária do CDI e o percentual configurado;
6. cria uma receita `PLANNED` com origem `ACCOUNT_REMUNERATION` na data de processamento;
7. persiste saldo-base, taxa, percentual e valor original em `AccountRemuneration`.

Contas com saldo-base igual ou inferior a zero não geram rendimento.

## Execução automática

A API pode executar o ciclo diário quando:

```dotenv
ACCOUNT_REMUNERATION_DAILY_ENABLED=true
ACCOUNT_REMUNERATION_DAILY_HOUR_UTC=10
```

O ciclo automático:

- consulta os últimos dez dias da série CDI;
- importa apenas datas ausentes;
- processa competências pendentes;
- executa no máximo uma vez por data UTC em cada instância;
- usa idempotência de banco e lock transacional para proteger ambientes com mais de uma instância.

Em produção, prefira habilitar o scheduler em apenas uma instância da API.

## Ajuste manual e conciliação

O rendimento é um lançamento previsto comum no extrato:

- pode ser editado;
- pode ser efetivado e conciliado pelo fluxo existente;
- preserva o valor originalmente calculado em `AccountRemuneration.originalAmountMinor`;
- alterações de `Transaction.amountMinor` marcam automaticamente `manuallyAdjusted`, `adjustedAt` e `adjustedByUserId` por trigger de banco;
- reprocessamentos não sobrescrevem o lançamento nem o ajuste manual.

A descrição do lançamento apresenta percentual do CDI, competência, saldo-base, taxa diária e valor original para consulta direta no extrato.

## Erros operacionais relevantes

- `ACCOUNT_REMUNERATION_ALREADY_RUNNING`: já existe processamento concorrente;
- `ACCOUNT_REMUNERATION_CONFIGURATION_INCOMPLETE`: percentual ou data inicial ausentes;
- `ACCOUNT_REMUNERATION_CURRENCY_UNSUPPORTED`: conta fora de BRL;
- `ACCOUNT_REMUNERATION_CATEGORY_INVALID`: categoria fora do tenant ou não classificada como receita;
- `FINANCIAL_INDEX_PROVIDER_UNAVAILABLE`: indisponibilidade ou resposta inválida da fonte oficial;
- `FINANCIAL_INDEX_PERIOD_INVALID`: período de importação inválido.

Todas as importações e processamentos geram registro em `FinancialIndexOperation`, incluindo contagens, estado, mensagem e falhas.
