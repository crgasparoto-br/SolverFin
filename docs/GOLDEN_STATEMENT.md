# Extrato: candidato a Golden Screen

Este documento especifica o recorte de `/lancamentos` da issue #702 e da PR #703.
Ele complementa `DESIGN_SYSTEM.md`, `SCREEN_ARCHETYPES.md` e `VISUAL_VALIDATION.md`;
nao substitui seus contratos nem declara a referencia aprovada.

## Composicao

- Contexto da conta e resumo financeiro precedem a consulta e a lista.
- O resumo e horizontal no desktop; nao existe coluna lateral competindo com a lista.
- Saldo atual e os quatro indicadores preservam os valores do view-model existente:
  Saldo inicial usa `openingMinor`, Entradas usa `incomeMinor`, Saidas usa
  `-expenseMinor` e Saldo final usa `effectiveBalanceMinor`. Entradas/Saidas representam
  receitas/despesas do periodo, incluindo previsoes ja presentes nesses totais;
  nao representam todos os fluxos de caixa. Transferencias afetam o saldo pelo
  contrato canonico, sem se tornarem receitas/despesas por conveniencia visual.
- A lista utiliza a largura disponivel. Descricao e valor dominam a primeira linha;
  categoria, tipo e saldo por movimento permanecem secundarios, sem remover informacao.
- Categoria, Tipo, Status e Conciliacao ficam diretamente disponiveis na barra
  compacta desktop. No mobile, os filtros sao progressivos e filtros ativos abrem
  o painel inicialmente; Aplicar/Limpar permanecem disponiveis quando ele esta fechado.
  Ordenacao e progressiva, com o estado ativo sempre visivel. Sem JavaScript, o
  formulario GET completo permanece disponivel. Conta e periodo perten¶»§q«^