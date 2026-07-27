# Shell da aplicacao web/PWA

Este documento registra o contrato atual do shell de navegacao e da composicao de estilos SSR do SolverFin Web.

A implementacao executavel usa Node `http` puro e TypeScript em `apps/web/src/`. O catalogo canonico de rotas fica em `apps/web/src/app-shell/routes.ts`; a renderizacao SSR compartilhada fica em `apps/web/src/dev-server/shell.ts`.

## Objetivo

Manter uma moldura comum para as telas financeiras, com navegacao, estados protegidos e composicao de estilos verificaveis sem antecipar a adocao de React, Vue, Svelte ou outro framework.

## Estrutura atual

- `app-shell/routes.ts`: fonte canonica das rotas, acesso, visibilidade e estado de implementacao;
- `app-shell/access.ts`: avaliacao de acesso para loading, login obrigatorio, perfil ausente, erro e rota pronta;
- `app-shell/navigation.ts`: grupos de navegacao e prioridade mobile;
- `dev-server.ts`: despacho HTTP real das rotas e composicao dos pos-processamentos antes de `sendHtml`;
- `dev-server/shell.ts`: documento HTML e shell autenticado compartilhado;
- `dev-server/shared-styles.ts`: tokens, reset, shell visual e primitivas recorrentes;
- `dev-server/ssr-style-contract.ts`: manifesto tipado que relaciona cada rota disponivel ao renderer, provedores de cabecalho, provedores de pagina/auxiliares, provedores inseridos no runtime e gatilhos condicionais;
- `scripts/validate-web-ssr-styles.mjs`: portao executavel que sobe o servidor em porta efemera, requisita cada rota e valida o HTML final servido.

## Rotas disponiveis

A lista abaixo e derivada conceitualmente de `solverFinShellRoutes`; o arquivo TypeScript permanece a unica fonte de verdade executavel.

| Rota                         | Area                 | Acesso                           |
| ---------------------------- | -------------------- | -------------------------------- |
| `/dashboard`                 | Dashboard            | autenticado                      |
| `/lancamentos`               | Extrato da conta     | autenticado                      |
| `/cartoes`                   | Cartoes de Credito   | autenticado                      |
| `/contas-cartoes`            | Contas e Cartoes     | autenticado                      |
| `/remuneracao-contas`        | Remuneracao pelo CDI | autenticado, oculta na navegacao |
| `/categorias`                | Categorias           | autenticado                      |
| `/orcamentos`                | Orcamentos           | autenticado                      |
| `/inbox`                     | Inbox                | autenticado                      |
| `/relatorios`                | Relatorios           | autenticado                      |
| `/configuracoes`             | Configuracoes        | autenticado                      |
| `/admin/instituicoes`        | Instituicoes         | master                           |
| `/admin/indices-financeiros` | Indices financeiros  | master                           |
| `/login`                     | Login                | publico                          |

Rotas legadas em `/app` podem redirecionar para os caminhos canonicos. A composicao de estilos cobre rotas com `status: "available"`, independentemente de aparecerem no menu ou exigirem acesso master. Uma rota canonica disponivel deve responder `200` no servidor representativo; um redirecionamento residual e tratado como violacao do contrato.

## Contrato de estilos SSR

Cada rota disponivel possui uma entrada em `solverFinSsrStyleContracts` com:

- `routeId`, caminho e modulo renderer;
- classificacao `public` ou `authenticated`;
- classificacao `page-specific` ou `shared-only`;
- provedores de cabecalho obrigatorios, como `shared-shell` e `shared-dialog`;
- provedor especifico `page:<routeId>` com fragmentos CSS executaveis e exclusivos da pagina;
- provedores auxiliares registrados separadamente, como `aux:recurrences-section`;
- provedores inseridos pelo pipeline HTTP, como `runtime:inbox-interface` e `runtime:round-selection`;
- provedores condicionais, como `statement-presentation`, acompanhados do fragmento HTML que deve ativar a condicao no renderer real.

O portao valida paridade exata entre o manifesto e `solverFinShellRoutes`. Uma nova rota marcada como disponivel sem contrato faz o build falhar.

Para rotas autenticadas, o HTML final deve conter:

1. CSS compartilhado nao vazio;
2. cada fragmento registrado do provedor especifico da pagina, salvo classificacao explicita `shared-only`;
3. cada provedor auxiliar ou de runtime registrado, sem aceitar outro CSS remanescente como substituto;
4. CSS de navegacao do shell conectado ao corpo;
5. o gatilho HTML condicional produzido pelo renderer real e o CSS condicional correspondente incorporado ao cabecalho.

A verificacao de pagina nao e inferida apenas pela existencia de qualquer CSS restante depois dos provedores compartilhados. Cada provedor possui identificador proprio e evidencia discriminante no HTML final. Os controles negativos removem um provedor por vez, preservando os provedores irmaos, para impedir falso positivo por CSS auxiliar ainda presente.

Para `/login`, o CSS publico deve ser nao vazio e estar incorporado ao documento final.

A validacao usa `createSolverFinWebServer()` para iniciar o mesmo servidor Node `http` em `127.0.0.1` com porta efemera. Cada rota e requisitada pelo caminho canonico, com cookie ficticio quando autenticada. Assim, o portao exercita `resolveRoute`, o despacho de `dev-server.ts`, os pos-processamentos de cada rota e `sendHtml`, em vez de aceitar apenas a saida de um renderer isolado.

As chamadas internas dos renderers usam respostas `fetch` ficticias e minimizadas. A execucao nao depende de PostgreSQL, API ativa, rede externa, secrets ou `apps/web/dist` preexistente.

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

No GitHub Actions, o job `Validate monorepo` executa `npm run build`; portanto, nao existe uma segunda implementacao do contrato no YAML.

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

Este contrato nao escolhe framework, bundler ou folha CSS externa. Ele tambem nao substitui testes visuais em navegador nem valida a semantica completa de todos os seletores; garante que as rotas canonicas respondam pelo servidor real e que os provedores registrados estejam presentes e conectados ao HTML final antes de o artefato ser aceito.
