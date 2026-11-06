# Pacote certificado — issue #747 / PR #749

Este diretório contém evidências da implementação e readiness para uma auditoria independente separada. Não é um parecer de auditoria independente.

- Material HEAD: `659a4c10841bcea19700dcf51b5bd7a15aeec231`.
- Base remota da PR: `develop@0fc7c118689bef56a70d19c0d58e64d87643a276`.
- Work-item start preservado: `7d151ce4ad1b0a412a281bf527f244bcd3bee042`.
- Repository CI exact-SHA: run `40623696529`, success.
- Chrome/Statement visual exact-SHA: run `40623696564`, success.
- Delivery audit workspace exact-SHA: run `40623696510`, success.
- `requirement-closure.json`: 15 obrigações da issue #747.
- `requirement-attack-matrix.json` e `risk-saturation.json`: controles positivos, negativos e regressivos vinculados ao material HEAD.
- `codebase-grounding.json`: decisões de reuso/criação e 12 suítes alteradas com prova de alcance no CI exato.
- `code-growth.json`: `CODE-GROWTH-001` aprovado.
- `evidence/issue-747-viewport-evidence.json`: extrato determinístico do artifact visual, com proveniência do run e registros exatos para 320×740, 390×844 e 1366×768.
- `evidence/issue-747-transaction-ambiguity.json`: replay idempotente observado no Chrome após resposta ambígua.

O certificado `handoff-ready.json` representa a issue #747 / PR #749 e certifica o material HEAD acima. O commit que publicar este pacote deve ser filho direto somente de resultados; nenhum arquivo de produto pode mudar nele. A aprovação independente continua obrigatória antes de merge.
