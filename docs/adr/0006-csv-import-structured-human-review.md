# ADR 0006 - Importação CSV estruturada com revisão humana

- Status: Aceito
- Data: 2026-07-17

## Contexto

O fluxo inicial de CSV persistia lote e explicação textual, mas não tinha preview operacional, payload versionado, decisão atômica, vínculo determinístico nem interface completa. Reconstruir dados financeiros da explicação e finalizar sugestão fora da transação do lançamento criava risco de inconsistência e duplicidade.

## Decisão

1. O preview processa o conteúdo em memória e retorna `persisted: false`.
2. O banco não armazena o CSV bruto; guarda metadados mínimos, diagnósticos e configuração de parsing.
3. Cada linha usa payload estruturado versionado em `AiSuggestion.payload`.
4. Aprovação cria `Transaction` e finaliza `AiSuggestion` na mesma transação, com unicidade por sugestão.
5. Candidaturas de duplicidade/conciliação referenciam a sugestão de origem, seu fingerprint e o lançamento alvo.
6. Correção mantém a linha pendente e expira candidaturas obsoletas.
7. Descarte é lógico, rejeita extrações pendentes, expira candidatos determinísticos e é bloqueado depois de qualquer efeito financeiro.
8. Identidade de conteúdo e de lote usa SHA-256; a leitura da identidade legada permanece apenas para compatibilidade.
9. Delimitador e cabeçalhos são resolvidos por estrutura, com ambiguidades explícitas, cabeçalhos originais e validação de colunas.
10. A Inbox é a interface operacional do fluxo, com edição em modal acessível e devolução de foco.
11. Novas importações persistem mapeamento CSV versão 2, discriminando valor assinado de entrada/saída; tipo e ID externo permanecem somente para leitura legada.

## Consequências

- dados financeiros não dependem de parsing de texto explicativo;
- concorrência e repetição não criam múltiplos lançamentos;
- o histórico permanece auditável sem reter o arquivo;
- mudanças futuras no payload exigem nova versão e migração compatível;
- OFX continua fora da persistência até receber contrato equivalente.

## Alternativas consideradas

- Persistir CSV bruto: rejeitado por minimização e risco de exposição.
- Guardar somente explicação: rejeitado por fragilidade e falta de tipagem.
- Aprovação em etapas separadas: rejeitada por risco de estado parcial.
