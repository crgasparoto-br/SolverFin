# ADR 0019 - Revisao por sessao atestada em projeto de operador unico

**Status:** Proposto (bootstrap desativado; nao homologado).
**Issues:** #762, #714; PR #760; epica #702.

## Contexto

A issue #714 ainda depende da pendencia formal F-714-06. O mantenedor utiliza uma unica conta GitHub, e o GitHub nao admite autoaprovacao da PR. O repositorio oficial crgasparoto-br/skill@develop documenta o modo operator-attested-session-review em docs/WEB_INDEPENDENT_AUDIT.md.

A conta GitHub nao prova identidade de um segundo auditor. O novo modo apenas atesta a separacao de contextos declarada pelo operador; usa `third_party_identity_proven=false` e `separate-context-declared-not-cryptographically-proven`. Nao equivale a assinatura Ed25519 independente.

## Decisao

Adotar esse modo apenas apos homologacao M2. A PR #763 entrega politica `mode=disabled`, contrato oficial de validacao, coletor de fontes neutras, verificador deterministico e workflows de evidencia/Check Run **ainda nao instalados nas branches confiaveis**. Os workflows privilegiados nao executam codigo candidato; a fonte executada pelo verificador vem de `github.workflow_sha` e precisa coincidir byte a byte com `develop` e `main`. O workflow de testes da PR e somente leitura, nao publica aprovacao e somente oferece JUnit/prova para uma revisao semantica posterior. Nenhum check foi habilitado, nenhum ruleset foi mudado e nao ha liberacao de merge. A mudanca futura de garantia de F-714-06 exige decisao registrada e aceite explicito da governanca.

## Fronteira de confianca

- O coletor usa somente dados autenticados do GitHub e executa codigo fixado pela branch default confiavel, nunca pelo HEAD candidato.
- Fonte e identidade sao vinculadas a Git blobs, base, HEAD, preview e handoff `result-only-child`.
- Os testes executados em PR sao nao privilegiados; seu sucesso nao e parecer.
- Comentarios e dados de candidato nao se tornam shell, Python, autoridade de CI ou conclusao do auditor.
- O modo completo precisa conferir cada obrigacao, fontes, JUnit positivo/negativo/regressao e procedencia real de conversa revisora separada.
- Editar/apagar um parecer ou alterar SHA/CI deve revogar a aprovacao; nenhum check deve sobreviver a drift nao revalidado.

## M2 — implementacao versus ativacao

O codigo candidato implementa a leitura confiavel de politica/base/default, comparacao dos bytes dos workflows, inventario Git, autenticacao de commits/preview, certificado `critical`, verificacao de hashes de artefatos e `result-only-child`, CI terminal exata e JUnit com testes distintos. O leitor bloqueia comentario ausente, editado, revogado, falso, stale, usuario indevido, HEAD compartilhado e evidencia/CI alterada; somente publica um Check Run se o parecer passar no contrato oficial. O check e iniciado `in_progress`, antes das leituras mutaveis, e termina `failure` em bloqueios observaveis. Esses controles estao **em PR candidata, nao em operacao**.

Ainda exigidos para ativacao:

1. Revisar independentemente o diff de seguranca da PR #763 e obter o bootstrap administrativo explicito; nao permitir que a propria nova politica autorize seu merge.
2. Integrar bytes exatos de politica, workflows, verificador e testes em `develop` e depois em `main` por release regular autorizada. Enquanto diferirem, a aprovacao falha fechada.
3. Executar ensaios reais de sucesso, falha, edicao, exclusao, revogacao, rebase/base drift, JUnit insuficiente e SHA de duas PRs na infraestrutura GitHub. Testes mockados nao substituem o ensaio.
4. Registrar explicitamente a decisao de garantia de operador unico, habilitar a politica somente nas bases confiaveis e revalidar as regras efetivas: manter PR obrigatoria, `Delivery V2 gate`, proibir force-push/deletion e requerer o novo check `Verify session review (exact SHA)` sem confundir revisao de sessoes com terceiro humano.
5. Reconciliar e recertificar a PR #760 contra a nova base `develop`; produzir o artefato de testes auditaveis no novo HEAD, obter parecer em conversa auditora realmente separada, verificar check exato e apenas entao avaliar seu merge.
6. Encerrar #714 somente apos evidencia formal; manter #702 aberta pelas outras pendencias.

## Consequencias

Esta etapa nao toca runtime financeiro nem reduz seguranca. F-714-06 continua pendente. O modo aprovado futuramente continuara sendo revisao de sessao de operador unico, nao auditoria humana de terceiro.
