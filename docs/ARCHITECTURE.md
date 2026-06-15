# Arquitetura - SolverFin

## Objetivo

Este documento define a direcao arquitetural inicial do SolverFin para orientar implementacoes futuras por humanos e agentes de IA.

Ele nao substitui ADRs. Decisoes duradouras, mudancas de stack, integracoes externas e alteracoes relevantes de modelo devem ser registradas em `docs/adr/`.

## Estado atual

O repositorio esta em fase documental. Ainda nao existe aplicacao, monorepo tecnico, banco de dados, CI ou comandos obrigatorios.

A decisao inicial de stack esta registrada em `docs/adr/0001-stack-inicial.md` e deve orientar as proximas issues de bootstrap.

## Stack inicial

Stack-alvo inicial:

- TypeScript como linguagem principal.
- Monorepo para frontend, backend e pacotes compartilhados.
- Frontend web/PWA mobile-first.
- Backend API modular.
- PostgreSQL como banco relacional inicial.
- Prisma como ORM e ferramenta de migrations inicial.
- Testes automatizados organizados por dominio, API, UI e integracoes.
- CI no GitHub Actions para instalar dependencias, lint, typecheck, testes e build quando o bootstrap existir.
- Camada de dominio financeiro isolada de frameworks e provedores externos sempre que possivel.
- Provedores de IA acessados por abstracao propria, com schemas estruturados e logs seguros.

Frameworks concretos de frontend/backend, runtime, autenticacao e provedor de IA ainda devem ser definidos em issues de bootstrap ou ADRs complementares.

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
