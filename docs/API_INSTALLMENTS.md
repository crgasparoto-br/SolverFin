# API de consulta e manutencao de parcelas

## Objetivo

Este contrato adiciona uma leitura historica, atual e futura de parcelas para as telas existentes do SolverFin. Ele nao cria uma rota web dedicada de Parcelas; a web deve consumir esses dados dentro de `/lancamentos`, `/cartoes` e `/relatorios`.

A manutencao direta continua controlada pelo backend e limitada a campos seguros da transacao vinculada. O cliente nao pode alterar fatura, cartao agrupador, instrumento, valor, vencimento, tenant ou perfil financeiro por esta rota.

## Endpoints

```http
GET /api/installments
PATCH /api/installments/:installmentId
```

As rotas usam a sessao autenticada e resolvem `organizationId` e `financialProfileId` no servidor. O cliente nao deve enviar esses campos como autoridade de escopo. Quando houver mais de um perfil ativo, o filtro `profileId` segue o contrato atual de tenant.

## Filtros de consulta

Todos os filtros sao opcionais:

```text
installmentId
transactionId
accountId
recurrenceId
cardId
cardInstrumentId
invoiceId
categoryId
dueFrom
dueTo
operationalFrom
operationalTo
status
profileId
```

`dueFrom`, `dueTo`, `operationalFrom` e `operationalTo` usam `YYYY-MM-DD` e precisam representar uma data real do calendario. `status` aceita `planned`, `posted`, `reconciled`, `cancelled` ou `all`.

`accountId` filtra parcelas pela transacao vinculada a uma conta. No Extrato, `operationalFrom` e `operationalTo` acompanham a mesma precedencia de data exibida pela linha (`effectiveOn`, `plannedOn`, `occurredOn` e `dueOn` como fallback), inclusive quando a efetivacao ocorreu em mes diferente do vencimento.

Periodo invertido, data inexistente como `2026-02-31`, formato invalido ou status desconhecido retornam erro controlado `400 INSTALLMENTS_FILTER_INVALID`.

## Resposta de consulta

```json
{
  "installments": [
    {
      "id": "installment-demo",
      "financialProfileId": "profile-demo",
      "status": "planned",
      "sequenceNumber": 2,
      "totalInstallments": 6,
      "dueOn": "2026-08-05",
      "amountMinor": 12345,
      "currency": "BRL",
      "transaction": {
        "id": "transaction-demo",
        "status": "planned",
        "accountId": "account-demo",
        "categoryId": "category-demo",
        "plannedOn": "2026-08-05",
        "description": "Assinatura ficticia"
      },
      "recurrence": {
        "id": "recurrence-demo",
        "status": "active",
        "frequency": "monthly",
        "interval": 1,
        "description": "Assinatura ficticia"
      },
      "category": {
        "id": "category-demo",
        "name": "Categoria ficticia",
        "kind": "expense",
        "status": "active"
      },
      "editable": true
    }
  ]
}
```

Vinculos opcionais ausentes sao omitidos. Isso permite renderizar historico parcial sem quebrar as telas quando uma parcela antiga nao tiver categoria, fatura, cartao, instrumento ou transacao carregavel.

## Elegibilidade de manutencao

Cada item informa `editable` e, quando bloqueado, `editBlockedReason`.

Razoes iniciais:

```text
linked_transaction_missing
installment_status_locked
transaction_status_locked
invoice_linked
```

Parcelas ligadas a fatura, transacao postada/conciliada/cancelada, parcela nao planejada ou sem transacao vinculada nao devem exibir acao de edicao direta. O backend revalida a mesma elegibilidade durante o `PATCH` para cobrir mudancas de estado entre consulta e salvamento.

## PATCH /api/installments/:installmentId

Payload permitido:

```json
{
  "description": "Assinatura ficticia ajustada",
  "note": "Observacao ficticia opcional",
  "categoryId": "category-demo"
}
```

Todos os campos sao opcionais, mas o payload deve trazer pelo menos um deles. `note` pode ser `null` para limpar a observacao. Campos fora da allowlist retornam `400 INSTALLMENT_PAYLOAD_INVALID`.

A mutacao atualiza a transacao vinculada de forma atomica pelo fluxo existente de transacao, sincroniza a parcela quando necessario e grava auditoria minimizada/redigida da mutacao financeira. A resposta retorna a parcela recarregada:

```json
{
  "installment": {
    "id": "installment-demo",
    "status": "planned",
    "transaction": {
      "id": "transaction-demo",
      "description": "Assinatura ficticia ajustada",
      "categoryId": "category-demo"
    },
    "editable": true
  }
}
```

Bloqueios de elegibilidade retornam `409 INSTALLMENT_EDIT_BLOCKED`. A leitura de elegibilidade, o bloqueio das linhas de `Transaction`/`Installment`, a atualização e a auditoria ocorrem na mesma transação de banco para impedir alteração após mudança concorrente de estado. Recurso inexistente ou fora do tenant/profile ativo retorna o comportamento padrao de recurso nao encontrado.

## Tenant e privacidade

- Listagens e mutacoes filtram apenas dados do contexto ativo.
- Acesso por `profileId` fora do escopo do usuario segue o comportamento atual de tenant.
- A resposta evita payload financeiro completo de auditoria e retorna apenas os vinculos necessarios para exibicao operacional.
- Exemplos usam dados ficticios.

## Telas consumidoras

- `/lancamentos`: listar parcelas por `accountId`, periodo e vinculo com a transacao original de conta, exibindo manutencao apenas quando `editable` for verdadeiro.
- `/cartoes`: listar historico por cartao agrupador, instrumento, fatura, periodo e compra/recorrencia quando os vinculos existirem.
- `/relatorios`: usar a mesma leitura como base para visao consolidada somente leitura.

## Consumo nas listas operacionais

- `/lancamentos` executa no máximo uma consulta complementar por renderização, usando `accountId`, `operationalFrom`, `operationalTo`, `status=all` e o `profileId` ativo quando existir. Na visão mensal, o período cobre o mês selecionado; quando o filtro `day` estiver ativo, os dois limites usam exatamente o dia exibido. A associação acontece por `installment.transaction.id` com a linha já renderizada. Falha nessa consulta não impede o carregamento do extrato.
- `/cartoes` executa no máximo uma consulta complementar usando o `invoiceId` selecionado e associa a parcela pela transação da compra. Não usar `cardId` isolado nesse fluxo, pois ele omite parcelas já vinculadas à fatura.
- A interface mostra `Parcela X de Y` dentro da própria linha. Não existe painel, rota ou linha paralela de parcelas.
- `categoryId` aceita uma string válida ou `null`; `null` remove a categoria da transação vinculada. String vazia continua inválida.
- A edição direta de parcela de conta envia apenas os campos efetivamente alterados entre `description`, `note` e `categoryId`. Sem alteração, o cliente não envia `PATCH`. Categoria arquivada vinculada ao histórico é preservada no formulário e só é removida quando o usuário escolhe explicitamente **Sem categoria**.
- Para `409 INSTALLMENT_EDIT_BLOCKED`, o modal permanece aberto, conserva os valores digitados e permite recarregar o estado atual. O endpoint genérico `PATCH /api/transactions/:transactionId` retorna `409 INSTALLMENT_DIRECT_UPDATE_REQUIRED` para mutações de dados de uma transação com `installmentId`; a única exceção é o payload exclusivo de situação usado pela ação operacional existente de conciliar ou desconciliar. A exceção valida o estado atual: `planned|posted -> reconciled` e `reconciled -> posted` são permitidos; `planned -> posted`, payload combinado e qualquer outro status continuam bloqueados. Assim, indisponibilidade ou atraso da consulta complementar não libera alteração de valor, datas, conta, descrição, categoria ou outros campos fora do contrato da parcela.
- Parcelas com `invoice_linked` são mantidas em leitura no contrato de parcelas; a edição operacional continua exclusivamente no endpoint da compra da fatura.
