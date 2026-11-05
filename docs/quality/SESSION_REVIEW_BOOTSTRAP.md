# Session review — bootstrap e limites de garantia

**Estado atual:** Issue #762; politica `mode=disabled`.
**Fonte oficial:** `crgasparoto-br/skill@a28be10db466631cd5e5e4dbe0429da250cd8b42`, `docs/WEB_INDEPENDENT_AUDIT.md`.

Este bootstrap **nao fecha F-714-06**, nao emite `APPROVED` ou check formal e nao substitui auditoria de terceiro. O modo futuro sera `operator-attested-session-review`, explicitamente sem prova de segunda identidade.

## Entrega nesta etapa

- Politica com operador GitHub numerico e limite de garantia, inicialmente desativada.
- Contrato oficial `SOLVERIT_SESSION_REVIEW_V1` e testes positivos, negativos e regressivos.
- Coletor de pacote neutro de issue/PR, SHAs, preview, Git blobs, certificado e observacoes CI; nao copia conclusoes da implementacao.
- Workflow read-only de pacote na branch default e workflow nao privilegiado para os testes; **nenhum publica aprovacao**.

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
python -m pytest -q tests/test_session_review.py tests/test_session_review_packet.py
```

## Ativacao bloqueada ate M2

Implementar verificador de comentarios, provas JUnit e emissor de `Verify session review (exact SHA)` de acordo com a Skill oficial. Instalar codigo e politica em `develop` e `main`, executar ataques negativos autenticos, revalidar rulesets e recertificar a PR #760 apos eventual mudanca da base. A revisao deve ocorrer numa **conversa diferente**, com referencia real. Nao gerar URL ficticia nem alegar aprovacao independente de terceiro.
