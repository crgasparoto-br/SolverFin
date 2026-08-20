# ADRs - Architecture Decision Records

ADRs registram decisões arquiteturais relevantes do SolverFin.

Use ADR quando uma decisão muda stack, boundary, privacidade, tenant, auditoria, dados financeiros, contrato público, schema, integração externa ou estratégia de IA.

## Status possíveis

- `Proposto`
- `Aceito`
- `Substituído`
- `Depreciado`

## Lista

- `0001-stack-inicial.md` - Stack inicial e arquitetura de alto nível.
- `0002-mvp-web-runtime-and-session.md` - Runtime web e sessão local do MVP.
- `0003-epic-133-mvp-consolidation.md` - Consolidação do MVP navegável da épica #133.
- `0004-autenticacao-produtiva.md` - Autenticação produtiva definitiva.
- `0005-financial-indexes-shared-domain.md` - Índices financeiros compartilhados entre extrato e investimentos.
- `0006-csv-import-structured-human-review.md` - Importação CSV/OFX estruturada, idempotente e revisada na Inbox.
- [0007 - Idempotência durável para criação de conjuntos financeiros](./0007-durable-financial-set-idempotency.md)
- [0008 - Recuperação de envio ambíguo de parcelamento manual](./0008-ambiguous-installment-submission-recovery.md)
- [0009 - Payloads versionados de sugestões](./0009-versioned-ai-suggestion-payloads.md)
- [0010 - Provider OpenAI inicial e substituível](./0010-openai-provider-inicial.md)
- [0011 - Assistente financeiro conversacional somente leitura](./0011-read-only-financial-assistant.md)
- [0012 - Separar agência e conta no cadastro de conta](./0012-separate-account-agency-identifiers.md)
- [0013 - Multi-moedas e agregação financeira explícita](./0013-multi-currency-financial-aggregation.md)
- [0014 - Arquitetura incremental de interface por componentes e view-models](./0014-incremental-component-ui-architecture.md)
- [0015 - Moeda de referência e contrato de conversão cambial](./0015-reference-currency-and-fx-conversion-contract.md)
