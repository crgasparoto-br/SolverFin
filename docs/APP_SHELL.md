# Shell da aplicacao web/PWA

Este documento registra o contrato atual do shell de navegacao e da composicao de estilos SSR do SolverFin Web.

A implementacao executavel usa Node `http` puro e TypeScript em `apps/web/src/`. O catalogo canonico de rotas fica em `apps/web/src/app-shell/routes.ts`; a renderizacao SSR compartilhada fica em `apps/web/src/dev-server/shell.ts`.

## Objetivo

Manter uma moldura comum para as telas financeiras, com navegacao, estados protegidos e composicao de estilos verificaveis sem antecipar a adocao de React, Vue, Svelte ou outro framework.

## Estrutura atual

- `app-shell/routes.ts`: fonte canonica das rotas, acesso, visibilidade e estado de implementacao;
- `app-shell/access.ts`: avaliacao de acesso para loading, login obrigatorio, perfil ausente, erro e rota pronta;
- `app-shell/navigation.ts`: grupos de navegacao e prioridade mobile;
- `dev-server/shell.ts`: documento HTML e shell autenticado compartilhado;
- `dev-server/shared-styles.ts`: tokens, reset, shell visual e primitivas recorrentes;
- `dev-server/ssr-style-contract.ts`: manifesto tipado que relaciona cada rota disponível ao renderer e aos provedores de CSS obrigatorios;
- `scripts/validate-web-ssr-styles.mjs`: portao executavel que renderiza HTML real e valida a composicao final.

## Rotas disponíveis

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

Rotas legadas em `/app` podem redirecionar para os caminhos canonicos. A composicao de estilos cobre rotas com `status: "available"`, independentemente de aparecerem no menu ou exigirem acesso master.

## Contrato de estilos SSR

Cada rota disponível possui uma entrada em `solverFinSsrStyleContracts` com:

- `routeId`, caminho e modulo renderer;
- classificacao `public` ou `authenticated`;
- classificacao `page-specific` ou `shared-only`;
- provedores de cabecalho obrigatorios, como `shared-shell` e `shared-dialog`;
- provedores condicionais, como `statement-presentation`;
- conteudo representativo quando uma condicao precisa ser exercitada no build.

O portao valida paridade exata entre o manifesto e `solverFinShellRoutes`. Uma nova rota marcada como disponível sem contrato faz o build falhar.

Para rotas autenticadas, o HTML final deve conter:

1. CSS compartilhado nao vazio;
2. CSS especifico nao vazio, salvo classificacao explicita `shared-only`;
3. auxiliares registrados e conectados ao `<style>` final;
4. CSS de navegacao do shell conectado ao corpo;
5. CSS condicional quando o conteudo representativo ativa a condicao.

Para `/login`, o CSS publico deve ser nao vazio e estar incorporado ao documento final.

A validacao usa os renderizadores reais com respostas `fetch` ficticias. Nao depende de banco, API em execucao, rede externa, secrets ou `dist` preexistente.

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

Este contrato nao escolhe framework, bundler ou folha CSS externa. Ele tambem nao substitui testes visuais em navegador; garante que a composicao SSR versionada esteja completa e conectada antes de o artefato ser aceito.
