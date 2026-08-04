# Cobertura de manutencao web do MVP

Este documento registra quais acoes de manutencao ficam visiveis nas telas navegaveis do MVP web.

## Principios

- A UI usa apenas rotas de API ja existentes.
- Acoes destrutivas ou financeiras relevantes exigem confirmacao simples.
- A tela de lancamentos permanece como **Extrato da conta**, com resumo, agrupamento por data e formulario de novo lancamento preservados.
- Apos edicao ou acao de dominio bem-sucedida, a tela recarrega para refletir o estado retornado pela API.
- Em telas divididas por query string, o recarregamento preserva a secao selecionada no endereco atual.
- Erros exibem mensagem amigavel retornada pela API, sem expor detalhes internos.

## Cobertura por tela

| Tela               | Acoes visiveis                                                                                                                                                                                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contas             | Listar, criar, abrir detalhe, editar nome/tipo/saldo inicial e arquivar conta ativa.                                                                                                                                                                                                                |
| Categorias         | Listar, criar, abrir detalhe, editar nome/tipo, arquivar categoria ativa e restaurar categoria arquivada.                                                                                                                                                                                           |
| Extrato da conta   | Listar movimentacoes agrupadas por data, criar novo lancamento, abrir detalhe, editar descricao/status/conta/categoria e cancelar/estornar lancamento nao cancelado.                                                                                                                                |
| Cartoes de Credito | Selecionar cartao e fatura (navegacao por periodo), registrar/editar compra em modal, filtrar compras por busca e conciliacao, fechar fatura aberta e lancar pagamento de fatura nao paga/cancelada com confirmacao. Cadastro, edicao, bloqueio e arquivamento de cartao ficam em Contas e Cartoes. |
| Orcamentos         | Listar, criar, abrir detalhe, editar categoria/periodo/valor, consultar uso e arquivar orcamento ativo.                                                                                                                                                                                             |
| Configuracoes      | Alternar por links GET entre perfis financeiros e regras automaticas; criar, editar e arquivar perfis; abrir Dashboard, Contas e Extrato no perfil; criar, inativar e aplicar regras; manter a secao atual apos as acoes.                                                                           |

## Configuracoes por secao

A rota `/configuracoes` usa uma unica pagina com o titulo principal `Configuracoes` e duas secoes renderizadas no servidor:

- `/configuracoes?section=profiles`: perfis financeiros, padrao quando o parametro estiver ausente ou invalido;
- `/configuracoes?section=rules`: regras automaticas.

Os links possuem `aria-current` na secao ativa e funcionam sem JavaScript. Perfis mostram separadamente os estados `Em uso`, `Ativo` e `Arquivado`, preservando os atalhos para Dashboard, Contas e Extrato.

Regras mostram prioridade, condicoes, acoes sugeridas e explicacao em blocos de leitura. Contas e categorias vinculadas aparecem pelo nome quando disponiveis; campos suportados como estabelecimento, cartao, etiquetas e estados adicionais nao sao omitidos nem exibem identificadores internos. Valores sao exibidos com duas casas decimais, sem simbolo de moeda. O formulario converte valores decimais para os campos minoritarios da API e impede envio quando a entrada possui formato invalido ou mais de duas casas decimais.

Falhas de contas e categorias degradam apenas o seletor correspondente. Falha da listagem de regras mostra um erro com acao para tentar novamente, nao mostra estado vazio e deixa `Aplicar regras` desabilitado.

A validacao em Chrome percorre a navegacao entre secoes com `Tab`, `Shift+Tab` e `Enter`, verifica foco visivel e abre e fecha os dialogos com `Enter` e `Escape`, confirmando o retorno do foco ao acionador. O cenario de regras cria dados ativos e inativos representativos, incluindo conteudo longo, referencias conhecidas e desconhecidas, e valida a composicao preenchida em desktop, tablet e mobile. O controle de texto a 200% aplica a escala depois da ultima navegacao, confirma o tamanho computado no instante da captura e rejeita evidencia identica ao cenario sem ampliacao. O formulario decimal tambem e exercitado no navegador, comprovando `10,50` como `1050` no payload e bloqueando `10,501` sem perder o valor digitado.

## Pendencias intencionais

- Recorrencias e parcelas usam manutenção incorporada às linhas operacionais conforme as seções abaixo. Contas a pagar/receber permanecem em transição por issues específicas, sem reintroduzir uma tela paralela.
- A UI nao implementa exclusao fisica de dados financeiros; o comportamento esperado segue arquivamento, cancelamento, bloqueio ou restauracao conforme o dominio.

## Parcelas nas listas operacionais

| Superfície             | Identificação                          | Manutenção                                                                | Endpoint                                 |
| ---------------------- | -------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------- |
| Extrato `/lancamentos` | `Parcela X de Y` na linha da transação | Modal em modo restrito; descrição, observação e categoria quando elegível | `PATCH /api/installments/:installmentId` |
| Cartões `/cartoes`     | `Parcela X de Y` na linha da compra    | Mantém a edição operacional da compra e os bloqueios da fatura            | Endpoint existente da compra             |

A consulta complementar é limitada a uma chamada por renderização, preserva `profileId` e usa a data operacional do Extrato. Falha da consulta não remove nem bloqueia a listagem principal; no Extrato, a edição fica indisponível enquanto a elegibilidade não puder ser confirmada, e a API genérica rejeita alterações de dados fora do contrato da parcela. A ação existente de conciliar ou desconciliar continua permitida somente com payload exclusivo de situação e preserva descrição, observação e categoria confirmadas por uma edição concorrente. Categorias arquivadas são exibidas como valor histórico e não são removidas sem escolha explícita. O modal mantém foco acessível, fechamento por Escape, mensagens em `aria-live` e recuperação explícita de conflito `409`.

A exclusão lógica individual ou em massa continua disponível como transição operacional: a transação fica `voided`, a parcela permanece consultável para histórico e a manutenção direta passa a ser somente leitura por `transaction_status_locked`. Não existe exclusão física de parcela por esses fluxos.
