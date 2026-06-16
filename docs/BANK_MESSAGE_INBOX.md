# Inbox de mensagens bancarias

Este documento registra o escopo entregue para a issue #46: uma base de dominio para receber mensagens bancarias coladas ou compartilhadas, preservar origem e preparar processamento posterior em sugestoes de lancamento.

## Objetivo

A inbox deve aceitar textos bancarios ficticios ou reais informados pelo usuario, manter rastreabilidade por tenant/contexto e impedir que mensagens sensiveis sejam exibidas integralmente em superficies de revisao.

## Contratos adicionados

O modulo `packages/domain/src/bank-message-inbox.ts` expoe:

- `createBankMessageInboxItem`, para criar uma mensagem pendente;
- `listBankMessageInboxItems`, para listar mensagens somente do tenant ativo;
- `getBankMessageInboxItem`, para recuperar uma mensagem isolada por tenant;
- `markBankMessageInboxItemProcessed`, para vincular a mensagem a uma sugestao;
- `markBankMessageInboxItemError`, para registrar falha controlada de processamento;
- `discardBankMessageInboxItem`, para descartar mensagem sem apagar historico;
- `buildBankMessageSourceHash`, para deduplicacao inicial por tenant/contexto;
- `maskBankMessageText`, para exibir texto mascarado quando adequado.

## Estados

A inbox trabalha com os estados:

- `pending`: mensagem recebida e aguardando processamento/revisao;
- `processed`: mensagem vinculada a uma sugestao de lancamento;
- `error`: mensagem nao processada por falha controlada;
- `discarded`: mensagem descartada com auditoria.

## Origens aceitas

- `pasted`: usuario colou o texto manualmente;
- `shared`: texto veio de fluxo de compartilhamento, quando a camada PWA/API estiver disponivel.

## Privacidade e seguranca

- O contrato preserva `rawText` para vinculo posterior com sugestoes, mas tambem gera `maskedText` para superficies de UI.
- A auditoria usa marcadores redigidos e nao copia o conteudo bruto da mensagem.
- A deduplicacao usa hash deterministico com `organizationId` e `financialProfileId`.
- Listagem, consulta e transicoes respeitam tenant/contexto.
- Nenhuma mensagem gera lancamento definitivo automaticamente.

## Erros controlados

O modulo lanca `BankMessageInboxError` para:

- origem invalida;
- texto vazio;
- texto acima do limite configurado;
- mensagem duplicada;
- status invalido;
- tentativa de marcar como processada sem sugestao vinculada.

## Limites desta entrega

Ainda nao ha rota HTTP, armazenamento real, tela de inbox nem integracao Web Share Target. Esses pontos dependem das proximas camadas de backend/frontend e devem reutilizar este contrato de dominio.

Perguntas que seguem abertas:

- por quanto tempo o texto bruto sera retido;
- se o usuario podera editar o texto antes do processamento;
- qual parser deterministico ou IA sera aplicado primeiro sobre a inbox.
