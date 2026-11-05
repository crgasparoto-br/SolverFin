# ADR 0019 - Revisao por sessao atestada em projeto de operador unico

**Status:** Proposto (bootstrap desativado; nao homologado).
**Issues:** #762, #714; PR #760; epica #702.

## Contexto

A issue #714 ainda depende da pendencia formal F-714-06. O mantenedor utiliza uma unica conta GitHub, e o GitHub nao admite autoaprovacao da PR. O repositorio oficial crgasparoto-br/skill@develop documenta o modo operator-attested-session-review em docs/WEB_INDEPENDENT_AUDIT.md.

A conta GitHub nao prova identidade de um segundo auditor. O novo modo apenas atesta a separacao de contextos declarada pelo operador; usa `third_party_identity_proven=false` e `separate-context-declared-not-cryptographically-proven`. Nao equivale a assinatura Ed25519 independente.

## Decisao

Adotar esse modo apenas apos homologacao M2. Esta PR entrega politica `mode=disabled`, contrato oficial de validacao, testes adversariais e coletor de fontes neutras. Nao emite check de aprovacao, nao muda rulesets, nao fecha #714 e nao libera merge. A mudanca futura de garantia de F-714-06 exige decisao registrada e aceite explicito da governanca.

## Fronteira de confianca

- O coletor usa somente dados autenticados do GitHub e executa codigo fixado pela branch default confiavel, nunca pelo HEAD candidato.
- Fonte e identidade sao vinculadas a Git blobs, base, HEAD, preview e handoff `result-only-child`.
- Os testes executados em PR sao nao privilegiados; seu sucesso nao e parecer.
- Comentarios e dados de candidato nao se tornam shell, Python, autoridade de CI ou conclusao do auditor.
- O modo completo precisa conferir cada obrigacao, fontes, JUnit positivo/negativo/regressao e procedencia real de conversa revisora separada.
- Editar/apagar um parecer ou alterar SHA/CI deve revogar a aprovacao; nenhum check deve sobreviver a drift nao revalidado.

## M2 — requisitos ainda pendentes

1. Implantar o verificador e publicador do check `Verify session review (exact SHA)` usando o contrato oficial adaptado as evidencias do SolverFin.
2. Instalar e comprovar bytes equivalentes de politica, workflows e scripts em `develop` e `main`.
3. Executar ensaios positivos e negativos de SHAs, credenciais, comentarios editados, provas, testes e heads compartilhados.
4. Habilitar politica apenas depois de verificacoes de bootstrap, conferir rulesets e preservar `Delivery V2 gate` e protecoes existentes.
5. Recertificar PR #760 contra a base nova, auditar em conversa realmente separada, publicar parecer `SOLVERIT_SESSION_REVIEW_V1` e conferir recibo exact-SHA.
6. Encerrar #714 somente apos a prova formal; manter #702 aberta conforme outras pendencias.

## Consequencias

Esta etapa nao toca runtime financeiro nem reduz seguranca. F-714-06 continua pendente. O modo aprovado futuramente continuara sendo revisao de sessao de operador unico, nao auditoria humana de terceiro.
