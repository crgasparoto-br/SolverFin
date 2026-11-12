# API de categorias e subcategorias

## Objetivo

Este contrato descreve a API inicial de categorias do SolverFin. Como o
framework HTTP ainda nao foi escolhido por ADR, a regra executavel fica no
servico de dominio `packages/domain/src/categories.ts` e na API persistida em
`apps/api/src/repositories/categories.ts`.

Categorias padrao sao sugestoes iniciais editaveis. Elas nao devem virar uma
taxonomia fixa ou imutavel.

## Modelo

Campos principais de categoria:

- `id`;
- `organizationId`;
- `financialProfileId`;
- `name`;
- `kind`;
- `status`;
- `parentCategoryId` opcional;
- `createdAt` e `updatedAt`;
- `createdByUserId` e `updatedByUserId`.

Tipos aceitos:

```text
income
expense
transfer
```

Origem da classificacao no contrato atual:

```text
system_default
user_created
ai_suggested
imported
```

O modelo persistido atual ainda nao grava origem, icone, cor ou ordem. Esses
campos devem entrar em migration futura antes de serem expostos como estado
persistente.

## Hierarquia

Uma categoria pode apontar para uma categoria superior por `parentCategoryId`.
Categorias sem pai sao categorias principais; categorias com pai sao categorias
detalhadas. O modelo suporta mais niveis para evolucao futura, embora a primeira
experiencia visual possa limitar a navegacao a principal e detalhada.

Regras aplicadas pelo dominio:

- a categoria pai deve existir no mesmo tenant/perfil financeiro;
- a categoria filha deve ter o mesmo `kind` da categoria pai;
- a hierarquia nao pode formar ciclos, por exemplo `Moradia > Agua > Moradia`;
- `parentCategoryId: null` remove explicitamente o vinculo com a categoria pai;
- categorias arquivadas continuam disponiveis para historico e relatorios antigos, mas nao entram nas listagens ativas por padrao.

## Sugestoes padrao

`getDefaultCategorySuggestions` retorna sugestoes ficticias, hierarquicas e
editaveis para criar a taxonomia inicial do perfil financeiro. Cada sugestao
pode informar `parentName` para indicar a categoria principal sugerida.

As sugestoes devem ser copiadas para o tenant/perfil quando usadas. O usuario
pode editar, arquivar ou substituir depois.

## Tenant

Toda operacao deve receber um `TenantContext` resolvido no servidor.

Leitura, edicao, arquivamento, restauracao ou substituicao de categoria de outro
tenant devem retornar:

```text
404 TENANT_RESOURCE_NOT_FOUND
```

## Endpoints HTTP

```http
GET /api/categories
GET /api/categories/:categoryId
POST /api/categories
PATCH /api/categories/:categoryId
POST /api/categories/:categoryId/archive
POST /api/categories/:categoryId/restore
```

### GET /api/categories

Lista categorias do contexto ativo.

Filtros opcionais:

```text
status=active|archived|all
kind=income|expense|transfer
parentCategoryId=<id|null>
```

Sem filtro, retorna apenas categorias `active`.

### POST /api/categories

Payload:

```json
{
  "name": "Agua",
  "kind": "expense",
  "parentCategoryId": "id-da-categoria-moradia"
}
```

Subcategorias devem ter o mesmo `kind` da categoria pai.

### PATCH /api/categories/:categoryId

Permite alterar nome, tipo, status e categoria pai quando as validacoes forem
atendidas. Para transformar uma categoria detalhada em categoria principal, envie:

```json
{
  "parentCategoryId": null
}
```

### Arquivar e restaurar

Arquivar preserva historico e deve ser preferido a hard delete. Categoria
arquivada nao aparece por padrao em listagens, mas continua disponivel para
relatorios antigos.

### Substituir categoria

Categoria em uso deve ser substituida por outra categoria do mesmo tenant e do
mesmo tipo. A categoria antiga e arquivada, e a API retorna a categoria de
substituicao para que camadas futuras decidam se novos lancamentos ou historico
serao reclassificados.

Reclassificacao em massa automatica fica fora desta issue.

## Lancamentos e relatorios

Categoria usada em lancamento deve ser compativel com o tipo do lancamento:

```text
income -> income
expense -> expense
transfer -> transfer
```

Incompatibilidade deve retornar:

```text
400 CATEGORY_TRANSACTION_KIND_INVALID
```

Nos relatorios web, o filtro por categoria principal inclui automaticamente as
categorias filhas do dataset carregado. O gasto por categoria tambem consolida
valores no grupo principal e disponibiliza `childCategories` para detalhamento.

## Erros de validacao

Erros controlados do contrato de dominio:

```text
400 CATEGORY_NAME_REQUIRED
400 CATEGORY_KIND_REQUIRED
400 CATEGORY_KIND_INVALID
400 CATEGORY_PARENT_INVALID
400 CATEGORY_PARENT_KIND_MISMATCH
400 CATEGORY_PARENT_CYCLE
400 CATEGORY_REPLACEMENT_REQUIRED
400 CATEGORY_REPLACEMENT_INVALID
400 CATEGORY_TRANSACTION_KIND_INVALID
404 TENANT_RESOURCE_NOT_FOUND
403 TENANT_PAYLOAD_SCOPE_FORBIDDEN
```

## Testes

O pacote `@solverfin/domain` cobre:

- sugestoes padrao editaveis e hierarquicas;
- criacao e edicao;
- subcategoria;
- impedimento de tipo diferente do pai;
- impedimento de ciclos na hierarquia;
- remocao explicita da categoria superior;
- arquivamento e restauracao;
- substituicao de categoria com historico;
- categoria em uso sem substituicao valida;
- acesso indevido por outro tenant;
- validacao de tipo de categoria versus tipo de lancamento.

Todos os exemplos usam categorias ficticias.
