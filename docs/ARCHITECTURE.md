# Arquitetura - SolverFin

## Objetivo

Este documento define a arquitetura observada do SolverFin e as regras tecnicas que orientam implementacoes por humanos e agentes de IA.

Ele nao substitui ADRs. Mudancas duradouras de stack, provider, integracao externa ou modelo persistente devem ser registradas em `docs/adr/`.

## Estado atual

O nucleo financeiro do MVP esta ligado de ponta a ponta com persistencia real:

- `apps/api` e um servidor HTTP em Node `http` puro que resolve sessao/tenant, chama `packages/domain` e persiste via `pg` com SQL parametrizado em PostgreSQL;
- `apps/web` e um servidor SSR em Node `http` puro que autentica contra a API real, guarda o token em cookie HttpOnly e renderiza HTML com CSS gerado por funcoes TypeScript;
- contas, categorias, lancamentos, recorrencias/parcelas, cartoes/faturas, orcamentos, autenticacao local, Inbox e fluxos administrativos possuem implementacoes executaveis em diferentes niveis de maturidade;
- o modelo de cartoes usa cartao agrupador/fatura como recurso pai e instrumentos internos como origem rastreavel das compras, conforme `docs/CARDS.md`;
- recorrencias aparecem incorporadas ao Extrato e as compras de cartao, sem rota web operacional separada;
- a rotina ativa de compromissos usa `Transaction`, `Invoice`, recorrencias e parcelas materializadas; `PayableReceivable` permanece como compatibilidade tecnica documentada;
- importacao, deduplicacao, conciliacao, automacao e IA possuem contratos de dominio e evoluem por issues dedicadas;
- `packages/ai` possui um adapter HTTP real e substituivel para OpenAI, configurado exclusivamente por ambiente, desativado por padrao e governado pelo executor comum de consentimento, sanitizacao, timeout e retry;
- o assistente financeiro conversacional da issue #568 esta operacional em `/assistente`, persiste conversa e turnos no PostgreSQL e permanece estritamente somente leitura;
- os modulos `financial-assistant-data`, `financial-assistant-repository`, `financial-assistant-service` e `financial-assistant-router` resolvem evidencia, estado, concorrencia, autorizacao e projecao publica sem delegar calculos financeiros ao provider;
- autenticacao produtiva segue a decisao aceita em `docs/adr/0004-autenticacao-produtiva.md`.

A decisao inicial de stack esta em `docs/adr/0001-stack-inicial.md`. Node `http` puro continua deliberadamente em API e Web para nao antecipar framework sem ADR. O provider real inicial de IA segue a decisao aceita em `docs/adr/0010-openai-provider-inicial.md`. O estado conversacional somente leitura e seus limites seguem a decisao aceita em `docs/adr/0011-read-only-financial-assistant.md`.

## Stack inicial

- TypeScript;
- monorepo npm workspaces;
- Web SSR/PWA mobile-first;
- API modular em Node `http`;
- PostgreSQL;
- Prisma para schema, migrations e client onde aplicavel;
- `pg` para persistencia SQL atual da API;
- testes automatizados por dominio, API, UI e integracao;
- GitHub Actions para instalacao reprodutivel, lint, typecheck, testes e build;
- camada de dominio desacoplada de UI, banco e provedores externos;
- provedores de IA acessados por abstracoes proprias, schemas estruturados, logs seguros e adapters HTTP substituiveis; OpenAI e o primeiro adapter real, sem SDK de fornecedor no dominio.

## Web SSR e composicao de estilos

O SSR web mantem CSS como strings retornadas por funcoes TypeScript e incorporadas em blocos `<style>`. Nao existe bundler CSS, framework frontend ou folha externa como fonte de verdade atual.

Fontes principais:

- `apps/web/src/app-shell/routes.ts`: catalogo canonico de rotas e status;
- `apps/web/src/dev-server.ts`: servidor, despacho HTTP e pos-processamentos por rota;
- `apps/web/src/dev-server/shell.ts`: documento HTML e shell autenticado;
- `apps/web/src/dev-server/http.ts`: finalizacao comum antes do envio do HTML;
- `apps/web/src/dev-server/shared-styles.ts`: CSS compartilhado e dialogos;
- renderers em `apps/web/src/dev-server/*-page.ts` e `pages.ts`: CSS especifico;
- `apps/web/src/dev-server/recurrences-section.ts`: CSS auxiliar de recorrencias;
- `apps/web/src/dev-server/statement-presentation.ts`: CSS condicional do Extrato;
- `apps/web/src/dev-server/list-sorting-enhancement.ts`: ordenacao e estilos estruturais de remuneracao no Extrato;
- `apps/web/src/dev-server/account-remuneration-disclosure-enhancement.ts`: affordance visual da memoria de calculo da remuneracao;
- `apps/web/src/dev-server/ssr-style-contract.ts`: manifesto tipado por rota e provedor;
- `scripts/validate-web-ssr-styles.mjs`: verificacao executavel do HTML final servido.

### Invariantes do contrato

Toda rota com `status: "available"` deve ter exatamente um contrato, inclusive:

- `/login`;
- `/assistente`;
- renderers ocultos na navegacao, como `/remuneracao-contas`;
- rotas master `/admin/instituicoes` e `/admin/indices-financeiros`.

O manifesto registra rota, renderer, shell, classificacao de CSS, provedores de cabecalho, o provedor especifico `page:<routeId>`, auxiliares independentes, provedores inseridos no runtime e gatilhos condicionais. O build falha quando:

- a cobertura diverge da fonte canonica;
- uma rota operacional disponivel redireciona, retorna erro ou deixa de ser servida pelo despacho real;
- o renderer legado de `/remuneracao-contas` nao pode ser exercitado no modo interno do portao enquanto o redirecionamento publico permanece preservado;
- um provedor compartilhado ou condicional retorna CSS vazio;
- o resultado de um provedor compartilhado/condicional existe no codigo mas nao esta incorporado ao HTML final;
- um fragmento discriminante de provedor de pagina, auxiliar ou runtime registrado nao aparece no CSS final;
- uma rota `page-specific` nao registra exatamente um provedor de pagina;
- uma rota `shared-only` registra silenciosamente um provedor de pagina;
- o CSS de navegacao autenticada nao aparece no corpo;
- o HTML real nao produz o fragmento necessario para ativar um provedor condicional;
- o provedor condicional ativado nao aparece no cabecalho final.

O portao nao infere CSS especifico apenas pela existencia de qualquer regra remanescente. Cada provedor de pagina, auxiliar ou runtime possui identificador e fragmentos CSS proprios; os controles negativos removem um provedor por vez, mantendo os demais presentes.

Marcadores de blocos runtime possuem propriedade explicita por modulo. No Extrato, `data-account-remuneration-statement-styles` e produzido por `list-sorting-enhancement.ts`, enquanto `data-account-remuneration-disclosure-affordance` e produzido por `account-remuneration-disclosure-enhancement.ts`. O contrato os registra como provedores distintos para impedir que um bloco valido de um modulo mascare a perda do outro.

A validacao inicia `createSolverFinWebServer()` em `127.0.0.1` com porta efemera e requisita os renderers cobertos. Rotas autenticadas recebem cookie ficticio; chamadas internas usam `fetch` ficticio e seguro. Em execucao normal, `/remuneracao-contas` e `/app/remuneracao-contas` continuam redirecionando para `/contas-cartoes`; somente o processo filho iniciado por `scripts/build-web.mjs` define `SOLVERFIN_SSR_STYLE_CONTRACT_VALIDATION=1` para exercitar o renderer legado sem alterar esse contrato publico. A fixture de `/lancamentos` inclui conta ativa e lancamento ficticio de remuneracao CDI para ativar tanto os estilos estruturais quanto a affordance de divulgacao. Dessa forma, o portao exercita `resolveRoute`, o despacho de `dev-server.ts`, os pos-processamentos e `sendHtml`, sem acessar API, banco, rede externa ou secrets e sem exigir `apps/web/dist` preexistente. Falhas usam o prefixo `SolverFin SSR style contract`, identificam rota/provedor/modulo e sao agregadas na mesma execucao.

O documento dono das regras operacionais do shell e `docs/APP_SHELL.md`; `docs/DESIGN_SYSTEM.md` descreve a propriedade visual dos provedores.

## CI

O workflow `.github/workflows/ci.yml` roda em `pull_request` e `push` para `main`.

### Validate monorepo

```bash
npm ci --no-audit --no-fund
npm run env:check
npm run prisma:validate
npm run db:seed:check
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

O build raiz chama o build de `@solverfin/web`; `scripts/build-web.mjs` limpa `apps/web/dist`, compila TypeScript e executa `scripts/validate-web-ssr-styles.mjs`. Assim, o job usa a implementacao oficial do contrato sem manter inventario paralelo no YAML.

O comando explicito para o mesmo portao e:

```bash
npm run validate:ssr-styles --workspace @solverfin/web
```

Os testes de provider de IA usam `FakeAiProvider` e cliente HTTP fake. O CI nao recebe credencial real, nao chama rede externa e nao exige aprovacao manual para validar o adapter.

O workflow visual existente executa os cenarios em `scripts/statement-visual/`. Para a issue #568, a evidencia dedicada cobre `/assistente` em desktop, mobile, escala de pagina a 200%, teclado/foco, clarificacao, erro controlado e as transicoes de cancelar, limpar e iniciar novo contexto.

### Integration API + PostgreSQL

O job de integracao sobe PostgreSQL 16 efemero e executa migrations, seed ficticio e testes da API com uma base dedicada.

```bash
npm ci --no-audit --no-fund
npm run prisma:generate
npm run build:packages
npm run db:deploy
npm run db:seed
npm run test:integration --workspace @solverfin/api
```

Como o `package-lock.json` e versionado, os jobs usam `npm ci` e cache baseado no lockfile.

## Ambientes e secrets

A politica de ambientes fica em `docs/ENVIRONMENT.md`; privacidade, consentimento, retencao e mascaramento ficam em `docs/PRIVACY.md`; o contrato operacional do provider fica em `docs/ai/providers.md`.

Direcao atual:

- `.env.example` usa apenas placeholders seguros e mantem `AI_PROVIDER=disabled`;
- `.env`, certificados, chaves e arquivos locais ficam ignorados;
- `npm run env:check` valida o exemplo versionado, inclusive endpoint e limites do provider de IA;
- mensagens de erro citam nomes de variaveis, nunca valores sensiveis;
- secrets reais ficam somente nos ambientes que precisam deles;
- dados financeiros brutos e respostas de IA seguem minimizacao e retencao documentadas;
- o health check de IA valida apenas configuracao e nunca envia payload ao fornecedor.

## Ambiente local de banco

```bash
docker compose up -d postgres
docker compose ps
docker compose down
docker compose down -v
```

`docker compose down -v` apaga o volume local e deve ser usado apenas para reset deliberado. Aplicacao e Prisma usam `DATABASE_URL`; nenhum segredo real deve ser colocado em exemplos.

## Diagrama textual de componentes

```text
Usuario
  -> Web SSR/PWA
    -> API backend inicia OIDC/PKCE
      -> Amazon Cognito User Pools (`sa-east-1`)
      -> Callback backend e correlação persistente
      -> Sessão SolverFin em cookie HttpOnly
      -> Tenant SolverFin
      -> Dominio financeiro
      -> Importacao e conciliacao
      -> Assistente financeiro somente leitura
        -> estado persistido de conversa/turno no PostgreSQL
        -> resolucao deterministica de intent, periodo, moeda, filtros e evidencia
        -> resposta canonica calculada no backend
        -> provider opcional retorna somente DIRECT ou CONTEXTUAL
      -> IA explicavel
        -> runAiTask: consentimento, minimizacao, timeout e retry
          -> AiProvider substituivel
            -> FakeAiProvider em testes/desenvolvimento
            -> OpenAiProvider somente quando habilitado por ambiente
      -> Persistencia PostgreSQL

Build Web
  -> TypeScript
  -> servidor Node http em porta efemera
  -> requisicoes HTTP para renderers cobertos
  -> modo interno isolado para renderer legado de remuneracao
  -> contrato de estilos SSR sobre HTML final
  -> artefato aceito ou falha agregada
```

## Boundaries

### Produto e documentacao

Responsavel por visao, escopo, personas, tom, criterios, privacidade e contratos vivos. Arquivos centrais: `docs/PRODUCT.md`, `docs/BRAND.md`, `docs/PRIVACY.md`, `docs/APP_SHELL.md` e `README.md`.

### Dominio financeiro

Responsavel por contas, categorias, lancamentos, recorrencias, parcelas, faturas, cartoes agrupadores, instrumentos, orcamentos, metas, compatibilidade legada e conciliacao. Regras de dominio nao devem depender de UI, banco, fila, IA ou APIs externas.

### Identidade e tenant

Responsavel por identidade validada, usuario local, organizacao, perfil financeiro, permissoes e isolamento. Todo dado financeiro persistente deve ter vinculo claro com tenant/perfil.

### Persistencia

Responsavel por schema, migrations, seeds seguros, consultas e transacoes. Regras de produto devem permanecer no dominio quando possivel.

### Importacao e conciliacao

Responsavel por receber CSV, OFX, mensagens autorizadas e outras origens, normalizar, deduplicar e sugerir conciliacao. Dados brutos seguem minimizacao e descarte documentados.

### IA financeira

Responsavel por extracao, classificacao, explicacao, sugestoes, insights e pela apresentacao controlada do assistente. Saidas devem ser estruturadas, revisaveis e auditaveis quando o fluxo produz sugestao; no assistente, a participacao externa e limitada à diretiva fechada `DIRECT` ou `CONTEXTUAL` e o backend controla todo texto exibido.

O boundary interno e `AiProvider`. `runAiTask` governa consentimento, minimizacao, retry e logs; adapters concretos apenas traduzem `SafeAiProviderRequest`, executam uma chamada externa por tentativa e validam a resposta. OpenAI e o primeiro adapter real, mas modelo, endpoint e credencial permanecem configuraveis por ambiente e nao fazem parte do dominio financeiro.

No assistente, o provider nao e um boundary de calculo nem de autoria de texto financeiro livre. Os fatos quantitativos sao resolvidos antes da chamada externa; a saida valida do provider se limita a `DIRECT` ou `CONTEXTUAL`; a conversa persiste somente pergunta normalizada, filtros, evidencia estruturada e resposta segura, sem prompt montado ou resposta bruta do provider.

### Interface web/PWA

Responsavel por rotinas diarias, revisao, dashboards, relatorios, configuracoes, assistente financeiro e shell SSR. A interface deve ser mobile-first, acessivel e coerente com `docs/BRAND.md` e `docs/DESIGN_SYSTEM.md`.

## Regras arquiteturais

- Manter dominio financeiro separado de frameworks quando isso reduzir acoplamento real.
- Nao criar integracao externa sem ADR ou issue dedicada.
- Nao acoplar regras de negocio a prompts de IA.
- Modelar saidas de IA com schemas estruturados.
- Executar no maximo uma chamada outbound ao provider por tentativa do executor comum.
- Manter provider real desativado por padrao e testes hermeticos sem secrets ou rede externa.
- Revalidar consentimento imediatamente antes de cada tentativa de IA quando houver resolvedor dinamico.
- Nao registrar prompt, campos, credencial, resposta bruta ou identificadores de tenant em logs de provider.
- Nao delegar ao provider calculos ou fatos quantitativos do assistente financeiro.
- Aceitar do provider do assistente somente as diretivas `DIRECT` ou `CONTEXTUAL`; qualquer outro texto deve ser descartado antes da fronteira publica.
- Serializar ou rejeitar concorrencia por conversa e preservar idempotencia antes de qualquer tentativa externa.
- Registrar auditoria para mudancas financeiras relevantes.
- Nao armazenar senhas, tokens brutos ou respostas sensiveis em logs.
- Preferir exclusao logica para dados financeiros.
- Proteger tenant/perfil em consultas, comandos e testes.
- Usar fixtures ficticias e minimizadas.
- Documentar contratos publicos, migrations e novos precedentes arquiteturais.
- Preservar dados antigos de `PayableReceivable` ate existir plano explicito de migracao.
- Tratar `solverFinShellRoutes` como fonte canonica de cobertura SSR.
- Validar o HTML final pelo despacho HTTP antes de aceitar o artefato web, usando modo interno isolado quando um renderer legado precisa permanecer coberto sem reativar a rota publica.
- Nao introduzir uma lista paralela de rotas ou workspaces no CI quando os comandos oficiais ja mantem essa composicao.

## Dados e privacidade

Dados financeiros, mensagens bancarias, identificadores, documentos, tokens e chaves sao sensiveis.

Diretrizes:

- persistir apenas o necessario;
- descartar dado bruto apos normalizacao por padrao;
- mascarar identificadores quando o valor completo nao for indispensavel;
- auditar alteracoes financeiras com mudancas redigidas;
- registrar consentimento para importacoes, mensagens e IA;
- manter origem e revisao de sugestoes;
- limitar conversa do assistente a estado tenant-scoped com TTL, evidencia estruturada e resposta segura;
- usar somente dados ficticios em seeds, fixtures e documentacao.

## Validacao esperada por tipo de mudanca

- dominio: testes unitarios e casos de borda;
- APIs: contrato, autorizacao, tenant e integracao;
- banco: schema, migrations e dados seguros;
- frontend: renderizacao, acessibilidade, estados e contrato SSR quando estilos/rotas forem afetados;
- IA/importacao: schemas, fallback, consentimento, contagem de chamadas outbound e revisao humana;
- assistente conversacional: idempotencia, concorrencia, restart, cancelamento, expiracao, troca de perfil/moeda, fronteira publica e navegador real para teclado, foco, mobile, 200% e erros;
- documentacao: consistencia, links e ADR quando houver decisao duradoura.

## Estrutura principal

```text
apps/
  web/
  api/
packages/
  domain/
  shared/
  ai/
  config/
scripts/
docs/
  adr/
prisma/
```

## Perguntas abertas

- Qual framework web/backend sera escolhido quando houver beneficio suficiente para uma ADR?
- Quais fluxos futuros de produto habilitarao o provider real e quais exigirao revisao humana obrigatoria?
- Quais excecoes de retencao de dados brutos exigirao consentimento ou ADR?
- Quais metricas, budgets e alertas governarao custo e qualidade de IA por ambiente?

Essas respostas devem ser resolvidas por issues especificas e ADRs.

## Idempotência de conjuntos financeiros

A criação de conjuntos financeiros com múltiplos efeitos usa identidade durável no PostgreSQL, escopo explícito de organização/perfil, fingerprint do payload de negócio e serialização concorrente antes das mutações. O primeiro contrato é o parcelamento manual descrito na ADR 0007; rollback não persiste efeitos nem consome a tentativa.