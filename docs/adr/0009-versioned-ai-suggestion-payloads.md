# ADR 0009 - Payloads versionados de sugestões

- Status: Aceito
- Data: 2026-08-04

## Contexto

`AiSuggestion` já armazenava alguns payloads estruturados, mas os contratos eram parciais e certos fluxos ainda podiam reconstruir dados da explicação textual. A evolução de importações, regras e IA exige um limite estável entre resposta de provider, persistência, API e revisão humana, com proteção contra versões incompatíveis e decisões concorrentes.

## Decisão

Adotar um envelope discriminado e versionado em `AiSuggestion.payload` para `transaction_extraction`, `categorization`, `deduplication`, `reconciliation` e `insight`.

O envelope comum contém versão do contrato, tipo, origem, alvo, fingerprint, confiança, motivos e auditoria. Cada tipo possui `payloadVersion` e lista fechada de campos. JSON canônico gera fingerprint de domínio. O banco valida o contrato em insert/update, encapsula apenas payload legado já estruturado e compatível e torna payload resolvido imutável.

`explanation` é somente apresentacional. API e frontend usam tipos explícitos e projeção pública redigida. Registros legados sem payload estruturado não são interpretados nem aplicados automaticamente.

## Consequências

- produtores precisam construir payload válido antes de persistir;
- versões desconhecidas e shapes divergentes falham de forma controlada;
- decisões concorrentes são rejeitadas no banco;
- integração futura com providers possui contrato estável;
- migração não executa backfill amplo nem altera histórico resolvido;
- payload bruto de provider, prompt, arquivo ou mensagem não pode ser persistido.

## Alternativas consideradas

- **Continuar com contratos por fluxo:** rejeitado por manter divergência e casts inseguros.
- **Usar `explanation` como fallback:** rejeitado porque texto humano não é fonte financeira confiável.
- **Backfill global durante deploy:** rejeitado por risco de reinterpretar dados históricos e aumentar rollback.
