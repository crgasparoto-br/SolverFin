# Contas a pagar e a receber - legado

## Status

`PayableReceivable` e um dominio/API legado de compatibilidade. Ele continua existindo para preservar dados historicos, auditoria, integracoes internas e transicao tecnica segura, mas nao representa mais uma tela operacional ativa no produto.

A decisao de produto da #284 consolida a rotina assim:

- receitas, despesas, transferencias e compromissos previstos de conta corrente ficam no **Extrato da conta** (`/lancamentos`);
- compras, faturas, fechamento e pagamento de cartao ficam em **Cartoes de Credito** (`/cartoes`);
- a rota historica `/pagar-receber` nao deve ser apresentada como jornada principal nem como destino operacional novo.

A transicao tecnica da #290 esta registrada em [`docs/PAYABLES_RECEIVABLES_TRANSITION.md`](./PAYABLES_RECEIVABLES_TRANSITION.md). Novas implementacoes de produto devem preferir `Transaction`, `Invoice`, recorrencias e parcelas materializadas conforme o fluxo de origem.

Este documento e o contrato consolidado do legado. Nao mantenha documentos paralelos de API para `PayableReceivable`; acrescente ajustes aqui e referencie o plano de transicao quando a mudanca envolver migracao ou encerramento de compatibilidade.

## Fontes operacionais preferenciais

Novos compromissos financeiros devem usar:

- `Transaction` planejado/sugerido/postado para receitas, despesas e transferencias de conta corrente;
- `Invoice` aberta/fechada/paga para compromissos de cartao;
- recorrencias e parcelas materializadas no fluxo de origem.

A API legada nao deve ser usada para reintroduzir uma tela dedicada ou uma nova jornada de criacao em `/pagar-receber`.

## Regra de transicao

Dados antigos de `PayableReceivable` nao podem ser perdidos. Leitores temporarios podem continuar consultando esse recurso quando precisarem preservar historico ou compatibilidade, mas devem evitar dupla contagem quando houver:

- `settlementTransactionId` apontando para um `Transaction` existente;
- `Transaction` equivalente ja representando o mesmo compromisso planejado ou efetivado;
- `Invoice` aberta/fechada representando compromisso de cartao.

O helper `buildPayableReceivableTransitionPlan` classifica registros legados antes de qualquer migracao fisica, separando criacao planejada, vinculo de liquidacao existente, duplicidade, historico cancelado e revisao manual.

## Modelo legado

Contas a pagar e a receber usam o mesmo recurso persistente `PayableReceivable`.

Campos principais:

- `kind`: `payable` para conta a pagar ou `receivable` para conta a receber.
- `status`: `pending`, `settled` ou `cancelled`.
- `amountMinor`: valor inteiro positivo em unidade menor da moeda.
- `currency`: moeda ISO 4217 normalizada em maiusculas, com `BRL` como padrao.
- `dueOn`: data de vencimento.
- `description`: descricao curta, obrigatoria e segura para exibicao.
- `accountId`: conta financeira vinculada, quando aplicavel.
- `categoryId`: categoria vinculada, quando aplicavel.
- `settlementTransactionId`: lancamento criado ou associado ao concluir.
- `settledAt`: data/hora da conclusao.
- `cancelledAt`: data/hora do cancelamento.

Todos os registros carregam `organizationId` e `financialProfileId`. Payload externo nunca pode trocar tenant ou perfil financeiro.

## Regras de criacao legada

- Toda conta nasce como `pending`.
- `payable` gera fluxo de despesa e aceita somente categoria de despesa.
- `receivable` gera fluxo de receita e aceita somente categoria de receita.
- Conta financeira e categoria sao opcionais na criacao, mas, quando informadas, devem pertencer ao tenant/contexto ativo e estar ativas.
- Valor deve ser inteiro positivo em unidade menor.
- Descricao e vencimento sao obrigatorios.
- Escopo de `organizationId` e `financialProfileId` sempre vem do contexto ativo.

Novas experiencias de usuario devem preferir criar `Transaction` ou `Invoice` conforme a origem do compromisso.

## Endpoints legados

Todos os endpoints exigem sessao autenticada e respeitam `profileId` quando informado na query string. Eles devem ser tratados como compatibilidade enquanto a transicao segura nao for totalmente executada e validada.

### Listar

```http
GET /api/payables-receivables
```

Filtros opcionais:

- `kind=payable|receivable`;
- `status=pending|settled|cancelled|all`;
- `accountId=<uuid>`;
- `categoryId=<uuid>`;
- `dueFrom=YYYY-MM-DD`;
- `dueTo=YYYY-MM-DD`;
- `profileId=<uuid>`, quando o usuario puder operar mais de um perfil financeiro.

Resposta:

```json
{
  "payablesReceivables": []
}
```

A listagem sempre aplica isolamento por tenant/contexto antes dos filtros.

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

- `kind`;
- `status`;
- `amountMinor`;
- `dueOn`;
- `description`;
- `currency`;
- `accountId`;
- `categoryId`.

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

`settlePayableReceivable` suporta dois caminhos no contrato legado.

#### Gerar lancamento

Quando `existingTransactionId` nao e informado, a baixa gera um novo `Transaction`:

- `payable` gera lancamento `expense`;
- `receivable` gera lancamento `income`;
- status do lancamento gerado e `posted`;
- source do lancamento gerado e `manual` no MVP;
- conta e obrigatoria na baixa;
- categoria segue a categoria da conta ou pode ser sobrescrita no payload, desde que seja coerente com o tipo;
- o valor deve ser igual ao valor total da conta.

#### Vincular lancamento existente

Quando `existingTransactionId` e informado, o dominio valida que o lancamento existente:

- pertence ao mesmo tenant/contexto;
- possui o mesmo id informado;
- tem tipo coerente (`expense` para pagar, `income` para receber);
- possui mesmo valor e moeda;
- nao esta `voided`.

A conta passa para `settled` e grava `settlementTransactionId` com o id vinculado.

### Cancelar

```http
POST /api/payables-receivables/:payableReceivableId/cancel
```

Cancelamento e a exclusao logica do MVP para este dominio. Nao ha exclusao fisica, arquivamento separado ou restauracao/reativacao neste contrato inicial.

## Status e restricoes

- `pending`: pode ser editada, cancelada ou baixada.
- `settled`: representa conta paga/recebida; nao pode ser baixada de novo.
- `cancelled`: nao pode ser baixada.
- Pagamento parcial fica fora do MVP e retorna erro controlado.
- Cancelamento apos baixa fica fora do MVP e retorna erro controlado.

## Compatibilidade e dupla contagem

Leitores que ainda precisem considerar `PayableReceivable` devem tratar o recurso como fallback legado. Para disponibilidade diaria, Dashboard, relatorios ou projecoes, ignore o registro legado quando houver:

- `settlementTransactionId` vinculado a um `Transaction` valido;
- `Transaction` equivalente por tipo, valor, moeda, data, conta e categoria;
- `Invoice` representando compromisso de cartao correspondente.

Essa regra preserva historico sem somar o mesmo compromisso duas vezes.

## Web legado

A tela dedicada `/pagar-receber` foi retirada da jornada operacional ativa. O usuario deve criar e acompanhar compromissos em:

- `/lancamentos`, para receitas, despesas, transferencias e previsoes de conta;
- `/cartoes`, para compras, faturas, fechamento e pagamento de cartao.

Qualquer rota, tela ou componente remanescente de `PayableReceivable` deve ser tratado como compatibilidade temporaria, nao como experiencia principal. Nao adicionar novos links de navegacao, chamadas de Dashboard ou fluxos de onboarding para `/pagar-receber`.

## Regras de tenant e auditoria

- Toda consulta filtra por `organizationId` e `financialProfileId`.
- Tentativas de acesso cruzado retornam erro controlado.
- Criacao, edicao, conclusao e cancelamento registram auditoria com mudancas redigidas.
- Na baixa com geracao ou vinculacao de lancamento, o resultado inclui auditoria da conta a pagar/receber e auditoria do lancamento financeiro vinculado.
- Dados financeiros nao devem aparecer completos em logs, fixtures ou mensagens de erro.

## Fora de escopo deste contrato legado

- Reintroduzir tela dedicada `/pagar-receber` como fluxo ativo.
- Criar novos fluxos de produto baseados em `PayableReceivable`.
- Remover tabela, model, migration ou endpoint sem executar o plano de transicao segura.
