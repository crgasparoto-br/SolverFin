# ADR 0006 - Importação estruturada com revisão humana

- Status: Aceito
- Data: 2026-07-17
- Emenda OFX: 2026-07-29, issue #548

## Contexto

O fluxo inicial de CSV persistia lote e explicação textual, mas não tinha preview operacional, payload versionado, decisão atômica, vínculo determinístico nem interface completa. Reconstruir dados financeiros da explicação e finalizar sugestão fora da transação do lançamento criava risco de inconsistência e duplicidade.

A issue #548 estendeu o mesmo contrato operacional ao subconjunto OFX documentado em `docs/IMPORTS.md`, sem armazenar o arquivo bruto e sem criar efeito financeiro antes da revisão humana.

## Decisão

1. O preview processa o conteúdo em memória e retorna `persisted: false`.
2. O banco não armazena CSV ou OFX bruto; guarda metadados mínimos, hashes, diagnósticos e configuração de parsing quando aplicável.
3. Cada linha usa payload estruturado versionado em `AiSuggestion.payload`.
4. Aprovação cria `Transaction` e finaliza `AiSuggestion` na mesma transação, com unicidade por sugestão.
5. Candidaturas de duplicidade/conciliação referenciam a sugestão de origem, seu fingerprint e o lançamento alvo.
6. Correção mantém a linha pendente e expira candidaturas obsoletas.
7. Descarte é lógico, rejeita extrações pendentes, expira candidatos determinísticos e é bloqueado depois de qualquer efeito financeiro.
8. Identidade de conteúdo e de lote usa SHA-256; a leitura da identidade CSV legada permanece apenas para compatibilidade.
9. No CSV, delimitador e cabeçalhos são resolvidos por estrutura, com ambiguidades explícitas, cabeçalhos originais e validação de colunas.
10. No OFX, somente o subconjunto estrutural documentado é aceito; `STMTTRN` deve pertencer ao `BANKTRANLIST` da única seção de extrato reconhecida, e `CURDEF` só é aceito nos metadados dessa seção, fora da lista de transações.
11. A Inbox é a interface operacional compartilhada, com edição em modal acessível e devolução de foco.
12. Novas importações CSV persistem mapeamento versão 2, discriminando valor assinado de entrada/saída; tipo e ID externo permanecem somente para leitura legada.
13. Importações OFX persistem lote e sugestões revisáveis com provider/model específicos, sem persistir o conteúdo bruto.

## Consequências

- dados financeiros não dependem de parsing de texto explicativo;
- concorrência e repetição não criam múltiplos lançamentos;
- o histórico CSV/OFX permanece auditável sem reter o arquivo;
- mudanças futuras no payload exigem nova versão e migração compatível;
- variantes OFX fora do subconjunto documentado falham de forma controlada, sem reinterpretação silenciosa.

## Alternativas consideradas

- Persistir arquivo bruto: rejeitado por minimização e risco de exposição.
- Guardar somente explicação: rejeitado por fragilidade e falta de tipagem.
- Aprovação em etapas separadas: rejeitada por risco de estado parcial.
- Inferir moeda de `CURDEF` fora do escopo canônico: rejeitado por risco de rotular valores na moeda errada.
