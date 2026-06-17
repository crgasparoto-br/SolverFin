# ADR-0003 - Consolidacao do MVP navegavel da epica 133

## Status

Aceito

## Data

2026-06-17

## Contexto

A epica #133 e suas subissues #134 a #150 pedem o primeiro MVP navegavel do SolverFin, com login real para desenvolvimento local, sessao, rotas privadas, menu, dashboard inicial, API minima, Prisma/PostgreSQL, seed demo, testes e documentacao de execucao.

O repositorio ja recebeu um corte anterior do MVP navegavel para a epica #120. Esse corte incluiu servidor web em TypeScript/Node, tela `/login`, dashboard autenticado, cookie de sessao local, contratos de API em `apps/api`, dominio financeiro, schema Prisma, seed demo, testes por workspace e CI.

A nova epica #133 amplia o mesmo objetivo para deixar explicito o conjunto de subissues e a relacao entre arquitetura, frontend, autenticacao, dados financeiros, tenant, LGPD, IA, importacao, testes e integracoes futuras.

## Decisao

Considerar o MVP navegavel atual como o primeiro corte executavel da epica #133, mantendo as decisoes das ADRs 0001 e 0002:

- TypeScript, npm workspaces, Node.js 22+ e npm 10+ continuam sendo a base executavel.
- `apps/web` permanece como runtime local unico do MVP, expondo `/login`, `/dashboard`, placeholders privados, `/health`, `/manifest.webmanifest` e API minima no mesmo processo.
- `apps/api` preserva contratos testaveis de autenticacao e resumo financeiro para futura separacao operacional.
- Prisma/PostgreSQL representam o modelo persistente inicial para usuario, organizacao, perfil financeiro, contas, cartoes, categorias, lancamentos, recorrencias, faturas, importacoes, sugestoes de IA, anexos e auditoria.
- O seed demo continua ficticio, minimizado e segmentado por perfis pessoal, MEI e negocio.
- As subissues #134 a #150 ficam atendidas no nivel de fundacao MVP: rotas, contratos, modelo, testes e documentacao existem, enquanto features produtivas profundas permanecem como evolucoes incrementais futuras.

## Escopo consolidado por subissue

- #134: stack executavel registrada em ADRs, usando TypeScript/Node/npm workspaces/PostgreSQL/Prisma.
- #135: web roteavel com login, dashboard, menu autenticado, placeholders privados, health e manifest.
- #136: autenticacao local com sessao expirada, logout e erros seguros para o MVP.
- #137: contratos de dominio financeiro para contas, categorias, lancamentos, transferencias e saldos iniciais.
- #138: schema Prisma e seed demo para PostgreSQL local.
- #139: modelos e contratos com `organizationId` e `financialProfileId` para isolamento inicial.
- #140 a #144: telas/contratos iniciais aparecem no menu e no dashboard como fundacao navegavel.
- #145 e #146: contratos de importacao, inbox e conciliacao ficam preparados no dominio/IA para iteracoes posteriores.
- #147: abstracao de IA local/fake e sugestoes revisaveis ficam modeladas sem provedor externo real.
- #148: auditoria, consentimento, mascaramento e minimizacao ficam representados nos contratos iniciais.
- #149: CI e testes por workspace validam rotas, autenticacao, manifest, contratos de API e dominio.
- #150: contratos de exportacao/integração MEI/SolverIT ficam no escopo de fundacao, sem contabilidade oficial.

## Consequencias

- A epica #133 pode ser encerrada como fundacao MVP navegavel, nao como produto financeiro completo de producao.
- As funcionalidades profundas de CRUD, importacao, faturas, IA real, LGPD operacional completa e integracoes externas devem continuar em issues menores, com PRs independentes.
- O servidor web atual e adequado para validacao local e CI, mas uma ADR futura deve escolher framework/backend definitivo antes de producao.
- A sessao em memoria e seed demo nao devem ser promovidos a producao.
- Qualquer nova feature financeira deve manter filtro por contexto autenticado e exemplos ficticios.

## Alternativas consideradas

### Reimplementar a epica inteira em uma unica PR

A epica cobre praticamente todo o produto MVP. Reimplementar tudo de uma vez aumentaria risco, duplicaria o corte ja mergeado e dificultaria revisao.

### Abrir uma PR por subissue imediatamente

Seria mais granular, mas a base comum ja existe no `main`. Neste momento a entrega mais segura e consolidar a decisao, reforcar testes e fechar a epica como fundacao navegavel.

### Trocar para framework full-stack agora

Essa escolha pode ser correta no futuro, mas nao e necessaria para finalizar a fundacao da epica #133. A decisao deve ocorrer em uma ADR propria quando houver necessidade de producao, deploy ou separacao operacional real.
