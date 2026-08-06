# Consentimento, mascaramento e exclusao logica

## Consentimentos do MVP

Finalidades iniciais:

- `ai_processing`: uso de IA para classificacao, extracao, assistente e insights.
- `bank_message_processing`: processamento de mensagens bancarias coladas ou compartilhadas.
- `import_processing`: importacao CSV/OFX e normalizacao.
- `professional_integration`: integracoes profissionais, como Agenda Profissional.
- `accountant_export`: exportacao CSV para contador/MEI.

Cada consentimento registra usuario, organizacao, perfil financeiro, finalidade, status, origem, data/hora e versao de termos quando disponivel. Revogacao bloqueia novos fluxos sensiveis daquela finalidade.

### Estado autoritativo da Inbox bancaria

O aceite no formulario da Inbox registra transicoes imutaveis para `bank_message_processing` e `ai_processing` em `SecurityAuditEvent`. O estado atual e derivado do evento mais recente de cada finalidade, filtrado por usuario, organizacao e perfil financeiro.

A gravacao usa lock transacional por contexto. Um aceite semanticamente identico nao cria nova transicao nem reatribui proveniencia. Revogacao gera nova transicao e passa a ser observada imediatamente pelos consumidores.

Antes de cada tentativa externa, o fluxo revalida cumulativamente:

1. sessao e identidade atuais;
2. organizacao e perfil financeiro esperados;
3. estado persistido mais recente das duas finalidades.

Se qualquer finalidade estiver ausente ou revogada, a tentativa e bloqueada sem chamar o provider. Uma revogacao ocorrida depois da primeira tentativa e antes de um retry impede a nova chamada.

## Mascaramento

O utilitario compartilhado cobre:

- numero de cartao;
- CPF/CNPJ ficticio ou documento em padrao comum;
- identificadores longos de conta/agencia;
- tokens e secrets em textos;
- mensagens bancarias com termos de risco.

Regras:

- Logs e erros nao devem incluir payload financeiro bruto.
- UI deve exibir identificadores completos apenas quando houver necessidade explicita e autorizada.
- Fixtures e exemplos devem usar dados ficticios e, preferencialmente, ja mascarados.

## Exclusao logica

O helper de dominio `softDeleteEntity` marca entidade com `deletedAt`, `deletedByUserId` e motivo opcional, alem de gerar auditoria redigida.

Consultas padrao devem usar `listVisibleEntities`; trilhas de auditoria autorizadas podem usar `listAuditVisibleEntities`.

Hard delete fica bloqueado por padrao no codigo de aplicacao e deve ser reservado para expurgo documentado, desenvolvimento local ou decisao futura aprovada.

## Limitacoes atuais

- A tela completa de preferencias de privacidade ainda depende do bootstrap visual da aplicacao.
- Textos juridicos finais e prazos de retencao dependem de validacao especializada.
- As demais finalidades continuam usando os contratos de dominio existentes ate que seus consumidores exijam persistencia operacional equivalente.
