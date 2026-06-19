# Inbox de mensagens bancarias

## Objetivo

O inbox recebe textos de mensagens bancarias ficticias ou autorizadas e transforma o conteudo em uma sugestao revisavel. O fluxo nao cria lancamento financeiro final automaticamente.

## Contrato de entrada

`POST /api/bank-message-inbox`

Campos aceitos:

- `text`: texto colado ou compartilhado.
- `origin`: `pasted` ou `shared`; quando omitido pela tela inicial, usa `pasted`.
- `consentAccepted`: deve ser `true` antes de qualquer processamento.
- `accountId`: opcional, usado para deixar a sugestao mais pronta para revisao.
- `categoryId`: opcional, usado como categoria inicial da sugestao.

A API exige sessao, organizacao e perfil financeiro resolvidos pelo tenant atual.

## Retencao e minimizacao

O texto bruto e usado apenas durante a requisicao para normalizacao, mascaramento e calculo de hash. Ele nao e persistido no banco.

Persistimos somente:

- `ImportBatch` com `sourceKind = BANK_MESSAGE`, status operacional e `sourceHash` para deduplicacao.
- `AiSuggestion` com `kind = TRANSACTION_EXTRACTION`, status `PENDING_REVIEW`, explicacao segura e metadados do parser deterministico.
- auditoria redigida para lote e sugestao.

A explicacao e o resumo exibido usam texto mascarado e nao devem conter mensagem bancaria integral.

## Revisao

A sugestao criada fica pendente de revisao. Quando a mensagem inclui valor e a pessoa seleciona uma conta, a explicacao segue o formato ja entendido pela fila de revisao de IA para permitir aprovacao posterior. Ainda assim, o lancamento final so nasce quando a pessoa aprovar a sugestao.

Mensagens incompletas ou incertas continuam como sugestoes de baixa confianca e precisam ser completadas na revisao antes de qualquer efeito financeiro.

## Endpoints

- `GET /api/bank-message-inbox?status=all`: lista mensagens do perfil financeiro ativo.
- `POST /api/bank-message-inbox`: registra mensagem com consentimento explicito.
- `POST /api/bank-message-inbox/:messageId/discard`: descarta o lote e expira sugestao pendente quando aplicavel.

## Tela inicial

A rota `/inbox` permite colar uma mensagem, confirmar consentimento e selecionar conta/categoria opcionais. A lista mostra status de revisao, origem, data, confianca e explicacao mascarada.

## Relacao com o contrato de dominio

`packages/domain/src/bank-message-inbox.ts` continua sendo a base para normalizar texto, gerar hash por tenant/perfil, detectar duplicidade e mascarar conteudo. A camada de API usa esse contrato, mas descarta o texto bruto apos criar o lote e a sugestao revisavel.
