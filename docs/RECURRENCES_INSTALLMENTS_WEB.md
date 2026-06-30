# Recorrencias e parcelas no MVP web

## Regra de produto

Recorrencias nao tem tela propria nem bloco separado. Elas sao criadas e geridas dentro da tela onde a conta ou o cartao de origem ja e gerenciado, e cada ocorrencia aparece como um lancamento normal na lista (Movimentacoes do Extrato, Compras da fatura em Cartoes) — nunca como um registro a parte:

- **Extrato da conta** (`/lancamentos`): recorrencias vinculadas a uma `accountId`.
- **Cartoes de Credito** (`/cartoes`): recorrencias vinculadas a uma `cardId`.

A rota dedicada `/recorrencias` foi removida, e a primeira versao da gestao embutida (um bloco "Compromissos previsiveis" separado da lista de lancamentos) tambem foi removida: criar uma recorrencia "fixa" no modal de novo lancamento/nova compra ja materializa o primeiro vencimento como uma `Transaction` real, que aparece direto na lista de Movimentacoes/Compras igual a qualquer outro lancamento. Cada acesso as telas de Extrato/Cartoes materializa automaticamente os vencimentos seguintes que ja chegaram, sem nenhuma acao manual do usuario. Ver `docs/API_RECURRENCES_INSTALLMENTS.md` para o contrato completo de materializacao.

## Capacidades expostas

Em cada tela (Extrato ou Cartoes), com uma conta ou cartao selecionado:

- Criar recorrencia: continua acontecendo via o modal de novo lancamento/nova compra existente, escolhendo Repeticao = "Fixo". Para recorrencias de conta, o "Tipo" (Entrada/Saida) do lancamento vira o `kind` da recorrencia; para cartao, o `kind` e sempre `expense`. Nao ha formulario de criacao avulso.
- Cada lancamento da lista (Movimentacoes/Compras) que pertence a uma recorrencia mostra um indicador visual (icone de repeticao ao lado da descricao) e ganha itens extras no proprio menu de acoes "...": **Editar recorrencia**, **Pausar/Retomar recorrencia** e **Cancelar recorrencia**. Esses dados vem de `GET /api/recurrences?accountId=...` ou `?cardId=...&status=all` — essa mesma chamada materializa automaticamente qualquer vencimento pendente (catch-up) antes da lista de lancamentos ser buscada.
- Editar via `PATCH /api/recurrences/:recurrenceId`, num modal compartilhado entre as duas telas (com campo "Tipo" apenas para recorrencias de conta).
- Pausar, retomar e cancelar conforme o status atual, direto do menu do lancamento.
- Gerar parcelas adiantado via `POST /api/recurrences/:recurrenceId/generate-installments` (formulario dentro do modal de edicao) — util para ver vencimentos futuros antes da data, ja que o catch-up automatico so cobre o que ja venceu.

## Estados de interface

Nao ha secao, painel ou bloco dedicado a recorrencias em nenhuma tela. A unica pista de que um lancamento e recorrente e o indicador na propria linha da lista; a gestao (editar/pausar/retomar/cancelar) acontece pelo menu de acoes daquele lancamento.

## Tenant e perfil financeiro

A web continua usando o proxy autenticado do servidor SSR. As chamadas seguem a sessao atual e preservam isolamento por organizacao e perfil financeiro no backend.

## Limite conhecido

O backend ainda nao expoe uma rota de leitura dedicada para listar parcelas historicas de uma recorrencia — so os lancamentos ja materializados (visiveis na lista normal) e o que a acao "Gerar parcelas" retorna na hora.
