# ADR 0017 - Armazenamento privado transacional para anexos operacionais

- Status: Aceito
- Data: 2026-10-02
- Issue: #691

## Contexto

O domínio já possuía `Attachment` com vínculo por organização, perfil financeiro e entidade, mas ainda não existia uma implementação operacional para armazenar e abrir o conteúdo anexado.

A primeira entrega precisa suportar arquivos de até 5 MiB em lançamentos, faturas e lotes de importação, preservar isolamento por tenant/perfil, impedir URLs públicas permanentes e evitar estados parciais em que metadado e conteúdo divergem.

## Decisão

O primeiro recorte usa duas responsabilidades persistidas:

- `Attachment` mantém os metadados de negócio, estado e vínculo;
- `AttachmentObject` mantém o conteúdo binário privado, tamanho e SHA-256 por `storageKey` opaco.

`AttachmentObject.content` usa PostgreSQL `BYTEA`.

A criação do objeto e do metadado ocorre na mesma transação de banco. O `storageKey` é detalhe interno e não participa do contrato público.

A abertura é feita exclusivamente por endpoint autenticado que revalida organização, perfil e entidade vinculada. Não são emitidas URLs públicas ou permanentes.

A exclusão inicial é lógica em `Attachment`; purga física e retenção automatizada ficam para decisão posterior.

## Motivos

Para o limite de 5 MiB, o armazenamento no mesmo banco permite:

- atomicidade entre binário e metadado;
- rollback sem mecanismo de compensação externo;
- isolamento operacional igual ao restante do domínio;
- nenhuma dependência de bucket, credenciais ou URL assinada nesta fase;
- migração posterior para object storage sem alterar o modelo de autorização ou o contrato público.

## Consequências

### Positivas

- upload não deixa referência ativa sem conteúdo após falha parcial;
- acesso permanece centralizado na API autenticada;
- backup do banco inclui o primeiro recorte de anexos;
- testes de isolamento podem usar a mesma infraestrutura PostgreSQL da API.

### Custos e limites

- binários aumentam volume, I/O e backup do PostgreSQL;
- este desenho não é indicado para arquivos grandes ou alto volume documental;
- varredura antimalware dedicada não é introduzida nesta issue; a fronteira atual reduz risco por allowlist, tamanho, extensão, assinatura mínima e download como anexo;
- retenção/purga física ainda precisa de política própria.

## Evolução futura

Quando volume, tamanho ou custo justificarem object storage:

1. manter `Attachment` e o contrato de autorização;
2. substituir a implementação privada atrás da chave opaca;
3. usar upload temporário + promoção/compensação ou outro protocolo que preserve convergência;
4. continuar sem expor `storageKey` como credencial;
5. preservar endpoint autenticado ou URLs assinadas curtas emitidas somente após autorização, caso uma ADR futura aprove esse modelo.

A migração não deve transformar URLs ou identificadores internos em fonte de autorização.
