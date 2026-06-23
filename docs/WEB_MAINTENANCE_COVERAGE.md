# Cobertura de manutencao web do MVP

Este documento registra quais acoes de manutencao ficam visiveis nas telas navegaveis do MVP web.

## Principios

- A UI usa apenas rotas de API ja existentes.
- Acoes destrutivas ou financeiras relevantes exigem confirmacao simples.
- A tela de lancamentos permanece como **Extrato da conta**, com resumo, agrupamento por data e formulario de novo lancamento preservados.
- Apos edicao ou acao de dominio bem-sucedida, a tela recarrega para refletir o estado retornado pela API.
- Erros exibem mensagem amigavel retornada pela API, sem expor detalhes internos.

## Cobertura por tela

| Tela              | Acoes visiveis                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contas            | Listar, criar, abrir detalhe, editar nome/tipo/saldo inicial e arquivar conta ativa.                                                                                                                                                 |
| Categorias        | Listar, criar, abrir detalhe, editar nome/tipo, arquivar categoria ativa e restaurar categoria arquivada.                                                                                                                            |
| Extrato da conta  | Listar movimentacoes agrupadas por data, criar novo lancamento, abrir detalhe, editar descricao/status/conta/categoria e cancelar/estornar lancamento nao cancelado.                                                                 |
| Cartoes e faturas | Listar e criar cartoes, abrir detalhe, editar dados principais, bloquear cartao ativo, arquivar cartao ativo, registrar compra no cartao, listar faturas, abrir detalhe de fatura e pagar fatura nao paga/cancelada com confirmacao. |
| Orcamentos        | Listar, criar, abrir detalhe, editar categoria/periodo/valor, consultar uso e arquivar orcamento ativo.                                                                                                                              |

## Pendencias intencionais

- Recorrencias, parcelas e contas a pagar/receber ficam para issues especificas, para evitar misturar novos fluxos com a manutencao das telas ja navegaveis.
- A UI nao implementa exclusao fisica de dados financeiros; o comportamento esperado segue arquivamento, cancelamento, bloqueio ou restauracao conforme o dominio.
