# Anexos operacionais

## Objetivo

O SolverFin permite anexar arquivos privados a jornadas financeiras já existentes sem transformar o arquivo em fonte de autorização nem criar um repositório documental paralelo.

O primeiro recorte cobre:

- lançamentos (`transaction`);
- faturas (`invoice`);
- lotes de importação (`import_batch`).

O vínculo técnico `ai_suggestion` permanece compatível no repositório, mas não é exposto como jornada pública de upload nesta fase.

## Tipos funcionais

Os tipos aceitos são:

- `receipt` — comprovante ou recibo;
- `invoice` — fatura;
- `statement` — extrato;
- `message` — mensagem;
- `contract` — contrato;
- `other` — outro documento permitido.

## Contrato de upload

Endpoint:

```http
POST /api/attachments?profileId=<perfil>
Content-Type: application/json
```

Payload:

```json
{
  "kind": "receipt",
  "fileName": "comprovante.pdf",
  "mimeType": "application/pdf",
  "linkedEntityKind": "transaction",
  "linkedEntityId": "uuid",
  "contentBase64": "..."
}
```

Regras:

- limite de **5 MiB por arquivo**;
- a requisição JSON tem limite maior apenas para acomodar o overhead de Base64;
- arquivos vazios são rejeitados;
- MIME deve pertencer à allowlist;
- extensão, quando presente, deve ser compatível com o MIME;
- PDF, PNG, JPEG, WEBP, XLS e contêineres ZIP usados por XLSX/DOCX recebem validação de assinatura mínima;
- o nome é normalizado e reduzido ao basename, removendo traversal, caracteres de controle e caracteres inseguros;
- o backend calcula SHA-256 do conteúdo;
- retries idênticos para mesma entidade, tipo funcional, MIME e hash reutilizam o anexo ativo já persistido.

MIME aceitos no primeiro recorte:

- `application/pdf`;
- `image/jpeg`;
- `image/png`;
- `image/webp`;
- `text/plain`;
- `text/csv`;
- `application/vnd.ms-excel`;
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.

## Listagem, abertura e exclusão

Listar anexos ativos de uma entidade:

```http
GET /api/attachments?linkedEntityKind=transaction&linkedEntityId=<uuid>&profileId=<perfil>
```

Abrir conteúdo:

```http
GET /api/attachments/<attachmentId>/content?profileId=<perfil>
```

Excluir logicamente:

```http
DELETE /api/attachments/<attachmentId>?profileId=<perfil>
```

A exclusão é idempotente. Anexos `deleted` ou `redacted` não aparecem em listagens operacionais nem podem ser abertos.

## Autorização e isolamento

A autorização nunca é derivada de `attachmentId`, URL, nome do arquivo ou `storageKey`.

Em toda criação, listagem, abertura ou exclusão, o backend:

1. resolve usuário e perfil financeiro autenticados;
2. valida organização e perfil do anexo;
3. revalida a entidade financeira vinculada no mesmo contexto;
4. só então permite a operação.

Uma entidade pertencente a outro perfil retorna ausência controlada e não revela se o recurso existe fora do contexto autorizado.

## Armazenamento privado e convergência

O conteúdo binário é armazenado em `AttachmentObject`, separado dos metadados de `Attachment`, usando uma chave opaca interna. O primeiro recorte usa PostgreSQL `BYTEA` porque o limite é pequeno e isso permite que conteúdo e metadados participem da mesma transação.

Para novos uploads:

- objeto e metadado são criados na mesma transação;
- falha em qualquer etapa reverte ambos;
- `storageKey` não é retornado pela API pública;
- não existe URL pública ou permanente para o objeto;
- abertura sempre passa pelo endpoint autenticado;
- respostas de conteúdo usam `Cache-Control: private, no-store` e `X-Content-Type-Options: nosniff`.

Registros legados que tenham metadados sem conteúdo privado associado permanecem compatíveis, mas a abertura falha de forma controlada em vez de produzir referência quebrada silenciosa.

## Privacidade e auditoria

A trilha de auditoria registra a mutação do recurso `attachment` com identificador e ação genérica.

Não devem ser registrados em logs ou auditoria:

- conteúdo binário/Base64;
- `storageKey`;
- hash do conteúdo;
- nome original sensível do arquivo;
- URL de abertura.

A API de listagem retorna apenas os metadados necessários à experiência: id, tipo funcional, status, nome sanitizado, MIME, tamanho, vínculo e timestamps.

## Retenção e remoção

Neste recorte, `DELETE` realiza exclusão lógica para preservar rastreabilidade e permitir política de retenção futura. Purga física automática não faz parte da Issue #691.

A eventual política de retenção/purga deve ser implementada por issue própria e não pode tornar um anexo logicamente excluído novamente acessível.

## Operação

Em caso de erro:

- `400`: payload, nome, MIME, extensão ou assinatura inválidos;
- `404`: anexo ou entidade vinculada indisponível no perfil atual;
- `409`: conteúdo legado ausente ou falha de integridade;
- `413`: arquivo ou corpo da requisição acima do limite;
- `401/403`: sessão ou contexto não autorizado, conforme contrato global de autenticação.

A investigação operacional deve usar `correlationId` e códigos de erro. Não registrar o arquivo ou chaves privadas para diagnóstico.
