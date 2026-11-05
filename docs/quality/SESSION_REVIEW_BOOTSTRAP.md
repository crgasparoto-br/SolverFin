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

## Correcoes da auditoria A-763-03 a A-763-07 (05/11/2026)

- **A-763-03:** referencia da PR atualizada para `Refs #762;`, sem relaxar o parser canonico.
- **A-763-04:** a criacao de Check Run bloqueante antecede as leituras faliveis de historico, preservando revogacao fail-closed.
- **A-763-05:** `Delivery audit workspace` contempla PRs com destino `develop` ou `main`, preservando restricao de base e evidencias exact-SHA.
- **A-763-06:** oito artefatos criticos obrigatorios e distintos, hashes e tamanho logico comprovados, JSON versionado e vinculos com issue, base e HEAD material.
- **A-763-07:** conteudo gzip e descomprimido sob limite antes de alocacao excessiva; entrada malformada e rejeitada.

Os testes cobrem controles negativos de watermark, base de destino, aliases e JSON falso, drift de identidade e expansao gzip. A politica permanece `mode=disabled`: codigo candidato nao substitui auditoria independente nem ativa checks ou rulesets nas branches protegidas. A ativacao M2 continua dependente de instalacao confiavel e ensaios reais.

## Remediação A-763-08..11 (05/11/2026)

- **A-763-08:** o coletor passa a exigir o run mais recente, recusando evidência anterior se o último run falhou, foi cancelado ou continua em execução.
- **A-763-09:** certificado com hashes autodeclarados não autoriza aprovação. Um novo workflow somente-leitura valida o certificado com código da base protegida e a Skill oficial pinada. O consumidor autentica run, job, PR, SHA e digest do artifact, exigindo bytes de workflow/código idênticos na base, default e HEAD.
- **A-763-11:** extraído o módulo de verificação de artefatos e filho result-only; os arquivos de produção permanecem dentro do limite de 300 linhas de `CODE-GROWTH-001`.
- **A-763-10:** a certificação própria da issue #762 depende da instalação real do produtor confiável. O handoff herdado de #728 não é aceito; não fabricar prova ou approval. O workflow novo falha fechado antes do bootstrap.

A política permanece `mode=disabled`, PR draft. Não houve merge, ativação, alteração de rulesets ou aprovação independente. Testes mockados não substituem ensaios M2 reais.

A evidência JUnit executa agora os testes Python de governança e os testes visuais
sem privilégios de escrita, reunindo apenas suites realmente concluídas com sucesso.
O verificador reage ao término do workflow de proveniência, sem tornar o check
de CI ou o artifact uma aprovação independente.

O check de contrato executa o verificador oficial `CODE-GROWTH-001` no SHA
material exato, com politica da base protegida, e anexa o JSON emitido pelo
runner como artifact, sem forjar certificado de handoff.

## Identidade obrigatoria da CI tecnica — reforco posterior (#762)

O verificador em `scripts/session_review_evidence.py` nao aceita mais um workflow tecnico verde apenas por nome e SHA. Cada run elegivel precisa estar no inventario completo autenticado de GitHub Actions (`total_count` exato), pertencer a mesma PR, ao mesmo `base.sha` e ao mesmo `head.sha`, alem de corresponder ao workflow imutavel esperado. O run mais recente **da PR correta** deve terminar em `completed/success`. Runs de outra PR com o mesmo commit, inventarios truncados e bases antigas sao rejeitados. Os testes adversariais direcionados elevaram a suite local de 112 para 121 casos aprovados no commit `429e96bd944120c24b58cfa03299da1a93bafd9b`.

A verificacao local nao e CI certificada no SHA publicado posterior, nem instalacao M2. Politica permanece `mode=disabled`; produtores confiaveis, certificado proprio, ensaios operacionais reais e revisao em contexto distinto continuam condicionados ao bootstrap autorizado em bases protegidas. Nenhum check de aprovacao foi habilitado por essa mudanca.
