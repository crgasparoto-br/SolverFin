# Contas a pagar e a receber - legado

## Status

`PayableReceivable` e um dominio/API legado de compatibilidade. Ele continua existindo para preservar dados historicos, auditoria, integracoes internas e transicao tecnica segura, mas nao representa mais uma tela operacional ativa no produto.

A decisao de produto da #284 consolida a rotina assim:

- receitas, despesas, transferencias e compromissos previstos de conta corrente ficam no **Extrato da conta** (`/lancamentos`);
- compras, faturas, fechamento e pagamento de cartao ficam em **Cartoes de Credito** (`/cartoes`);
- a rota historica `/pagar-receber` nao deve ser apresentada como jornada principal nem como destino operacional novo.

Enquanto a #290 nao concluir a transicao tecnica do dominio, este documento serve como referencia de compatibilidade para registros antigos. Novas implementacoes de produto devem preferir `Transaction`, `Invoice`, recorrencias e parcelas materializadas conforme o fluxo de origem.

## Regra de transicao

Dados antigos de `PayableReceivable` nao podem ser perdidos. Leitores temporarios podem continuar consultando esse recurso quando precisarem preservar historico ou compatibilidade, mas devem evitar dupla contagem quando houver:

- `settlementTransactionId` apontando para um `Transaction` existente;
- `Transaction` equivalente ja representando o mesmo compromisso planejado ou efetivado;
- `Invoice` aberta/fechada representando compromisso de cartao.

## Modelo legado

Contas a pagar e a receber usam o mesmo recurso persistente `PayableReceivable`.

Campos principais:

- `kind`: `payable` para conta a pagar ou `receivable` para conta a receber.
- `status`: `pending`, `settled` ou `cancelled`.
- `amountMinor`: valor em unidade menor da moeda.
- `currency`: moeda ISO 4217, com `BRL` como padrao.
- `dueOn`: data de vencimento.
- `description`: descricao curta e segura.
- `accountId`: conta financeira vinculada, quando aplicavel.
- `categoryId`: categoria vinculada, quando aplicavel.
- `settlementTransactionId`: lancamento criado ou associado ao concluir.
- `settledAt`: data/hora da conclusao.
- `cancelledAt`: data/hora do cancelamento.

Todos os registros carregam `organizationId` e `financialProfileId`.

## Endpoints legados

Todos os endpoints exigem sessao autenticada e respeitam `profileId` quando informado na query string. Eles devem ser tratados como compatibilidade enquanto a remocao segura nao for planejada na #290.

### Listar

```http
GET /api/payables-receivables
```

Filtros opcionais:

- `kind=payable|receivable`
- `status=pending|settled|cancelled|all`
- `accountId=<uuid>`
- `categoryId=<uuid>`
- `dueFrom=YYYY-MM-DD`
- `dueTo=YYYY-MM-DD`

Resposta:

```json
{
  "payablesReceivables": []
}
```

### Criar

```http
POST /api/payables-receivables
```

Payload:

```json
{
  "kind": "payable",
  "amountMinor": 12500,
  "dueOn": "2026-06-25",
  "description": "Fornecedor ficticio",
  "accountId": "uuid-opcional",
  "categoryId": "uuid-opcional",
  "currency": "BRL"
}
```

Resposta `201`:

```json
{
  "payableReceivable": {
    "status": "pending"
  }
}
```

### Obter detalhe

```http
GET /api/payables-receivables/:payableReceivableId
```

### Atualizar

```http
PATCH /api/payables-receivables/:payableReceivableId
```

Campos aceitos:

- `kind`
- `status`
- `amountMinor`
- `dueOn`
- `description`
- `currency`
- `accountId`
- `categoryId`

### Concluir pagamento ou recebimento

```http
POST /api/payables-receivables/:payableReceivableId/settle
```

Payload:

```json
{
  "settledOn": "2026-06-26",
  "accountId": "uuid-da-conta",
  "categoryId": "uuid-opcional",
  "description": "Pagamento ficticio",
  "existingTransactionId": "uuid-opcional"
}
```

Quando `existingTransactionId` nao e informado, a API cria um lancamento final:

- `expense` para `payable`;
- `income` para `receivable`.

Pagamentos parciais ainda nao sao suportados no MVP.

### Cancelar

```http
POST /api/payables-receivables/:payableReceivableId/cancel
```

Cancelamento e a exclusao logica do MVP para este dominio. Nao ha exclusao fisica, arquivamento separado ou restauracao/reativacao neste contrato inicial.

## Web legado

A tela dedicada `/pagar-receber` foi retirada da jornada operacional ativa. O usuario deve criar e acompanhar compromissos em:

- `/lancamentos`, para receitas, despesas, transferencias e previsoes de conta;
- `/cartoes`, para compras, faturas, fechamento e pagamento de cartao.

Qualquer rota, tela ou componente remanescente de `PayableReceivable` deve ser tratado como compatibilidade temporaria, nao como experiencia principal. Nao adicionar novos links de navegacao, chamadas de Dashboard ou fluxos de onboarding para `/pagar-receber`.

## Regras de tenant e auditoria

- Toda consulta filtra por `organizationId` e `financialProfileId`.
- Tentativas de acesso cruzado retornam erro controlado.
- Criacao, edicao, conclusao e cancelamento registram auditoria com mudancas redigidas.
- Dados financeiros nao devem aparecer completos em logs, fixtures ou mensagens de erro.
