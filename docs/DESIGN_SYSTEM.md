# Design system inicial - SolverFin Web

Este documento registra a base visual inicial para as telas web/PWA do SolverFin.

A implementacao atual fica em `apps/web/src/design-system/` e foi desenhada para nao depender de React, Storybook ou outro framework enquanto a stack de frontend ainda nao estiver formalizada por ADR.

## Direcao visual

Tese visual: uma interface financeira calma, clara e densa o suficiente para uso diario, com base em azul petroleo, verde de confirmacao e ciano para estados ativos ou inteligentes.

Principios:

- clareza antes de decoracao;
- mobile-first;
- contraste forte e foco visivel;
- componentes com estados previsiveis;
- exemplos sempre ficticios e sem dados financeiros reais;
- cards apenas para itens repetidos, modais ou ferramentas enquadradas.

## Tokens

`tokens.ts` define:

- cores principais e de suporte alinhadas a `docs/BRAND.md`;
- escala de espacamento;
- raios ate `0.5rem`, evitando cantos exagerados;
- tipografia sans-serif moderna;
- sombras apenas para foco, dialog e toast;
- tempos de movimento curtos;
- breakpoints iniciais para mobile, tablet e desktop.

A folha base exportada em `styles.ts` transforma esses tokens em CSS custom properties com prefixo `--sf-*`.

## Componentes base

`components.ts` define receitas de implementacao para:

- `Button`;
- `Input`;
- `Select`;
- `Dialog`;
- `Table`;
- `Card`;
- `EmptyState`;
- `Loading`;
- `Toast`;
- `FormPattern`.

As receitas descrevem estrutura, estados e notas de acessibilidade. Elas devem ser usadas como contrato inicial para a implementacao concreta no framework que for escolhido depois.

## Estados padronizados

Estados cobertos na base:

- foco visivel;
- desabilitado;
- loading;
- erro de campo;
- tabela vazia;
- feedback por toast;
- dialog em tela pequena.

Textos visiveis devem explicar o que a pessoa pode fazer, revisar ou corrigir. Evite mensagens tecnicas ou detalhes de backend.

## Exemplos

`examples.ts` contem exemplos de uso para botao, input com ajuda, estado vazio, tabela responsiva e toast.

Esses exemplos sao intencionalmente pequenos para servirem como referencia interna ate existir uma pagina de documentacao visual ou Storybook.

## Convencoes de uso

- Importe a base por `apps/web/src/index.ts` ou por `apps/web/src/design-system/index.ts`.
- Use labels visiveis em campos; placeholder nao substitui label.
- Icon-only buttons precisam de label acessivel.
- Tabelas devem ter estado vazio com orientacao de proxima acao.
- Dialogs devem prender foco quando abertos e permitir fechamento por Escape quando nao forem bloqueantes.
- Toasts confirmam resultado; erros de formulario devem aparecer perto do campo quando possivel.
- Nao use dados reais em exemplos, screenshots, fixtures ou documentacao.

## Fora deste corte

- Escolha de framework web definitivo.
- Storybook ou documentacao visual executavel.
- Testes de componentes com navegador.
- Componentes avancados de grafico, calendario, upload e navegacao.

Esses itens devem entrar em issues futuras quando a aplicacao web executavel estiver definida.
