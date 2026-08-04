# Inbox de mensagens bancarias

## Objetivo

A Inbox recebe textos de mensagens bancarias ficticias ou autorizadas, minimiza o conteudo e cria uma sugestao revisavel somente quando os campos financeiros obrigatorios podem ser representados em payload estruturado. O fluxo nunca cria lancamento final durante a recepcao da mensagem.

## Contrato de entrada

`POST /api/bank-message-inbox`

Campos aceitos:

- `text`: texto colado ou compartilhado;
- `origin`: `pasted` ou `shared`; quando omitido pela tela inicial, usa `pasted`;
- `consentAccepted`: deve ser `true` antes de qualquer processamento;
- `accountId`: opcional, usado como conta proposta;
- `categoryId`: opcional, usado como categoria proposta.

A API exige sessao, organizacao e perfil financeiro resolvidos pelo tenant atual.

## Retencao e minimizacao

O texto bruto existe apenas durante a requisicao para normalizacao, mascaramento e hash. Ele nao e persistido.

Persistimos:

- `ImportBatch` com `sourceKind = BANK_MESSAGE`, status operacional e `sourceHash`;
- `AiSuggestion` somente quando existe valor positivo estruturavel, com `kind = TRANSACTION_EXTRACTION`, status `PENDING_REVIEW` e payload canonico V2;
- auditoria redigida para lote e, quando criada, para sugestao.

O payload registra origem `bank_message`, fingerprint, alvo, confianca, motivos, auditoria, data, tipo, direcao, valor, moeda, descricao mascarada e IDs opcionais propostos, que sao revalidados antes de qualquer efeito financeiro. A explicacao e apenas apresentacional e nunca contem valor, conta ou categoria como fonte de decisao.

## Mensagens incompletas

Quando nao ha valor estruturavel, o lote continua registrado para acompanhamento, mas nenhuma `AiSuggestion` e criada. O sistema nao inventa valor, nao tenta recuperar campos da explicacao e nao produz efeito financeiro. Uma evolucao futura da Inbox podera oferecer complementacao explicita antes da criacao da sugestao.

## Revisao

Uma sugestao completa fica pendente de revisao. A aprovacao usa exclusivamente `AiSuggestion.payload`; `explanation` e o texto mascarado exibido nao sao analisados para reconstruir data, valor, conta, categoria ou tipo.

Sugestao com payload ausente, invalido ou incompatível falha de forma controlada antes de criar lancamento.

## Endpoints

- `GET /api/bank-message-inbox?status=all`: lista mensagens do perfil financeiro ativo;
- `POST /api/bank-message-inbox`: registra mensagem com consentimento explicito;
- `POST /api/bank-message-inbox/:messageId/discard`: descarta o lote e expira sugestao pendente quando aplicavel.

## Tela inicial

A rota `/inbox` permite colar uma mensagem, confirmar consentimento e selecionar conta/categoria opcionais. A lista mostra status, origem, data, confianca e explicacao mascarada quando existe sugestao.

## Relacao com o dominio

`packages/domain/src/bank-message-inbox.ts` normaliza texto, gera hash contextual, detecta duplicidade e mascara conteudo. `@solverfin/domain/ai-suggestion-payloads` valida o payload persistente. A camada de API descarta o texto bruto depois de criar o lote e, quando possivel, a sugestao estruturada.
