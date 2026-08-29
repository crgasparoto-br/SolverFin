# Linha de base de acessibilidade e performance

## Criterios minimos

- Toda tela principal deve ter titulo visivel.
- Controles interativos precisam de nome acessivel.
- Botoes, links, tabs e inputs devem ser alcancaveis por teclado.
- Foco visivel deve indicar onde a pessoa esta.
- Alvo de toque recomendado: pelo menos 44px nas primitives novas.
- Estados de loading, vazio, erro, indisponibilidade e permissao devem ser perceptiveis quando aplicaveis.
- Listas grandes devem usar paginacao, virtualizacao ou limite documentado.
- Conteudo ampliado, longo ou em viewport reduzida nao pode esconder acao ou informacao essencial.

## Fluxos principais

A aplicacao possui validacao em Chrome real. O registro canonico fica em `scripts/statement-visual/coverage-contract.mjs` e mapeia cenarios por rota, estado, layout, interacao e perfil de dados.

Os fluxos representativos incluem dashboard, lancamentos, contas/cartoes, categorias, inbox/revisao, relatorios/exportacoes e superficies de suporte. A fundacao compartilhada possui cenarios dedicados para estados operacionais, teclado/foco, conteudo longo, overflow e responsividade.

As migracoes de interface da Fase 3C devem adicionar evidencia especifica da rota sem duplicar um fingerprint equivalente ja coberto. Consulte `docs/VISUAL_VALIDATION.md`.

## Validacao

- Rodar `npm run test --workspace @solverfin/web` para contratos unitarios da camada web.
- Rodar `npm run typecheck --workspace @solverfin/web` para tipos.
- Rodar `npm run visual-coverage-contract:check` para validar o catalogo e os guards sem abrir o navegador.
- Rodar `npm run qa:statement-visual` no ambiente preparado para a suite Chrome completa.
- No CI, usar o artefato `statement-visual-evidence-<sha>` do mesmo candidato avaliado.

A evidencia visual deve registrar rota/superficie, estado, viewport/layout, interacao e SHA. Leitura estatica de HTML/CSS nao substitui renderizacao quando o requisito e visual ou de operabilidade.

## Limites

- O gate e amostragem orientada a risco; nao e screenshot exaustivo de todas as combinacoes.
- Auditoria WCAG completa e performance profunda continuam fora do baseline automatico e devem ser guiadas por issue/evidencia propria quando necessarias.
- Testes visuais nao substituem testes de dominio, API, persistencia, seguranca ou regras financeiras.
