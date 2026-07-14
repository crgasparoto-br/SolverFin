# Recorrencias e parcelas no MVP web

## Regra de produto

Recorrencias nao tem tela propria nem bloco separado. Elas sao criadas e geridas dentro da tela onde a conta ou o cartao de origem ja e gerenciado, e cada ocorrencia aparece como um lancamento normal na lista (Movimentacoes do Extrato, Compras da fatura em Cartoes) — nunca como um registro a parte:

- **Extrato da conta** (`/lancamentos`): recorrencias vinculadas a uma `accountId`.
- **Cartoes de Credito** (`/cartoes`): recorrencias vinculadas a uma `cardId`.

A rota dedicada `/recorrencias` foi removida, e a primeira versao da gestao embutida (um bloco "Compromissos previsiveis" separado da lista de lancamentos) tambem foi removida: criar uma recorrencia "fixa" no modal de novo lancamento/nova compra ja materializa o primeiro vencimento como uma `Transaction` real, que aparece direto na lista de Movimentacoes/Compras igual a qualquer outro lancamento. Cada acesso as telas de Extrato/Cartoes materializa automaticamente os vencimentos seguintes que ja chegaram, sem nenhuma acao manual do usuario. No **Extrato da conta**, ao consultar um mes futuro, o servidor web tambem materializa antecipadamente as recorrencias ativas da conta ate o fim do mes consultado antes de carregar as movimentacoes, para que os lancamentos previstos aparecam no mesmo extrato. Ver `docs/API_RECURRENCES_INSTALLMENTS.md` para o contrato completo de materializacao.

## Capacidades expostas

Em cada tela (Extrato ou Cartoes), com uma conta ou cartao selecionado:

- Criar recorrencia: continua acontecendo via o modal de novo lancamento/nova compra existente, escolhendo Repeticao = "Fixo". Para recorrencias de conta, o "Tipo" (Entrada/Saida) do lancamento vira o `kind` da recorrencia; para cartao, o `kind` e sempre `expense`. Nao ha formulario de criacao avulso.
- Cada lancamento da lista (Movimentacoes/Compras) que pertence a uma recorrencia mostra um indicador visual (icone de repeticao ao lado da descricao). O menu de acoes mantem **Editar** como ponto unico de edicao da ocorrencia e oferece **Pausar/Retomar recorrencia** e **Cancelar recorrencia** quando aplicavel. Esses dados vem de `GET /api/recurrences?accountId=...` ou `?cardId=...&status=all` — essa mesma chamada materializa automaticamente qualquer vencimento pendente (catch-up) antes da lista de lancamentos ser buscada.
- A edicao da ocorrencia usa o endpoint operacional do lancamento ou compra e, quando recorrente, solicita o escopo antes do envio. A rota `PATCH /api/recurrences/:recurrenceId` permanece para manutencao da regra de recorrencia quando usada por fluxos especificos.
- Pausar, retomar e cancelar conforme o status atual, direto do menu do lancamento.
- Gerar parcelas adiantado via `POST /api/recurrences/:recurrenceId/generate-installments` (formulario dentro do modal de edicao). No Extrato da conta, a consulta de meses futuros usa a mesma geracao de forma automatica para recorrencias ativas da conta selecionada, sempre ate o ultimo dia do mes consultado.

## Estados de interface

Nao ha secao, painel ou bloco dedicado a recorrencias em nenhuma tela. A unica pista de que um lancamento e recorrente e o indicador na propria linha da lista; a gestao (editar/pausar/retomar/cancelar) acontece pelo menu de acoes daquele lancamento.

## Tenant e perfil financeiro

A web continua usando o proxy autenticado do servidor SSR. As chamadas seguem a sessao atual e preservam isolamento por organizacao e perfil financeiro no backend.

## Limite conhecido

O backend ainda nao expoe uma rota de leitura dedicada para listar parcelas historicas de uma recorrencia — so os lancamentos ja materializados (visiveis na lista normal) e o que a acao "Gerar parcelas" retorna na hora.

## Modal de escopo da edição

Ao salvar uma ocorrência que possui recurrenceId, a interface valida o formulário e abre um diálogo com opções explícitas:

- alterar somente o lançamento ou compra selecionado;
- alterar o selecionado e as próximas ocorrências elegíveis;
- voltar para a edição sem salvar.

Fechar, voltar ou pressionar Escape não envia requisições e preserva o formulário. Durante o salvamento, as ações ficam desabilitadas para impedir envio duplicado. Erros permanecem no diálogo e ocorrências ignoradas são resumidas em linguagem clara.

No cartão, o escopo ampliado faz uma única chamada ao endpoint da compra com editScope: current_and_future; o frontend não coordena salvamentos separados. No extrato, o escopo ampliado envia applyToFuturePlanned: true.

## Troca de conta no Extrato

No modo **Editar lançamento** do Extrato, o formulário exibe a conta realmente vinculada à ocorrência e permite selecionar outra conta ativa do mesmo perfil financeiro. A criação e a clonagem continuam usando a conta selecionada no filtro principal.

Para um lançamento não recorrente, a nova `accountId` é aplicada somente ao registro editado. Para um lançamento recorrente, a troca de conta participa do mesmo diálogo de escopo das demais alterações:

- **Somente este lançamento** altera apenas a ocorrência selecionada;
- **Este lançamento e os próximos** altera a ocorrência selecionada, as ocorrências futuras elegíveis com status `planned` e a `accountId` da regra de recorrência usada nas próximas materializações.

Ocorrências anteriores, efetivadas, conciliadas, anuladas ou não elegíveis permanecem inalteradas. Transferências continuam exigindo contas de origem e destino diferentes.
