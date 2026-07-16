# Diagnósticos das operações CDI

Este documento define os campos adicionais retornados e persistidos pelas operações administrativas de índices financeiros e remuneração de contas.

Os contratos funcionais e as regras de cálculo permanecem em [`API_ACCOUNT_REMUNERATION.md`](./API_ACCOUNT_REMUNERATION.md) e [`ACCOUNT_REMUNERATION_CDI.md`](./ACCOUNT_REMUNERATION_CDI.md). Os diagnósticos descritos aqui não alteram fórmula, arredondamento, idempotência, seleção de competências nem criação de receitas previstas.

## Persistência, atomicidade e compatibilidade

`FinancialIndexOperation.diagnostics` armazena um objeto JSONB com contagens e períodos agregados. O conteúdo não inclui organização, perfil financeiro, conta, lançamento ou resposta bruta do Banco Central.

Em execuções concluídas com sucesso, o efeito financeiro e o diagnóstico são confirmados na mesma transação. Se o diagnóstico não puder ser persistido, a importação ou o processamento é revertido e a operação é registrada separadamente como `FAILED`, sem manter taxa, remuneração ou receita prevista parcialmente confirmada.

Os locks transacionais existentes continuam impedindo duas importações do CDI ou dois processamentos de remuneração simultâneos. A classificação do resultado usa a consulta realmente executada após a aquisição do lock, evitando diagnósticos incorretos em concorrência. Quando uma execução falha, o diagnóstico é associado à operação criada pela própria transação, sem selecionar outro registro apenas por proximidade de horário.

Operações criadas antes desta mudança possuem `diagnostics = null`. A API e a interface continuam exibindo `message` e as contagens legadas nesses registros.

## Atualização do CDI

### Endpoint

`POST /api/admin/financial-indexes/cdi/import`

A resposta mantém `operation`, `receivedCount` e `importedCount` e acrescenta `outcome` e `diagnostics`:

```json
{
  "operation": {
    "status": "SUCCESS",
    "message": "O Banco Central foi consultado no período 15/07/2026 a 16/07/2026, retornou 1 taxa(s) e 1 nova(s) taxa(s) CDI foram importada(s).",
    "diagnostics": {
      "kind": "CDI_IMPORT",
      "outcome": "IMPORTED",
      "requestedPeriod": {
        "startsOn": "2026-07-01",
        "endsOn": "2026-07-16"
      },
      "effectivePeriod": {
        "startsOn": "2026-07-15",
        "endsOn": "2026-07-16"
      },
      "providerConsulted": true,
      "receivedCount": 1,
      "importedCount": 1
    }
  },
  "outcome": "IMPORTED",
  "receivedCount": 1,
  "importedCount": 1,
  "diagnostics": {
    "kind": "CDI_IMPORT",
    "outcome": "IMPORTED",
    "requestedPeriod": {
      "startsOn": "2026-07-01",
      "endsOn": "2026-07-16"
    },
    "effectivePeriod": {
      "startsOn": "2026-07-15",
      "endsOn": "2026-07-16"
    },
    "providerConsulted": true,
    "receivedCount": 1,
    "importedCount": 1
  }
}
```

Resultados de sucesso:

- `IMPORTED`: a fonte foi consultada e pelo menos uma nova taxa foi persistida;
- `ALREADY_UP_TO_DATE`: a maior data armazenada já cobre o período solicitado, portanto a fonte não foi consultada;
- `PROVIDER_NO_RATES`: a fonte foi consultada, mas não retornou taxas no período, situação comum em fins de semana e feriados;
- `NO_NEW_RECORDS`: a fonte retornou taxas, mas nenhuma gerou um novo registro.

A data inicial não pode ser posterior à data final. Essa faixa é rejeitada com `FINANCIAL_INDEX_PERIOD_INVALID` antes de criar uma operação e nunca é classificada como `ALREADY_UP_TO_DATE`.

Falhas mantêm `operation.status = FAILED`, preservam a mensagem técnica localizada e podem registrar `outcome = FAILED` para indicar o período e se a fonte chegou a ser consultada.

## Processamento de contas remuneradas

### Endpoint

`POST /api/admin/account-remunerations/process`

A resposta mantém todas as contagens anteriores e acrescenta `diagnostics`:

```json
{
  "operation": {
    "status": "SUCCESS",
    "message": "Foram processadas 3 competência(s): 1 receita(s) prevista(s) criada(s) nos Extratos dos respectivos perfis, 1 concluída(s) sem lançamento por saldo não positivo e 1 por arredondamento para zero.",
    "diagnostics": {
      "kind": "ACCOUNT_REMUNERATION",
      "processedOn": "2026-07-16",
      "activeConfigurations": 5,
      "notEligibleConfigurations": 1,
      "configurationsWithoutRates": 1,
      "eligibleCompetences": 6,
      "alreadyRegisteredCompetences": 3,
      "processedCompetences": 3,
      "plannedTransactionsCreated": 1,
      "nonPositiveBalanceCompetences": 1,
      "zeroAmountCompetences": 1,
      "pendingCompetences": 0
    }
  }
}
```

Significado das unidades:

- `activeConfigurations`, `notEligibleConfigurations` e `configurationsWithoutRates` contam configurações;
- os demais campos contam competências, exceto `plannedTransactionsCreated`, que conta receitas previstas criadas;
- `notEligibleConfigurations` considera configurações cuja data inicial é igual ou posterior à data de processamento;
- somente taxas com data anterior à data de processamento são elegíveis.

Relações obrigatórias:

```text
eligibleCompetences = alreadyRegisteredCompetences + processedCompetences
processedCompetences = plannedTransactionsCreated
                     + nonPositiveBalanceCompetences
                     + zeroAmountCompetences
```

Quando `processedCompetences = 0`, a mensagem diferencia configurações ainda não iniciadas, configurações sem taxa e competências que já possuíam resultado. A ausência de novas receitas previstas não é apresentada como falha e usa a expressão “Nenhuma alteração necessária”.

## Consulta de status e interface

`GET /api/admin/financial-indexes/status` inclui os diagnósticos persistidos em `latestImport.diagnostics` e `latestProcessing.diagnostics`.

A página `/admin/indices-financeiros` usa o mesmo objeto retornado pelo POST e pelo status recarregado. Assim, a confirmação imediata e o histórico mais recente preservam o mesmo motivo, período e conjunto de contagens. Faixas de importação invertidas são rejeitadas antes do envio e falhas de transporte reabilitam o botão para nova tentativa.
