# Design system inicial - SolverFin Web

Este documento registra a base visual inicial para as telas web/PWA do SolverFin.

A base conceitual fica em `apps/web/src/design-system/`. A aplicacao SSR executavel materializa tokens, shell e primitivas em `apps/web/src/dev-server/shared-styles.ts`, sem depender de React, Storybook ou outro framework enquanto a stack definitiva nao estiver formalizada por ADR.

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

`apps/web/src/design-system/tokens.ts` define a referencia conceitual de:

- cores principais e de suporte alinhadas a `docs/BRAND.md`;
- escala de espacamento;
- raios contidos;
- tipografia sans-serif;
- sombras para foco, dialog e toast;
- tempos de movimento curtos;
- breakpoints iniciais.

Na aplicacao SSR, `sharedShellStyles()` publica os tokens efetivamente consumidos pelas paginas, incluindo `--primary`, superficies, estados semanticos, raios, sombras e foco. Alteracoes visuais devem manter coerencia entre a referencia conceitual e o CSS executavel.

## Provedores de estilos SSR

A composicao SSR e organizada por responsabilidade:

- `shared-shell`: tokens, reset, shell autenticado e primitivas recorrentes, fornecido por `sharedShellStyles()`;
- `shared-dialog`: estrutura compartilhada de dialogos, fornecida por `sharedDialogStyles()` quando a rota usa modal;
- `page:<routeId>`: regras especificas do renderer da rota, com fragmentos CSS discriminantes registrados no contrato;
- `aux:recurrences-section`: regras auxiliares de recorrencias, registradas separadamente do CSS principal das paginas que as consomem;
- `runtime:*`: regras adicionadas ou incorporadas pelos pos-processadores do despacho HTTP;
- `statement-presentation`: regras condicionais para conteudo com `.statement-layout`;
- `authenticated-shell-navigation`: regras de navegacao incorporadas pelo shell autenticado;
- `login-public`: regras exclusivas do documento publico de login.

O manifesto tipado em `apps/web/src/dev-server/ssr-style-contract.ts` registra quais provedores cada rota disponivel exige. O contrato aceita uma rota sem CSS especifico apenas quando ela estiver explicitamente classificada como `shared-only`.

Os provedores runtime cobrem os pos-processadores efetivamente ligados ao Extrato, Cartoes, Contas e Cartoes, Categorias e Inbox. Quando o modulo cria um bloco proprio, o contrato registra o atributo `data-*` ou `id` do `<style>` e exige CSS nao vazio. Quando o modulo incorpora regras ao bloco principal, o contrato usa um fragmento CSS discriminante.

O portao nao usa somente busca em arquivos nem infere CSS especifico pela simples existencia de qualquer regra remanescente. Ele requisita cada rota pelo servidor Node `http` real, exige um fragmento do HTML normal da tela, compara os resultados completos dos provedores compartilhados e condicionais, valida cada provedor de pagina, auxiliar ou runtime e remove um provedor por vez nos controles negativos. Assim:

- uma pagina generica de erro com a folha CSS da rota nao e aceita como representante;
- CSS auxiliar ainda presente nao mascara a perda do CSS principal da pagina;
- um bloco runtime ausente ou vazio falha com rota, provedor e modulo;
- estilos inseridos depois do renderer isolado continuam protegidos.

Para provedores condicionais, o HTML servido deve produzir o fragmento registrado como gatilho. A fixture de `/lancamentos` entrega respostas ficticias suficientes para gerar `.statement-layout`; somente entao o portao exige `statement-presentation` no cabecalho final.

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

As receitas descrevem estrutura, estados e notas de acessibilidade. Elas orientam a implementacao concreta e nao substituem os estilos SSR atualmente executados.

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

- Use labels visiveis em campos; placeholder nao substitui label.
- Icon-only buttons precisam de label acessivel.
- Tabelas devem ter estado vazio com orientacao de proxima acao.
- Dialogs devem prender foco quando abertos e permitir fechamento por Escape quando nao forem bloqueantes.
- Toasts confirmam resultado; erros de formulario devem aparecer perto do campo quando possivel.
- Nao duplique tokens ou shell completo em um renderer quando um provedor compartilhado ja existir.
- Ao criar uma rota `status: "available"`, registre o fragmento de HTML normal, o provedor `page:<routeId>`, auxiliares, provedores de runtime e condicionais no contrato SSR na mesma mudanca.
- Ao adicionar um pos-processador com CSS, use marcador estavel no bloco `<style>` ou um fragmento CSS discriminante e registre-o no contrato.
- Nao use dados reais em exemplos, screenshots, fixtures ou documentacao.

## Validacao

Executar o contrato de estilos diretamente:

```bash
npm run validate:ssr-styles --workspace @solverfin/web
```

O portao tambem faz parte de `npm run build` e `npm run validate`, incluindo o job `Validate monorepo` do CI.

## Fora deste corte

- Escolha de framework web definitivo.
- Storybook ou documentacao visual executavel.
- Testes de componentes com navegador.
- Componentes avancados de grafico, calendario e upload.

Esses itens devem entrar em issues futuras. O contrato SSR atual deve continuar valido ate uma mudanca de arquitetura deliberada e documentada.
