# Session review — bootstrap e limites de garantia

**Estado atual:** Issue #762; politica `mode=disabled`.
**Fonte oficial:** `crgasparoto-br/skill@a28be10db466631cd5e5e4dbe0429da250cd8b42`, `docs/WEB_INDEPENDENT_AUDIT.md`.

Este bootstrap **nao fecha F-714-06** nem comprova parecer independente, embora ja inclua em branch candidata o codigo de verificacao e publicacao do futuro Check Run. A politica desabilitada recusa qualquer sucesso de revisao; a instalacao e o opt-in em duas bases confiaveis continuam necessarios. O modo futuro sera `operator-attested-session-review`, explicitamente sem prova de segunda identidade.

## Entrega nesta etapa

- Politica com operador GitHub numerico e limite de garantia, inicialmente desativada.
- Contrato oficial `SOLVERIT_SESSION_REVIEW_V1` e testes positivos, negativos e regressivos.
- Coletor de pacote neutro de issue/PR, SHAs, preview, Git blobs, certificado e observacoes CI; nao copia conclusoes da implementacao.
- Workflow read-only de pacote e workflow de testes sem privilegios de escrita. O novo workflow `session-review-evidence.yml` executa casos reais no commit do candidato e preserva JUnit e certificado exact-SHA; o candidato nao recebe token de escrita.
- Verificador em `scripts/verify_session_review.py`: somente codigo trusted, consulta politica identica em base e default, exige comentario posterior ao certificado, controle de revogacao, testes positivos/negativos/regressao por obrigacao e publica (apos ativacao) `Verify session review (exact SHA)` com `checks: write`. Nao ha nenhum sucesso de aprovacao emitido nesta PR.

## Solicitar pacote (apos instalacao na default)

O proprietario da conta pode comentar na PR somente:

```text
/solverit-audit-packet
```

O workflow usa `github.workflow_sha` como codigo confiavel, confirma o comentario autenticado e envia o artifact `solverfin-neutral-audit-packet`. Sem politica identica em default/base, handoff valido, filiacao result-only e merge preview autentico, a coleta falha. Um pacote obtido nao prova que a auditoria ocorreu.

Um teste local com GH CLI autenticado pode ser:

```sh
python scripts/prepare_session_review_packet.py --repo crgasparoto-br/SolverFin --pr 760 --output /tmp/solverfin-review-packet.json
```

## Testes reproduziveis

```sh
python -m pytest -q tests/test_session_review.py tests/test_session_review_packet.py tests/test_session_review_verifier.py
```

## Ativacao operacional M2 — ainda bloqueada

A rotina de verificacao foi preparada, mas nao pode ser usada pela PR que a introduz como fonte de autoridade. E necessario instalar e comprovar os mesmos bytes em `develop` e `main`, executar ataques positivos e negativos reais, registrar aceite explicito do modelo de garantia, revalidar rulesets e recertificar a PR #760 na base resultante. O workflow de evidencia produz artefato `session-review-evidence-<SHA>` com `junit.xml`, `session-review-evidence.json` e certificado, exigindo que os controles realmente tenham sido executados.

A revisao da #760 deve ocorrer numa **conversa diferente**, com URL real fornecida pelo operador. Na ausencia da conversa original, usar somente proveniencia GitHub que a politica confiavel habilite e que o verificador autentique. O novo check so pode terminar `success` quando um parecer completo possuir cobertura por obrigacao e tres casos JUnit distintos por requisito, com fontes e SHA-256 de linhas; mero CI verde, comentario de implementacao e bundle de teste nao bastam. O modo desabilitado, fontes divergentes, revisao ausente e arquivo de evidencia desatualizado bloqueiam.
O coletor deriva `develop` ou `main` somente da PR autenticada e exige a mesma base no certificado.
Antes de aceitar CI como evidencia, o verificador compara os Git blobs dos workflows tecnicos
no material e no HEAD publicado contra os bytes da base protegida; YAML candidato adulterado
nao pode produzir prova valida apenas por manter o nome do check.

Antes da instalacao, preservar snapshot de rulesets e plano de rollback, mantendo `Delivery V2 gate`, PR obrigatoria e bloqueios de exclusao/force-push. Esta PR nao altera rulesets, nao faz merge e nao encerra a #714.
