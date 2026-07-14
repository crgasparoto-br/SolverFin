
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
