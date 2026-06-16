# Identidade, perfil financeiro e tenant

## Objetivo

O modelo inicial de tenant do SolverFin separa os contextos financeiros de um
usuario para evitar mistura de dados pessoais, familiares, MEI e de pequenos
negocios.

Enquanto a API HTTP real ainda nao foi escolhida por ADR, o contrato fica no
pacote de dominio em `packages/domain/src/tenant.ts`.

## Conceitos

### Usuario

Representa a identidade autenticada. Apenas usuarios ativos podem criar
organizacoes, perfis financeiros ou resolver contexto de tenant.

### Organizacao

Agrupa um ou mais perfis financeiros sob um proprietario. No MVP, a organizacao
e criada para o proprio usuario autenticado. Convites, equipes e permissoes
avancadas ficam fora desta etapa.

### Perfil financeiro

Representa o contexto operacional usado em entidades financeiras. Um perfil pode
ser:

- `personal`;
- `family`;
- `mei`;
- `business`.

No MVP, o perfil financeiro e o tenant pratico das operacoes financeiras. Toda
entidade financeira persistente deve carregar `organizationId` e
`financialProfileId`.

## Contexto ativo

Rotas, services e repositories que operam dados financeiros devem resolver um
`TenantContext` antes de consultar ou gravar dados.

Quando o usuario tem apenas um perfil ativo, esse perfil pode ser usado como
contexto ativo inicial. Quando houver mais de um perfil ativo, o cliente deve
enviar o perfil desejado explicitamente.

Erros controlados:

```text
TENANT_PROFILE_REQUIRED
TENANT_CONTEXT_REQUIRED
TENANT_ACCESS_DENIED
TENANT_SCOPE_REQUIRED
TENANT_USER_DISABLED
```

## Entidades financeiras

Antes de ler, gravar ou alterar uma entidade financeira, o codigo deve validar
que ela pertence ao contexto ativo:

```ts
assertTenantScopedEntity(context, entity);
```

A validacao falha quando:

- a entidade nao tem `organizationId` ou `financialProfileId`;
- a entidade pertence a outro tenant/perfil financeiro.

## Estado sem perfil

No primeiro acesso autenticado, se o usuario ainda nao tiver perfil financeiro,
o sistema deve retornar erro controlado `TENANT_PROFILE_REQUIRED` e direcionar o
fluxo para criacao de um perfil.

## Fora do MVP

Esta etapa nao implementa:

- convites entre usuarios;
- times completos;
- permissoes granulares por papel;
- billing ou planos comerciais;
- decisao definitiva sobre organizacao familiar com varios usuarios.

Esses pontos devem ser tratados em issues ou ADRs futuras.

## Testes

O pacote `@solverfin/domain` cobre:

- criacao de organizacao;
- criacao de perfil financeiro;
- resolucao de contexto ativo;
- exigencia de selecao explicita quando ha multiplos perfis;
- rejeicao de entidade financeira sem tenant;
- rejeicao de acesso a entidade ou perfil de outro tenant.

Todos os exemplos usam usuarios e tenants ficticios.
