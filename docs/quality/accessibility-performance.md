# Linha de base de acessibilidade e performance

## Criterios minimos

- Toda tela principal deve ter titulo visivel.
- Controles interativos precisam de nome acessivel.
- Botoes, links, tabs e inputs devem ser alcancaveis por teclado.
- Foco visivel deve indicar onde a pessoa esta.
- Alvo de toque recomendado: pelo menos 44px.
- Estados de loading, vazio e erro devem ser perceptiveis.
- Listas grandes devem usar paginacao, virtualizacao ou limite documentado.

## Fluxos principais

Enquanto a UI real ainda esta em bootstrap, os checks ficam representados por `apps/web/src/accessibility.ts`. Quando telas forem implementadas, cada fluxo principal deve registrar evidencias de:

- dashboard;
- lancamentos;
- contas/cartoes;
- categorias;
- inbox/revisao;
- relatorios/exportacoes.

## Validacao

- Rodar `npm run test --workspace @solverfin/web`.
- Rodar `npm run typecheck --workspace @solverfin/web`.
- Para telas reais futuras, anexar validacao manual em viewport mobile e desktop.
- Quando houver Playwright ou ferramenta de auditoria, adicionar check automatizado em issue propria.

## Limitacoes atuais

- Ainda nao ha app web renderizado com navegador real.
- Auditoria WCAG completa fica fora do MVP inicial.
- Performance profunda deve ser guiada por evidencia de gargalo, nao por otimizacao prematura.
