# Contas a pagar e a receber

Este documento registra o contrato de dominio do MVP para contas a pagar e a receber.

## Objetivo

Permitir controlar vencimentos simples, marcar uma conta como paga ou recebida e gerar ou vincular um lancamento financeiro ao concluir a baixa.

## Entidade

A entidade `PayableReceivable` representa uma conta a pagar ou a receber no contexto financeiro ativo.

Campos principais:

- `kind`: `payable` para contas a pagar ou `receivable` para contas a receber.
- `status`: `pending`, `settled` ou `cancelled`.
- `amountMinor`: valor em unidade menor da moeda.
- `currency`: codigo ISO 4217 normalizado para maiusculas, com `BRL` como padrao.
- `dueOn`: data de vencimento.
- `description`: descricao exibivel ao usuario.
- `accountId`: conta prevista ou conta usada na baixa, quando informada.
- `categoryId`: categoria opcional, coerente com o tipo da conta.
- `settledAt`: data/hora em que a conta foi marcada como paga ou recebida.
- `settlementTransactionId`: lancamento financeiro vinculado a baixa.
- `cancelledAt`: data/hora de cancelamento.

## Regras de criacao

- Toda conta nasce como `pending`.
- `payable` gera fluxo de despesa e aceita somente categoria de despesa.
- `receivable` gera fluxo de receita e aceita somente categoria de receita.
- Conta financeira e categoria sao opcionais na criacao, mas, quando informadas, devem pertencer ao tenant/contexto ativo e estar ativas.
- Valor deve ser inteiro positivo em unidade menor.
- Descricao e vencimento sao obrigatorios.
- Escopo de `organizationId` e `financialProfileId` sempre vem do contexto ativo; payload externo nao pode trocar tenant.

## Filtros

`listPayableReceivables` permite filtrar por:

- tipo (`payable` ou `receivable`);
- status, incluindo `all`;
- conta;
- categoria;
- intervalo de vencimento (`dueFrom` e `dueTo`).

A listagem sempre aplica isolamento por tenant/contexto antes dos filtros.

## Baixa

`settlePayableReceivable` suporta dois caminhos no MVP.

### Gerar lancamento

Quando `existingTransactionId` nao e informado, a baixa gera um novo `Transaction`:

- `payable` gera lancamento `expense`.
- `receivable` gera lancamento `income`.
- Status do lancamento gerado: `posted`.
- Source do lancamento gerado: `manual` no MVP.
- Conta e obrigatoria na baixa.
- Categoria segue a categoria da conta ou pode ser sobrescrita no payload, desde que seja coerente com o tipo.
- O valor deve ser igual ao valor total da conta.

### Vincular lancamento existente

Quando `existingTransactionId` e informado, o dominio valida que o lancamento existente:

- pertence ao mesmo tenant/contexto;
- possui o mesmo id informado;
- tem tipo coerente (`expense` para pagar, `income` para receber);
- possui mesmo valor e moeda;
- nao esta `voided`.

A conta passa para `settled` e grava `settlementTransactionId` com o id vinculado.

## Status e restricoes

- `pending`: pode ser editada, cancelada ou baixada.
- `settled`: representa conta paga/recebida; nao pode ser baixada de novo.
- `cancelled`: nao pode ser baixada.
- Pagamento parcial fica fora do MVP e retorna erro controlado.
- Cancelamento apos baixa fica fora do MVP e retorna erro controlado.

## Auditoria

Criacao, edicao, cancelamento e baixa retornam `AuditLogEntryDraft` com marcadores redigidos de alteracao.

Na baixa com geracao ou vinculacao de lancamento, o resultado inclui:

- auditoria da conta a pagar/receber;
- auditoria do lancamento financeiro vinculado.

## Fora de escopo do MVP

- Pagamento parcial.
- Alertas automaticos de vencimento.
- Emissao de boletos, notas fiscais ou documentos externos.
- Integracao com Agenda Profissional.
- Conciliacao bancaria automatica completa.
- API HTTP e persistencia/repositories reais.
