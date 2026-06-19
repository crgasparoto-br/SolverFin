# Identidade, perfil financeiro e tenant

## Objetivo

O modelo inicial de tenant do SolverFin separa os contextos financeiros de um
usuario para evitar mistura de dados pessoais, familiares, MEI e de pequenos
negocios.

O contrato fica no pacote de dominio em `packages/domain/src/tenant.ts` e agora
tambem possui fluxo operacional minimo na API para listar, criar, editar,
arquivar e selecionar perfis financeiros.

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

Quando um usuario autenticado ainda nao possui organizacao, a criacao do
primeiro perfil financeiro cria tambem uma organizacao minima de propriedade
desse usuario. Esse caso prepara o fluxo produtivo futuro em que o usuario pode
ser criado a partir de um provider externo antes de existir perfil financeiro.

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

Perfis podem estar `active` ou `archived`. Perfis arquivados continuam
rastreaveis, mas nao podem ser selecionados como contexto ativo para operacoes
financeiras.

## API operacional de perfis

As rotas de perfis financeiros exigem sessao autenticada, mas nao exigem que o
usuario ja tenha um perfil ativo. Isso permite resolver o estado inicial sem
perfil.

```http
GET /api/financial-profiles
POST /api/financial-profiles
PATCH /api/financial-profiles/:profileId
POST /api/financial-profiles/:profileId/archive
```

`GET /api/financial-profiles` retorna perfis do usuario autenticado e um
`activeProfileId` sugerido. O perfil ativo sugerido respeita `profileId` quando o
parametro aponta para um perfil ativo do proprio usuario; caso contrario, usa o
perfil pessoal ativo ou o primeiro perfil ativo.

`POST /api/financial-profiles` recebe:

```json
{
  "name": "Família",
  "kind": "family"
}
```

`PATCH /api/financial-profiles/:profileId` permite alterar `name` e `kind` de um
perfil pertencente ao usuario autenticado.

`POST /api/financial-profiles/:profileId/archive` arquiva um perfil do usuario,
mas bloqueia o arquivamento do ultimo perfil ativo para evitar deixar o usuario
sem contexto operacional por acidente.

## Contexto ativo

Rotas, services e repositories que operam dados financeiros devem resolver um
`TenantContext` antes de consultar ou gravar dados.

Quando o usuario tem apenas um perfil ativo, esse perfil pode ser usado como
contexto ativo inicial. Quando houver mais de um perfil ativo, o cliente deve
enviar o perfil desejado explicitamente pelo parametro `profileId` nas rotas
financeiras.

Exemplo:

```http
GET /api/accounts?profileId=33333333-3333-4333-8333-333333333332
```

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
as rotas financeiras retornam erro controlado `TENANT_PROFILE_REQUIRED`. O
cliente deve direcionar o fluxo para `GET /api/financial-profiles` e, se a lista
estiver vazia, permitir `POST /api/financial-profiles` antes de qualquer operacao
financeira.

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
- decisao definitiva sobre organizacao familiar com varios usuarios;
- persistencia de preferencia de perfil ativo em sessao propria produtiva.

Esses pontos devem ser tratados em issues ou ADRs futuras.

## Testes

O pacote `@solverfin/domain` cobre:

- criacao de organizacao;
- criacao de perfil financeiro;
- resolucao de contexto ativo;
- exigencia de selecao explicita quando ha multiplos perfis;
- rejeicao de entidade financeira sem tenant;
- rejeicao de acesso a entidade ou perfil de outro tenant.

A suite de integracao da API cobre:

- listagem de perfis autenticados;
- criacao de perfil adicional;
- selecao explicita por `profileId` sem misturar dados do seed;
- bloqueio de acesso a perfil inexistente ou de outro usuario;
- edicao e arquivamento de perfil.

Todos os exemplos usam usuarios e tenants ficticios.