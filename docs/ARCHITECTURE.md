# Arquitetura - SolverFin

## Objetivo

Este documento define a direcao arquitetural inicial do SolverFin para orientar implementacoes futuras por humanos e agentes de IA.

Ele nao substitui ADRs. Decisoes duradouras, mudancas de stack, integracoes externas e alteracoes relevantes de modelo devem ser registradas em `docs/adr/`.

## Estado atual

O nucleo financeiro do MVP esta ligado de ponta a ponta com persistencia real:

- `apps/api` e um servidor HTTP em Node `http` puro (sem framework) que resolve sessao/tenant, chama `packages/domain` para validar regras e persiste via `pg` (SQL parametrizado) em PostgreSQL. Cobre contas, categorias, lancamentos, recorrencias/parcelas, cartoes/faturas e orcamentos, incluindo trilha de auditoria (`AuditLogEntry`).
- `apps/web` e um servidor SSR em Node `http` puro que autentica contra a API real (token guardado em cookie HttpOnly) e renderiza dashboard, contas, categorias, lancamentos, cartoes e orcamentos com dados reais; demais rotas do menu ainda sao placeholder.
- Nao ha API real nem persistencia para contas a pagar/receber (`packages/domain/src/payables-receivables.ts` existe, mas falta o modelo `PayableReceivable` no `prisma/schema.prisma`).
- Importacao (CSV/OFX/mensagens bancarias), deduplicacao, conciliacao, regras de automacao e a camada de IA tem dominio implementado e testado, mas ainda sem repositorio/API/UI ligados a banco real.
- Auth e tenant continuam no formato MVP descrito em `docs/AUTH.md`/`docs/TENANT.md` (usuario/organizacao/perfis fixos via seed, sem cadastro de novos usuarios).

A decisao inicial de stack esta registrada em `docs/adr/0001-stack-inicial.md`. Node `http` puro foi mantido tanto na API quanto no Web para nao antecipar uma escolha de framework (Express, React etc.) sem ADR dedicada.

## Stack inicial

Stack-alvo inicial:

- TypeScript como linguagem principal.
- Monorepo para frontend, backend e pacotes compartilhados.
- Frontend web/PWA mobile-first.
- Backend API modular.
- PostgreSQL como banco relacional inicial.
- Prisma como ORM e ferramenta de migrations inicial.
- Testes automatizados organizados por dominio, API, UI e integracoes.
- CI no GitHub Actions para instalar dependencias de forma reprodutivel, lint, typecheck, testes e build quando o bootstrap existir.
- Camada de dominio financeiro isolada de frameworks e provedores externos sempre que possivel.
- Provedores de IA acessados por abstracao propria, com schemas estruturados e logs seguros.

Frameworks concretos de frontend/backend, runtime, autenticacao e provedor de IA ainda devem ser definidos em issues de bootstrap ou ADRs complementares.

## CI inicial

O workflow `.github/workflows/ci.yml` roda em `pull_request` e `push` para `main`, sem depender de banco, Docker ou secrets reais.

Checks executados:

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

Os comandos ficam separados no workflow para que a falha mostre claramente se o problema esta em ambiente, instalacao, schema Prisma, seed, formatacao, lint, tipos, testes ou build.

Como o `package-lock.json` esta versionado, o CI usa `npm ci` para instalacao reprodutivel e habilita cache de npm baseado nesse lockfile.

Validacoes com PostgreSQL, Prisma migrations e seeds completos devem entrar em workflows ou jobs futuros quando os testes de persistencia exigirem banco real.

## Ambientes e secrets

A politica inicial de ambientes fica em `docs/ENVIRONMENT.md`.

Direcao tecnica atual:

- `.env.example` documenta variaveis obrigatorias com placeholders seguros.
- `.env`, `.env.*`, `.envrc`, certificados e chaves locais ficam ignorados pelo Git.
- `npm run env:check` valida o exemplo versionado e evita padroes aparentes de secrets reais.
- `packages/config` exporta `validateRuntimeEnvironment` para apps falharem claramente quando variaveis obrigatorias estiverem ausentes ou invalidas.
- Mensagens de erro devem citar nomes de variaveis, nunca valores sensiveis.
- Secrets reais devem ser configurados apenas nos ambientes que precisam deles, como GitHub Actions, preview, producao ou gerenciador externo futuro.

## Ambiente local de banco

O banco relacional local usa PostgreSQL via `docker-compose.yml`, com variaveis documentadas em `.env.example`.

Comandos principais:

```bash
docker compose up -d postgres
docker compose ps
docker compose down
docker compose down -v
```

O comando `docker compose down -v` apaga o volume local de desenvolvimento e deve ser usado apenas para resetar o banco.

A aplicacao e o Prisma devem usar `DATABASE_URL` quando o schema e as migrations forem implementados. Nenhum segredo real deve ser colocado em `.env.example`; valores ali sao placeholders seguros para desenvolvimento.

## Diagrama textual de componentes

```text
Usuario
  -> Web/PWA
    -> API backend
      -> Dominio financeiro
      -> Servicos de importacao e conciliacao
      -> Servicos de IA explicavel
      -> Prisma
        -> PostgreSQL

Web/PWA
  -> revisa sugestoes, lancamentos, faturas, alertas e relatorios

Dominio financeiro
  -> valida regras de contas, categorias, lancamentos, recorrencias, faturas, orcamentos e conciliacao

Servicos de IA
  -> recebem dados minimizados
  -> retornam sugestoes estruturadas
  -> registram origem, confianca, explicacao e estado de revisao
```

## Boundaries iniciais

### Produto e documentacao

Responsavel por visao, escopo, personas, tom, criterios e regras de produto.

Arquivos principais:

- `docs/PRODUCT.md`
- `docs/BRAND.md`
- `README.md`

### Dominio financeiro

Responsavel por entidades e regras como contas, categorias, lancamentos, recorrencias, parcelas, faturas, orcamentos, metas, contas a pagar/receber e conciliacao.

Regras de dominio nao devem depender diretamente de detalhes de UI, banco, fila, provedores de IA ou APIs externas.

### Identidade e tenant

Responsavel por usuario, organizacao, perfil financeiro, permissoes e isolamento de dados.

Todo dado financeiro persistente deve ter vinculo claro com usuario, tenant ou perfil financeiro.

### Persistencia

Responsavel por schemas Prisma, migrations, seeds seguros, consultas e transacoes.

Persistencia nao deve conter regra de produto que possa viver no dominio financeiro. Seeds e fixtures devem ser ficticios e minimizados.

### Importacao e conciliacao

Responsavel por receber CSV, OFX, textos de mensagens bancarias e outras origens autorizadas, normalizar dados, detectar duplicidades e sugerir conciliacao.

Dados brutos sensiveis devem ser minimizados e protegidos.

### IA financeira

Responsavel por extracao, classificacao, explicacao, sugestoes, insights e assistente financeiro.

A IA deve produzir saidas estruturadas, revisaveis e auditaveis. Regras deterministicas devem ser preferidas quando forem suficientes.

### Interface web/PWA

Responsavel por fluxos de rotina diaria, revisao de sugestoes, dashboards, relatorios e configuracoes.

A interface deve ser mobile-first, acessivel, clara e coerente com `docs/BRAND.md`.

## Regras arquiteturais

- Manter dominio financeiro separado de frameworks sempre que isso reduzir acoplamento real.
- Nao criar integracao externa sem ADR ou issue dedicada.
- Nao acoplar regras de negocio a prompts de IA.
- Modelar saidas de IA com schemas estruturados e validacao.
- Registrar auditoria para mudancas financeiras relevantes.
- Preferir exclusao logica para dados financeiros.
- Proteger tenant/perfil financeiro em consultas, comandos e testes.
- Evitar fixtures com dados reais ou identificaveis.
- Documentar novos contratos publicos e migracoes relevantes.

## Dados e privacidade

Dados financeiros, mensagens bancarias, identificadores de conta/cartao, documentos, tokens e chaves devem ser tratados como sensiveis.

Diretrizes iniciais:

- persistir apenas o necessario;
- mascarar identificadores em logs e telas quando o valor completo nao for indispensavel;
- auditar alteracoes financeiras relevantes;
- registrar consentimento para importacoes, captura de mensagens e uso de IA;
- permitir rastrear origem e revisao de sugestoes automatizadas.

## Validacao esperada por tipo de mudanca

Enquanto nao houver bootstrap tecnico, validacao documental e suficiente para issues documentais.

Quando a stack existir, novas PRs devem executar validacoes compativeis com a mudanca:

- dominio financeiro: testes unitarios e casos de borda;
- APIs: testes de contrato, autorizacao e tenant;
- banco: migrations, rollback quando aplicavel e dados de exemplo seguros;
- frontend: testes de componentes/fluxos, acessibilidade e estados vazios;
- IA/importacao: fixtures ficticias, schemas, fallback e revisao humana;
- documentacao: links, consistencia e ADR quando houver decisao.

## Estrutura-alvo sugerida

A estrutura sera criada em issues de bootstrap. A direcao inicial e:

```text
apps/
  web/
  api/
packages/
  domain/
  shared/
  ai/
  config/
docs/
  adr/
```

Essa estrutura nao deve ser criada fora de uma issue de bootstrap tecnico, salvo necessidade justificada.

## Perguntas abertas

- Qual framework web/backend sera escolhido no bootstrap tecnico?
- Qual provedor de autenticacao sera usado?
- Quais dados brutos de importacao podem ser descartados apos normalizacao?
- Quais operacoes exigirao revisao humana obrigatoria antes de persistir efeitos financeiros?

Essas respostas devem ser resolvidas por issues especificas e ADRs.
