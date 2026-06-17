# ADR 0004 - Autenticacao produtiva definitiva

## Status

Proposto

## Data

2026-06-17

## Contexto

O SolverFin possui uma autenticacao inicial para o MVP local: usuario demo fixo,
hash SHA-256 simples, sessoes em memoria e contrato puro para login, logout e
rotas privadas. Essa camada viabiliza desenvolvimento e testes, mas nao atende
requisitos de producao para um produto financeiro com dados sensiveis.

Autenticacao produtiva precisa tratar identidade, credenciais, sessao,
revogacao, auditoria, separacao de ambientes, LGPD e integracao futura com
tenants e perfis financeiros. Manter a autenticacao demo sem uma fronteira clara
poderia induzir uso indevido em preview, staging ou producao.

## Decisao

A autenticacao demo permanece permitida apenas para desenvolvimento local, testes
automatizados e demonstracoes nao produtivas explicitamente autorizadas.

Antes de liberar usuarios reais ou dados produtivos, o projeto deve escolher e
implementar uma estrategia definitiva de autenticacao por nova issue e ADR aceita.
Essa decisao deve cobrir, no minimo:

- provider gerenciado ou modulo proprio;
- armazenamento persistente de usuarios e sessoes;
- hashing de senha adequado ou delegacao total de credenciais ao provider;
- expiracao, renovacao e revogacao de sessoes;
- integracao com perfis financeiros e isolamento por tenant;
- trilhas de auditoria e eventos relevantes de seguranca;
- estrategia de migracao do login demo para ambientes nao produtivos.

## Consequencias

- A autenticacao demo nao deve ser considerada requisito produtivo atendido.
- Ambientes fora de `development`, `local` e `test` devem falhar cedo se tentarem
  carregar a autenticacao demo sem opt-in explicito.
- `AUTH_ALLOW_DEMO=true` so pode ser usado para demonstracoes nao produtivas
  temporarias e documentadas.
- A escolha produtiva continuara pendente ate uma ADR posterior ser aceita com a
  estrategia definitiva.

## Alternativas consideradas

### Manter auth demo sem bloqueio de ambiente

Rejeitada. O risco de uso silencioso em ambiente incorreto e alto para um produto
financeiro.

### Transformar imediatamente a auth demo em auth produtiva

Rejeitada neste momento. A issue atual pede isolamento e sinalizacao da camada
demo, nao a escolha completa de provider, modelo de credenciais e persistencia.

### Usar provider gerenciado ja nesta ADR

Adiada. A escolha do provider exige analise propria de custo, LGPD, MFA,
operacao, lock-in e integracao com a arquitetura futura.
