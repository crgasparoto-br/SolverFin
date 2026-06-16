# Controles de privacidade do dominio

O modulo `packages/domain/src/privacy-controls.ts` define contratos puros para consentimento, mascaramento e exclusao logica. Ele nao escolhe banco, framework HTTP ou UI definitiva.

## Consentimento

Finalidades iniciais cobertas:

- `ai_processing`
- `bank_message_processing`
- `external_integration`
- `data_export`

Cada registro guarda:

- organizacao e perfil financeiro;
- usuario;
- finalidade;
- status `granted` ou `revoked`;
- versao dos termos quando disponivel;
- origem da acao;
- datas de concessao, revogacao e atualizacao.

Fluxos sensiveis devem chamar `requireActivePrivacyConsent` antes de executar IA, integracoes ou processamento de mensagens bancarias. A falha retorna erro controlado com codigo `PRIVACY_CONSENT_REQUIRED`.

## Mascaramento

Funcoes centrais:

- `maskFinancialIdentifier`
- `maskSensitiveFinancialText`
- `sanitizeSensitiveErrorMessage`

Cobertura inicial:

- cartoes com 13 a 19 digitos;
- documentos em formato CPF;
- identificadores numericos curtos de conta/agencia;
- valores em reais;
- erro controlado truncado em 300 caracteres.

Dados completos so devem ser usados em operacao autorizada e nunca em log, mensagem de erro ou preview.

## Exclusao logica

`softDeleteResource` aplica:

- `deletedAt`;
- `deletedByUserId`;
- `deletionReason` mascarado quando informado.

`listActiveResources` representa o comportamento esperado de consulta padrao: listar apenas recursos do tenant/perfil e sem `deletedAt`.

`buildSoftDeleteAuditEntry` registra auditoria com metadados minimos, sem payload financeiro completo.

## Limites atuais

- Persistencia e migrations ainda dependem da camada de infraestrutura.
- Restauracao de recursos excluidos fica fora do MVP deste contrato.
- Hard delete permanece fora do codigo de aplicacao ate ADR e politica aprovadas.
- A UI minima de preferencias deve consumir estes contratos quando o frontend renderizavel estiver pronto.
