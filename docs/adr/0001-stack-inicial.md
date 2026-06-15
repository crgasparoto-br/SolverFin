# ADR-0001 - Stack inicial e arquitetura de alto nivel

## Status

Aceito

## Data

2026-06-15

## Contexto

SolverFin sera implementado com apoio frequente de agentes de IA. O projeto precisa de uma stack previsivel, tipada, testavel e adequada para um produto financeiro com PWA, backend, persistencia relacional, IA explicavel, auditoria e separacao por tenant/perfil financeiro.

A issue #1 solicita uma fundacao documental antes do bootstrap tecnico. Esta ADR registra a direcao inicial sem implementar codigo de produto.

## Decisao

Adotar TypeScript como linguagem principal e organizar o projeto como monorepo, com separacao entre aplicacoes e pacotes compartilhados.

Direcao inicial:

- frontend web/PWA mobile-first;
- backend API modular;
- banco relacional com migrations versionadas;
- pacote de dominio financeiro separado de detalhes de infraestrutura;
- pacote ou camada dedicada para IA, com schemas estruturados, validacao e provedores substituiveis;
- documentacao e ADRs como parte obrigatoria do fluxo de mudanca.

A escolha concreta de frameworks, banco, ORM, autenticacao, runtime e ferramentas de CI sera feita em issues de bootstrap e pode gerar ADRs complementares.

## Consequencias

- Agentes devem evitar implementar funcionalidades financeiras antes do bootstrap tecnico.
- Novas escolhas de tecnologia precisam respeitar TypeScript, monorepo e separacao de dominio, salvo ADR posterior.
- O dominio financeiro deve ser testavel sem depender diretamente de UI, banco ou provedor de IA.
- Integracoes externas exigem ADR ou issue dedicada antes de implementacao.
- Saidas de IA devem ser estruturadas, validadas e auditaveis.

## Alternativas consideradas

### Repositorio unico sem monorepo

Mais simples no inicio, mas tende a misturar frontend, backend, dominio e contratos conforme o produto crescer.

### Stack sem TypeScript

Poderia reduzir configuracao em alguns cenarios, mas perde consistencia de tipos entre frontend, backend, schemas de IA e contratos compartilhados.

### Definir todos os frameworks agora

Anteciparia decisoes ainda sem bootstrap e sem implementacao real. A escolha sera mais segura quando as issues tecnicas definirem comandos, estrutura e CI.
