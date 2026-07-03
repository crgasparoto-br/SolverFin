# Exclusao de contas e cartoes sem uso

Contas bancarias e cartoes agrupadores podem ser excluidos somente enquanto ainda nao foram usados por outros fluxos financeiros.

## Contas

Use:

```text
DELETE /api/accounts/:accountId
```

A API exclui a conta quando ela nao possui:

- lancamentos em `Transaction.accountId` ou `Transaction.destinationAccountId`;
- cartoes vinculados como conta padrao de pagamento;
- recorrencias vinculadas;
- contas a pagar/receber vinculadas.

Se houver qualquer uso, a API retorna `ACCOUNT_IN_USE` e a acao correta para ocultar a conta passa a ser arquivar/inativar.

## Cartoes agrupadores

Use:

```text
DELETE /api/credit-card-accounts/:cardId
```

A API exclui o cartao agrupador e seus instrumentos internos somente quando o agrupador nao possui:

- compras/lancamentos vinculados ao cartao ou a qualquer instrumento;
- faturas;
- recorrencias vinculadas ao cartao ou a qualquer instrumento;
- parcelas vinculadas ao cartao ou a qualquer instrumento.

Se houver qualquer uso, a API retorna `CARD_ACCOUNT_IN_USE` e a acao correta para ocultar o cartao passa a ser arquivar/inativar.

## UI

A tela `Contas e Cartoes` exibe a acao de excluir ao lado das acoes de editar e arquivar. A protecao final fica sempre no servidor: se o cadastro ja tiver uso, a tela mostra a mensagem de erro retornada pela API.

Na edicao de um cartao agrupador, a tela tambem mostra os dados dos instrumentos internos no mesmo dialogo, permitindo revisar e salvar tipo, titularidade, nome, identificador mascarado e limite individual sem sair da edicao do cartao.
