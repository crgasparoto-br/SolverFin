# Arquitetura - SolverFin

## Objetivo

Este documento define a arquitetura observada do SolverFin e as regras tecnicas que orientam implementacoes por humanos e agentes de IA.

Ele nao substitui ADRs. Mudancas duradouras de stack, provider, integracao externa ou modelo persistente devem ser registradas em `docs/adr/`.

`docs/EVOLUTION_STRATEGY.md` registra a direcao estrutural da Fase 3. A arquitetura observada e a arquitetura-alvo devem permanecer distintas enquanto a migracao estiver em andamento.

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

## Direcao arquitetural da Fase 3

A Fase 3 nao substitui o runtime atual em um unico corte. Ela introduz dois invariantes duradouros:

1. **Multi-moedas por contrato**: valores devem carregar moeda; agregacoes entre moedas distintas exigem conversao explicita e auditavel. Sem conversao, respostas ficam particionadas por moeda. A decisao esta na ADR 0013.
2. **Interface por composicao estruturada**: novas features devem preferir tokens, componentes executaveis, layouts e view-models em vez de ampliar pos-processamento textual do HTML final. A migracao e incremental, preservando SSR e gates atuais. A decisao esta na ADR 0014.

Esses invariantes valem para novo trabalho imediatamente. O codigo legado permanece suportado ate a issue de migracao correspondente, mas nao define a direcao preferencial para novas implementacoes.

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

A Fase 3 nao escolhe framework frontend ou backend novo. Uma eventual troca de runtime/framework exige ADR propria e beneficio demonstrado alem da componentizacao incremental.

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

### Invariantes do contrato atual

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

O documento dono das regras operacionais do shell e `docs/APP_SHELL.md`; `docs/DESIGN_SYSTEM.md` descreve a propriedade visual dos provedores e a fundacao executavel alvo.

### Regra de migracao do frontend

O contrato acima descreve o mecanismo observado e continua sendo gate enquanto a rota depender dele. Para novas features e rotas migradas:

- preferir composicao estruturada e view-models;
- nao criar pos-processamento por regex/string sobre HTML final como solucao padrao de layout ou estado;
- manter pos-processadores antigos somente ate a migracao da responsabilidade correspondente;
- remover/depreciar provedores runtime que se tornarem desnecessarios no mesmo recorte de migracao;
- preservar cobertura de SSR/HTML final ou introduzir protecao equivalente antes de remover o gate anterior;
- preservar acessibilidade, responsividade e evidencia visual.

## Multi-moedas

A moeda e parte do tipo financeiro conceitual. Regras gerais:

- todo valor persistido/calculado/exibido deve ter moeda conhecida;
- agregacoes entre moedas diferentes sao invalidas sem conversao explicita;
- consultas que abrangem varias moedas devem retornar blocos por moeda por padrao;
- hardcode de BRL e permitido apenas em contrato deliberadamente restrito a BRL, nunca como fallback generico;
- uma futura conversao cambial deve registrar origem/destino, taxa, data/instante de referencia e origem da cotacao;
- UI e assistente nao podem inventar conversao nem ocultar que um total esta particionado;
- testes de agregacao/projecao devem incluir casos com moedas distintas.

A ADR 0013 e a fonte da decisao; contratos especificos detalham como cada endpoint ou dominio a materializa.

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

A migracao visual da Fase 3 deve reaproveitar o gate existente e evolui-lo para cenarios de fluxo/componente, sem aceitar perda de cobertura entre a retirada de um provedor legado e a nova composicao.

### Integration API + PostgreSQL

O job de integracao sobe PostgreSQL 16 efemero e executa migrations, seed ficticio e testes da API com uma base dedicada.

```bash
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
    -> composicao de shell + componentes/layouts durante a migracao
    -> API backend inicia OIDC/PKCE
      -> Amazon Cognito User Pools (`sa-east-1`)
      -> Callback backend e correlacao persistente
      -> Sessao SolverFin em cookie HttpOnly
      -> Tenant SolverFin
      -> Dominio financeiro
        -> valores preservam moeda
        -> agregacoes particionam por moeda sem conversao
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

Responsavel por visao, escopo, personas, tom, criterios, privacidade e contratos vivos. Arquivos centrais: `docs/PRODUCT.md`, `docs/EVOLUTION_STRATEGY.md`, `docs/BRAND.md`, `docs/PRIVACY.md`, `docs/APP_SHELL.md` e `README.md`.

### Dominio financeiro

Responsavel por contas, categorias, lancamentos, recorrencias, parcelas, faturas, cartoes agrupadores, instrumentos, orcamentos, metas, compatibilidade legada, moeda e conciliacao. Regras de dominio nao devem depender de UI, banco, fila, IA ou APIs externas.

A camada de dominio deve rejeitar ou impedir operacoes aritmeticas incoerentes entre moedas quando a conversao nao fizer parte explicitamente do caso de uso.

### Identidade e tenant

Responsavel por identidade validada, usuario local, organizacao, perfil financeiro, permissoes e isolamento. Todo dado financeiro persistente deve ter vinculo claro com tenant/perfil.

### Persistencia

Responsavel por schema, migrations, seeds seguros, consultas e transacoes. Regras de produto devem permanecer no dominio quando possivel.

### Importacao e conciliacao

Responsavel por receber CSV, OFX, mensagens autorizadas e outras origens, normalizar, deduplicar e sugerir conciliacao. Dados brutos seguem minimizacao e descarte documentados.

### IA financeira

Responsavel por extracao, classificacao, explicacao, sugestoes, insights e pela apresentacao controlada do assistente. Saidas devem ser estruturadas, revisaveis e auditaveis quando o fluxo produz sugestao; no assistente, a participacao externa e limitada a diretiva fechada `DIRECT` ou `CONTEXTUAL` e o backend controla todo texto exibido.

O boundary interno e `AiProvider`. `runAiTask` governa consentimento, minimizacao, retry e logs; adapters concretos apenas traduzem `SafeAiProviderRequest`, executam uma chamada externa por tentativa e validam a resposta. OpenAI e o primeiro adapter real, mas modelo, endpoint e credencial permanecem configuraveis por ambiente e nao fazem parte do dominio financeiro.

No assistente, o provider nao e um boundary de calculo nem de autoria de texto financeiro livre. Os fatos quantitativos sao resolvidos antes da chamada externa; a saida valida do provider se limita a `DIRECT` ou `CONTEXTUAL`; a conversa persiste somente pergunta normalizada, filtros, evidencia estruturada e resposta segura, sem prompt montado ou resposta bruta do provider.

### Interface web/PWA

Responsavel por rotinas diarias, revisao, dashboards, relatorios, configuracoes, assistente financeiro e shell SSR. A interface deve ser mobile-first, acessivel e coerente com `docs/BRAND.md`, `docs/DESIGN_SYSTEM.md`, ADR 0013 e ADR 0014.

A interface formata e apresenta contratos financeiros; nao redefine regra de saldo, fatura, cambio, orcamento ou projecao.

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
- Preservar moeda explicitamente; nunca agregar moedas diferentes sem conversao auditavel.
- Nao usar BRL como fallback generico em contratos multi-moedas.
- Manter calculos financeiros fora da apresentacao.
- Para nova UI, preferir componentes/layouts/view-models e nao ampliar pos-processamento textual do HTML final como padrao.
- Migrar a UI de forma incremental, preservando SSR, acessibilidade, responsividade e gates visuais.

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

Metadados de conversao cambial, quando existirem, sao parte da evidencia financeira e devem ser preservados de forma suficiente para explicar o valor consolidado sem expor informacao sensivel desnecessaria.

## Validacao esperada por tipo de mudanca

- dominio: testes unitarios e casos de borda, incluindo moeda quando houver valores/agregacoes;
- APIs: contrato, autorizacao, tenant, moeda e integracao;
- banco: schema, migrations e dados seguros;
- frontend: renderizacao, acessibilidade, estados, moeda e contrato SSR/cobertura equivalente quando estilos/rotas forem afetados;
- IA/importacao: schemas, fallback, consentimento, contagem de chamadas outbound e revisao humana;
- assistente conversacional: idempotencia, concorrencia, restart, cancelamento, expiracao, troca de perfil/moeda, fronteira publica e navegador real para teclado, foco, mobile, 200% e erros;
- fluxos de cartao/fatura: invariantes que diferenciem consumo e liquidacao e evitem dupla contabilizacao;
- agregacoes/projecoes: cenarios com pelo menos duas moedas e ausencia de conversao implicita;
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
- Qual provider/politica de cotacao sera adotado quando consolidados cambiais entrarem no produto?
- Qual preferencia de moeda de referencia sera oferecida por perfil e como ela sera versionada/auditada?

Essas respostas devem ser resolvidas por issues especificas e ADRs.

## Idempotencia de conjuntos financeiros

A criacao de conjuntos financeiros com multiplos efeitos usa identidade duravel no PostgreSQL, escopo explicito de organizacao/perfil, fingerprint do payload de negocio e serializacao concorrente antes das mutacoes. O primeiro contrato e o parcelamento manual descrito na ADR 0007; rollback nao persiste efeitos nem consome a tentativa.
