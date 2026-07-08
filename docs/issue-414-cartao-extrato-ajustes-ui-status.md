# Status da issue #414

Solicitacao recebida:

1. Em `/cartoes`, retirar a informacao de limite do campo **Instrumento** na edicao de lancamento/compra.
2. Em `/cartoes`, ao salvar lancamento recorrente editado, perguntar se a alteracao vale para todos os lancamentos ou somente para o lancamento editado.
3. Em `/lancamentos`, subir os botoes de acao rapida para o cabecalho, no mesmo padrao do botao **Nova compra** em `/cartoes`.

Implementacao aplicada:

- `apps/web/src/dev-server/recurrences-section.ts`
  - remove visualmente o trecho `limite ...` das opcoes de `select[name="cardInstrumentId"]` carregadas nas telas;
  - ajusta a mensagem de confirmacao de escopo para deixar claro: OK aplica na recorrencia/futuros, Cancelar altera somente o lancamento atual;
  - move os botoes da secao `Acoes rapidas` do Extrato para `.statement-heading`, criando `.statement-heading-actions`.
- `apps/web/src/dev-server/issue-414-ui-adjustments.test.ts`
  - adiciona teste de regressao para script e estilos compartilhados.

Observacao tecnica:

A alteracao foi aplicada no modulo compartilhado de recorrencias, porque ele ja e carregado tanto em `/cartoes` quanto em `/lancamentos`. Isso evita reescrever arquivos SSR grandes e reduz o risco de sobrescrever CSS/script existente.
