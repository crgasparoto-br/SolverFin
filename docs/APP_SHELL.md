# Shell da aplicacao web/PWA

Este documento registra o contrato atual do shell de navegacao e da composicao de estilos SSR do SolverFin Web.

A implementacao executavel usa Node `http` puro e TypeScript em `apps/web/src/`. O catalogo canonico de rotas fica em `apps/web/src/app-shell/routes.ts`; a renderizacao SSR compartilhada fica em `apps/web/src/dev-server/shell.ts`.

## Objetivo

Manter uma moldura comum para as telas financeiras, com navegacao, estados protegidos e composicao de estilos verificaveis sem antecipar a adocao de React, Vue, Svelte ou outro framework.

## Estrutura atual

- `app-shell/routes.ts`: fonte canonica das rotas, acesso, visibilidade e estado de implementacao;
- `app-shell/access.ts`: avaliacao de acesso para loading, login obrigatorio, perfil ausente, erro e rota pronta;
- `app-shell/navigation.ts`: grupos de navegacao e prioridade mobile;
- `design-system/tokens.ts`: fonte canonica dos valores semanticos do design system;
- `design-system/styles.ts`: serializacao dos tokens canonicos em custom properties `--sf-*` e primitivas executaveis;
- `dev-server.ts`: despacho HTTP real das rotas e composicao dos pos-processamentos antes de `sendHtml`;
- `dev-server/shell.ts`: documento HTML e shell autenticado compartilhado;
- `dev-server/shared-styles.ts`: consumidor da publicacao canonica, aliases CSS de compatibilidade, reset, shell visual e primitivas recorrentes;
- `dev-server/ssr-style-contract.ts`: manifesto tipado que relaciona cada rota disponivel ao renderer, HTML representativo, provedores de cabecalho, provedores de pagina/auxiliares, blocos inseridos no runtime e gatilhos condicionais;
- `scripts/validate-web-ssr-styles.mjs`: portao executavel que sobe o servidor em porta efemera, requisita cada renderer coberto e valida o HTML final servido.

Valores semanticos compartilhados nao pertencem a `shared-styles.ts`. Variaveis legadas publicadas pelo shell podem existir para compatibilidade com renderers ainda nao migrados, mas devem apontar para `--sf-*` derivados de `tokens.ts`, sem manter um segundo mapa literal sincronizado por convencao.

## Rotas disponiveis

A lista abaixo e derivada conceitualmente de `solverFinShellRoutes`; o arquivo TypeScript permanece a unica fonte de verdade executavel.

| Rota                         | Area                  | Acesso                                           |
| ---------------------------- | --------------------- | ------------------------------------------------ |
| `/dashboard`                 | Dashboard             | autenticado                                      |
| `/lancamentos`               | Extrato da conta      | autenticado                                      |
| `/cartoes`                   | Cartoes de Credito    | autenticado                                      |
| `/contas-cartoes`            | Contas e Cartoes      | autenticado                                      |
| `/remuneracao-contas`        | Remuneracao pelo CDI  | renderer legado coberto; rota redireciona no uso |
| `/categorias`                | Categorias            | autenticado                                      |
| `/orcamentos`                | Orcamentos            | autenticado                                      |
| `/assistente`                | Assistente financeiro | autenticado                                      |
| `/inbox`                     | Inbox                 | autenticado                                      |
| `/relatorios`                | Relatorios            | autenticado                                      |
| `/configuracoes`             | Configuracoes         | autenticado                                      |
| `/admin/instituicoes`        | Instituicoes          | master                                           |
| `/admin/indices-financeiros` | Indices financeiros   | master                                           |
| `/login`                     | Login                 | publico                                          |

Rotas legadas em `/app` podem redirecionar para os caminhos canonicos. A composicao de estilos cobre todas as entradas com `status: "available"`, independentemente de aparecerem no menu ou exigirem acesso master.

`/assistente` e uma rota operacional autenticada e dependente de perfil financeiro. Seu renderer `financial-assistant-page.js` possui contrato SSR proprio e deve continuar classificado como `available` enquanto a jornada somente leitura estiver servida.

`/remuneracao-contas` permanece no catalogo para manter o renderer legado sob cobertura, mas nao voltou a ser uma jornada operacional. Em execucao normal, `/remuneracao-contas` e `/app/remuneracao-contas` respondem `302` para `/contas-cartoes` quando o usuario esta autenticado e seguem o fluxo de login sem sessao. Somente o processo interno do portao, iniciado por `scripts/build-web.mjs`, define `SOLVERFIN_SSR_STYLE_CONTRACT_VALIDATION=1` para exercitar o renderer pelo servidor representativo sem alterar o comportamento publico.

Fora dessa excecao de compatibilidade, uma rota operacional disponivel deve responder `200` no servidor representativo; um redirecionamento residual e tratado como violacao do contrato.

## Contrato de estilos SSR

Cada rota disponivel possui uma entrada em `solverFinSsrStyleContracts` com:

- `routeId`, caminho e modulo renderer;
- classificacao `public` ou `authenticated`;
- classificacao `page-specific` ou `shared-only`;
- fragmentos obrigatorios do HTML normal da rota, separados da folha CSS;
- provedores de cabecalho obrigatorios, como `shared-shell` e `shared-dialog`;
- provedor especifico `page:<routeId>` com fragmentos CSS executaveis e exclusivos da pagina;
- provedores auxiliares registrados separadamente, como `aux:recurrences-section`;
- provedores inseridos pelo pipeline HTTP, identificados por fragmento CSS ou por marcador do bloco `<style>`;
- provedores condicionais, como `statement-presentation`, acompanhados do fragmento HTML que deve ativar a condicao no renderer real.

O portao valida paridade exata entre o manifesto e `solverFinShellRoutes`. Uma nova rota marcada como disponivel sem contrato faz o build falhar.

Para rotas autenticadas, o HTML final deve conter:

1. o fragmento normal representativo da propria tela, de modo que uma pagina generica de erro com CSS residual nao seja aceita;
2. CSS compartilhado nao vazio;
3. cada fragmento registrado do provedor especifico da pagina, salvo classificacao explicita `shared-only`;
4. cada provedor auxiliar ou de runtime registrado, sem aceitar outro CSS remanescente como substituto;
5. CSS de navegacao do shell conectado ao corpo;
6. o gatilho HTML condicional produzido pelo renderer real e o CSS condicional correspondente incorporado ao cabecalho.

A verificacao de pagina nao e inferida apenas pela existencia de qualquer CSS restante depois dos provedores compartilhados. Cada provedor possui identificador proprio e evidencia discriminante no HTML final. Os controles negativos removem um provedor por vez, preservando os provedores irmaos, para impedir falso positivo por CSS auxiliar ainda presente.

### Pos-processadores protegidos

O contrato registra os blocos runtime observados na composicao final:

- Extrato: ordenacao; estilos estruturais de remuneracao emitidos por `list-sorting-enhancement.js`; affordance de divulgacao emitida por `account-remuneration-disclosure-enhancement.js`; modal de agrupamento; guarda de formulario do grupo; layout do modal; selecao em lote; layout da selecao; e seletor redondo;
- Cartoes: navegacao de fatura, ordenacao, interface consolidada e alinhamento de status;
- Contas e Cartoes: dialogo de instrumentos, abas neutras, modal de remuneracao e padronizacao final;
- Categorias: CSS da interface aprimorada incorporado ao bloco principal;
- Inbox: layout de lista, seletor redondo, interface principal, acessibilidade, tabela, filtro corrigido, acoes de status, legibilidade e acao explicita do filtro de data.

No Extrato, `data-account-remuneration-statement-styles` pertence a `list-sorting-enhancement.js`, enquanto `data-account-remuneration-disclosure-affordance` pertence a `account-remuneration-disclosure-enhancement.js`. O manifesto registra esses provedores separadamente para que a presenca de um bloco nao possa mascarar a perda do outro.

Blocos marcados por atributos `data-*` ou `id` precisam existir e conter CSS nao vazio. Para provedores sem bloco proprio, o contrato exige um fragmento CSS discriminante. Os controles negativos removem e esvaziam cada bloco marcado individualmente.

Para `/login`, o CSS publico deve ser nao vazio, o documento precisa conter o shell normal de login e ambos devem estar incorporados ao HTML final.

A validacao usa `createSolverFinWebServer()` para iniciar o mesmo servidor Node `http` em `127.0.0.1` com porta efemera. As rotas operacionais sao requisitadas pelo caminho canonico, com cookie ficticio quando autenticadas. O renderer legado de `/remuneracao-contas` e requisitado no mesmo servidor somente no modo interno de validacao descrito acima. Assim, o portao exercita `resolveRoute`, o despacho de `dev-server.ts`, os pos-processamentos e `sendHtml`, sem reativar a rota aposentada no uso normal.

As chamadas internas dos renderers usam respostas `fetch` ficticias e minimizadas. Para `/lancamentos`, a fixture inclui uma conta ativa e um lancamento ficticio de remuneracao CDI, suficientes para produzir `account-remuneration-audit` e ativar os dois provedores runtime de remuneracao. Uma resposta ausente devolve erro controlado e o contrato falha pela ausencia do fragmento representativo. A execucao nao depende de PostgreSQL, API ativa, rede externa, secrets ou `apps/web/dist` preexistente.

## Comandos oficiais

Executar apenas o contrato SSR:

```bash
npm run validate:ssr-styles --workspace @solverfin/web
```

O comando limpa e recompila `apps/web/dist` antes da verificacao. O mesmo portao e executado automaticamente por:

```bash
npm run build --workspace @solverfin/web
npm run build
npm run validate
```

No GitHub Actions, o job `Validate monorepo` executa `npm run test` e `npm run build`; portanto, o YAML nao enumera workspaces nem mantem uma segunda implementacao do contrato.

Logs e falhas usam o prefixo estavel `SolverFin SSR style contract` e identificam rota, provedor e modulo responsavel. Todas as violacoes encontradas na mesma execucao sao reportadas juntas.

## Navegacao responsiva

Desktop:

- sidebar com grupos `Rotina`, `Organizar`, `Revisar`, `Ajustes` e `Admin` quando autorizado;
- topbar com rota atual e usuario;
- area principal para o conteudo da tela.

Mobile:

- rotas primarias permanecem em destaque;
- o controle `Mais` revela rotas secundarias;
- o shell preserva foco visivel, labels acessiveis e espaco para o conteudo.

## Limites

Este contrato nao escolhe framework, bundler ou folha CSS externa. Ele tambem nao substitui testes visuais em navegador nem valida a semantica completa de todos os seletores; garante que os renderers cobertos produzam o estado normal representativo e mantenham os provedores registrados conectados ao HTML final antes de o artefato ser aceito, preservando redirecionamentos funcionais existentes.
