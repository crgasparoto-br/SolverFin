# API de contas financeiras

## Objetivo

Este contrato descreve a API de contas financeiras do SolverFin. A regra executável fica no serviço de domínio `packages/domain/src/accounts.ts`, e a API HTTP deve chamar esse contrato para manter validação, tenant e respostas consistentes.

## Modelo

Conta financeira representa carteira, conta corrente, poupança, investimento ou outro tipo simples usado pelo MVP.

Campos principais:

- `id`;
- `organizationId`;
- `financialProfileId`;
- `name`;
- `kind`;
- `status`;
- `currency`;
- `openingBalanceMinor`;
- `agencyIdentifier` opcional, para a agência;
- `accountIdentifier` opcional, para o número/identificador da conta;
- `maskedIdentifier` opcional e mantido apenas para leitura de cadastros legados;
- `institutionKey` opcional;
- `createdAt` e `updatedAt`;
- `createdByUserId` e `updatedByUserId`.

`agencyIdentifier` e `accountIdentifier` são tratados de forma independente. Quando informados, ambos são normalizados com `trim`; string vazia representa ausência do valor. O servidor não concatena esses campos em `maskedIdentifier`.

Cadastros históricos que possuam somente `maskedIdentifier` continuam legíveis. O sistema não tenta separar automaticamente agência e conta a partir do texto legado, porque o formato histórico pode ser ambíguo. `maskedIdentifier` não faz parte dos payloads graváveis de criação ou atualização de contas.

Tipos iniciais aceitos:

```text
checking
savings
cash
investment
other
```

Conta profissional é representada pelo perfil financeiro ativo, por exemplo um perfil `mei` ou `business`, e não por um tipo separado de conta nesta etapa.

## Tenant

Toda operação deve receber um `TenantContext` resolvido no servidor.

O cliente não deve escolher `organizationId` ou `financialProfileId` para criar contas. O servidor aplica o contexto ativo com `applyTenantScope`.

Leitura, edição e arquivamento de conta de outro tenant devem retornar:

```text
404 TENANT_RESOURCE_NOT_FOUND
```

## Endpoints HTTP

```http
GET /api/accounts
GET /api/accounts/:accountId
POST /api/accounts
PATCH /api/accounts/:accountId
POST /api/accounts/:accountId/archive
DELETE /api/accounts/:accountId
```

### GET /api/accounts

Lista contas do contexto ativo.

Filtro opcional:

```text
status=active|archived|all
```

Sem filtro, retorna apenas contas `active`.

### GET /api/accounts/:accountId

Retorna uma conta do contexto ativo. Conta inexistente ou de outro tenant deve ser tratada como 404.

### POST /api/accounts

Payload de exemplo com dados fictícios:

```json
{
  "name": "Conta Principal",
  "kind": "checking",
  "openingBalanceMinor": 0,
  "currency": "BRL",
  "agencyIdentifier": "0001",
  "accountIdentifier": "12345-6"
}
```

Campos obrigatórios:

- `name`;
- `kind`.

Campos opcionais:

- `openingBalanceMinor`;
- `currency`;
- `agencyIdentifier`;
- `accountIdentifier`;
- `institutionKey`.

`maskedIdentifier` não é aceito como campo gravável. Quando enviado por um cliente antigo, ele não é mapeado para o payload de domínio nem altera o valor legado persistido.

Padrões:

- `status`: `active`;
- `currency`: `BRL`;
- `openingBalanceMinor`: `0`.

### PATCH /api/accounts/:accountId

Permite atualizar nome, tipo, status, moeda, agência, conta, instituição e saldo inicial. `agencyIdentifier` e `accountIdentifier` podem ser alterados ou removidos independentemente. `maskedIdentifier` permanece somente leitura; atualizações de outros campos preservam o valor legado existente.

Quando a conta já possui movimentações, `currency` passa a fazer parte da identidade monetária histórica da conta:

- se `currency` for omitida, a moeda persistida é mantida;
- se repetir a mesma moeda, inclusive com normalização de caixa, a atualização é idempotente;
- uma mudança real de moeda é rejeitada, porque reinterpretaria o saldo inicial e os lançamentos já vinculados sem contrato de conversão cambial;
- a alteração deve ser feita antes de existirem movimentações; o sistema não converte valores nem reescreve lançamentos implicitamente.

Uma mudança real de moeda em conta já utilizada retorna:

```text
400 ACCOUNT_CURRENCY_LOCKED
```

A persistência também protege essa relação: uma atualização SQL direta de `Account.currency`, `organizationId` ou `financialProfileId` que torne incompatível qualquer `Transaction` de origem ou destino é rejeitada com `TRANSACTION_CURRENCY_MISMATCH`.

Quando a conta já possui movimentações, o campo `openingBalanceMinor` é idempotente:

- se for omitido, o saldo inicial persistido é mantido;
- se repetir exatamente o valor persistido, a atualização é aceita;
- se for informado com valor inválido, retorna `ACCOUNT_OPENING_BALANCE_INVALID`;
- somente uma mudança real do valor retorna:

```text
400 ACCOUNT_OPENING_BALANCE_LOCKED
```

Uma conta com remuneração CDI ativa deve permanecer ativa e em `BRL`. Antes de alterar a moeda para outra divisa ou mudar o status para arquivado, a remuneração deve ser desativada por sua API dedicada. Caso contrário, retorna:

```text
409 ACCOUNT_REMUNERATION_MUST_BE_DISABLED
```

### POST /api/accounts/:accountId/archive

Arquiva a conta. O arquivamento retorna `409 ACCOUNT_REMUNERATION_MUST_BE_DISABLED` quando a conta ainda possui configuração CDI ativa.

### DELETE /api/accounts/:accountId

Exclui apenas contas sem uso ou vínculos financeiros. Contas já utilizadas devem ser arquivadas.

## Privacidade dos identificadores

Agência e conta são dados financeiros sensíveis. A listagem deve exibir apenas uma forma minimizada suficiente para reconhecimento, por exemplo os últimos caracteres. Quando um identificador for curto demais para permitir exibição parcial, ele não deve aparecer na listagem nem em `data-search`. O valor completo pode aparecer no formulário de edição, onde é necessário para corrigir o cadastro.

Na apresentação, `agencyIdentifier` e `accountIdentifier` têm precedência sempre que pelo menos um deles existir. Nesse caso, `maskedIdentifier` não deve ser exibido nem usado no índice textual da listagem. Quando ambos os campos estruturados estiverem ausentes, um `maskedIdentifier` legado já minimizado permanece como fallback reconhecível na listagem e na busca, sem parsing, concatenação ou tentativa de derivar os novos campos.

Logs, fixtures, testes e documentação não devem conter identificadores financeiros reais.

## Erros de validação

Erros controlados do contrato de domínio:

```text
400 ACCOUNT_NAME_REQUIRED
400 ACCOUNT_KIND_REQUIRED
400 ACCOUNT_KIND_INVALID
400 ACCOUNT_CURRENCY_INVALID
400 ACCOUNT_CURRENCY_LOCKED
400 ACCOUNT_OPENING_BALANCE_INVALID
400 ACCOUNT_OPENING_BALANCE_LOCKED
400 ACCOUNT_AGENCY_IDENTIFIER_INVALID
400 ACCOUNT_IDENTIFIER_INVALID
400 ACCOUNT_INSTITUTION_KEY_INVALID
409 ACCOUNT_REMUNERATION_MUST_BE_DISABLED
404 TENANT_RESOURCE_NOT_FOUND
403 TENANT_PAYLOAD_SCOPE_FORBIDDEN
```

Mensagens de erro devem ser claras para o usuário final e não devem expor dados financeiros sensíveis.

## Testes

O pacote `@solverfin/domain` e a integração da API cobrem:

- criação de conta;
- separação, normalização e remoção independente de agência e conta;
- compatibilidade de leitura com `maskedIdentifier` legado sem parsing heurístico;
- precedência dos campos estruturados em registros híbridos e fallback legado somente quando ambos estiverem ausentes;
- bloqueio de escrita de `maskedIdentifier` nos payloads de criação e atualização;
- preservação do identificador legado em atualizações não relacionadas;
- minimização de identificadores em listagem e busca, inclusive para valores curtos;
- validação de nome, moeda e identificadores;
- listagem filtrada por tenant e status;
- edição e arquivamento de conta;
- bloqueio de acesso a conta de outro tenant;
- atualização idempotente da moeda quando há movimentações e bloqueio de mudança real;
- rejeição também na persistência de mudança direta que rompa a relação monetária com lançamentos existentes;
- atualização idempotente do saldo inicial quando há movimentações;
- bloqueio de mudança real do saldo inicial quando há movimentações;
- bloqueio de moeda e arquivamento enquanto a remuneração CDI estiver ativa.

Todos os exemplos usam dados fictícios.
