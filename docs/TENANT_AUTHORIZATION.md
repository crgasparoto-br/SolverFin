# Isolamento e autorizacao por tenant

## Objetivo

Este documento define o padrao inicial para impedir acesso cruzado entre
usuarios, organizacoes e perfis financeiros no SolverFin.

Enquanto a API HTTP e repositories reais ainda nao existem, o contrato de
isolamento fica em `packages/domain/src/tenant-authorization.ts`.

## Regra central

Toda operacao financeira deve partir de um `TenantContext` resolvido no servidor.
Dados financeiros nao podem confiar em `organizationId` ou `financialProfileId`
recebidos do cliente sem validacao.

O contexto ativo deve vir da sessao autenticada e do perfil financeiro escolhido
ou unico do usuario.

## Leitura por ID

Para leitura direta por ID, use:

```ts
getTenantScopedResource(context, entity);
```

Se a entidade nao existir ou pertencer a outro tenant, o retorno deve ser
tratado como:

```text
404 TENANT_RESOURCE_NOT_FOUND
```

O SolverFin usa 404 neste caso para nao revelar se um recurso financeiro existe
em outro tenant.

## Listagens

Listagens devem filtrar sempre pelo contexto ativo:

```ts
listTenantScopedResources(context, entities);
```

Repositories futuros devem aplicar `organizationId` e `financialProfileId` na
consulta ao banco, nao apenas filtrar depois em memoria. O helper do dominio
existe para testar e padronizar o comportamento esperado.

## Criacao

Criacao de entidade financeira deve aplicar o contexto ativo no servidor:

```ts
applyTenantScope(context, payload);
```

Se o cliente enviar `organizationId` ou `financialProfileId` no payload, esses
valores nao devem trocar o tenant da operacao. O servidor deve sobrescrever pelo
contexto ativo ou rejeitar payload manipulado quando a rota exigir validacao
estrita.

## Atualizacao e exclusao

Para atualizacao:

```ts
updateTenantScopedResource(context, entity, payload);
```

Para exclusao logica ou operacao equivalente:

```ts
deleteTenantScopedResource(context, entity);
```

Atualizacao com payload tentando trocar tenant deve retornar:

```text
403 TENANT_PAYLOAD_SCOPE_FORBIDDEN
```

Atualizacao ou exclusao de recurso de outro tenant deve retornar:

```text
404 TENANT_RESOURCE_NOT_FOUND
```

## Padrao 404 versus 403

Use 404 quando o risco for revelar existencia de recurso financeiro por ID direto
ou operacao sobre entidade de outro tenant.

Use 403 quando a requisicao atual tenta manipular explicitamente o tenant no
payload, porque o problema esta no pedido recebido, nao na existencia do recurso.

## Testes obrigatorios para novas rotas

Toda nova rota/repository financeiro deve ter testes com pelo menos dois tenants
ficticios cobrindo:

- usuario A nao le recurso do usuario B por ID;
- listagem retorna apenas dados do contexto ativo;
- criacao aplica tenant do contexto ativo;
- atualizacao rejeita payload tentando trocar tenant;
- exclusao ou arquivamento nao opera recurso de outro tenant.

Nenhum teste deve usar dados reais ou identificaveis.
