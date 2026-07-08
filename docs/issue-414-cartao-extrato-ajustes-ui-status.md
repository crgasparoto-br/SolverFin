# Status da issue #414

Solicitacao recebida:

1. Em `/cartoes`, retirar a informacao de limite do campo **Instrumento** na edicao de lancamento/compra.
2. Em `/cartoes`, ao salvar lancamento recorrente editado, perguntar se a alteracao vale para todos os lancamentos ou somente para o lancamento editado.
3. Em `/lancamentos`, subir os botoes de acao rapida para o cabecalho, no mesmo padrao do botao **Nova compra** em `/cartoes`.

Estado identificado:

- O label de instrumento ainda concatena o limite em `formatInstrumentLabel`.
- O fluxo de pergunta para recorrencia existe em `recurrences-section.ts`, mas precisa ser validado no fluxo real da compra editada.
- O cabecalho do Extrato ainda nao inclui os botoes rapidos no mesmo padrao de Cartoes.

Resultado desta rodada:

- Documentacao tecnica da solicitacao registrada em branch de trabalho.
- Implementacao de codigo ainda pendente.
