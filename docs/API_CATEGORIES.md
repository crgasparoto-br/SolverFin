# API de categorias e subcategorias

## Objetivo

Este contrato descreve a API inicial de categorias do SolverFin. Como o
framework HTTP ainda nao foi escolhido por ADR, a regra executavel fica no
servico de dominio `packages/domain/src/categories.ts`.

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

## Sugestoes padrao

`getDefaultCategorySuggestions` retorna sugestoes ficticias e editaveis para
criar a taxonomia inicial do perfil financeiro.

As sugestoes devem ser copiadas para o tenant/perfil quando usadas. O usuario
pode editar, arquivar ou substituir depois.

## Tenant

Toda operacao deve receber um `TenantContext` resolvido no servidor.

Leitura, edicao, arquivamento, restauracao ou substituicao de categoria de outro
tenant devem retornar:

```text
404 TENANT_RESOURCE_NOT_FOUND
```

## Endpoints HTTP pretendidos

Quando a API HTTP existir, os endpoints devem seguir este comportamento:

```http
GET /categories
GET /categories/:categoryId
POST /categories
PATCH /categories/:categoryId
POST /categories/:categoryId/archive
POST /categories/:categoryId/restore
POST /categories/:categoryId/replace
```

### GET /categories

Lista categorias do contexto ativo.

Filtros opcionais:

```text
status=active|archived|all
kind=income|expense|transfer
parentCategoryId=<id|null>
```

Sem filtro, retorna apenas categorias `active`.

### POST /categories

Payload:

```json
{
  "name": "Alimentacao",
  "kind": "expense",
  "parentCategoryId": null
}
```

Subcategorias devem ter o mesmo `kind` da categoria pai.

### PATCH /categories/:categoryId

Permite alterar nome, tipo, status e categoria pai quando as validacoes forem
atendidas.

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

## Validacao de tipo

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

## Erros de validacao

Erros controlados do contrato de dominio:

```text
400 CATEGORY_NAME_REQUIRED
400 CATEGORY_KIND_REQUIRED
400 CATEGORY_KIND_INVALID
400 CATEGORY_PARENT_INVALID
400 CATEGORY_PARENT_KIND_MISMATCH
400 CATEGORY_REPLACEMENT_REQUIRED
400 CATEGORY_REPLACEMENT_INVALID
400 CATEGORY_TRANSACTION_KIND_INVALID
404 TENANT_RESOURCE_NOT_FOUND
403 TENANT_PAYLOAD_SCOPE_FORBIDDEN
```

## Testes

O pacote `@solverfin/domain` cobre:

- sugestoes padrao editaveis;
- criacao e edicao;
- subcategoria;
- arquivamento e restauracao;
- substituicao de categoria com historico;
- categoria em uso sem substituicao valida;
- acesso indevido por outro tenant;
- validacao de tipo de categoria versus tipo de lancamento.

Todos os exemplos usam categorias ficticias.
