# Identidade, perfil financeiro e tenant

## Objetivo

O modelo inicial de tenant do SolverFin separa os contextos financeiros de um
usuario para evitar mistura de dados pessoais, familiares, MEI e de pequenos
negocios.

Enquanto a experiencia operacional completa de perfis financeiros evolui, o
contrato fica no pacote de dominio em `packages/domain/src/tenant.ts`.

A autenticacao produtiva definitiva esta definida na ADR
`docs/adr/0004-autenticacao-produtiva.md`: a identidade primaria de usuarios
reais deve vir de provider gerenciado compativel com OIDC/OAuth2, enquanto
organizacoes, perfis financeiros e permissoes operacionais continuam sob
controle do SolverFin.

## Conceitos

### Usuario

Representa a identidade autenticada dentro do SolverFin. Em producao, o usuario
local deve ser vinculado ao identificador externo do provider de identidade.
Apenas usuarios ativos podem criar organizacoes, perfis financeiros ou resolver
contexto de tenant.

O usuario local nao deve ser tratado como fonte primaria de senha produtiva. Ele
e o espelho operacional usado para tenant, auditoria, preferencias e permissoes
do produto.

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
enviar o perfil desejado explicitamente ou usar uma preferencia persistida segura
quando essa experiencia existir.

A identidade externa autenticada pelo provider nao substitui `organizationId` ou
`financialProfileId`. Depois do login produtivo, a API ainda precisa resolver o
usuario local, organizacao e perfil financeiro antes de permitir operacoes
financeiras.

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

Em producao, esse estado pode ocorrer apos o primeiro login pelo provider
externo. O mapeamento de usuario deve ser idempotente e o fluxo deve criar ou
selecionar perfil antes de qualquer operacao financeira.

## Auditoria de identidade e tenant

A implementacao produtiva deve auditar eventos relevantes sem registrar tokens,
senhas ou respostas sensiveis do provider. Eventos esperados incluem:

- primeiro vinculo entre identidade externa e usuario local;
- login e logout;
- revogacao de sessao;
- usuario desabilitado;
- troca de perfil financeiro ativo;
- tentativa de acesso a perfil nao autorizado.

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
