# RESULTADO: REPROVADA

> **Conclusao:** `REPROVADA` — achados bloqueantes: `1` — recomendacoes opcionais: `0`
> **Motivo determinante:** O certificado critical ainda vincula o material 072559705c66627ad91fdef3c63b3888b95e3e6e, mas a PR #754 avançou até 0374ab3de95900cf60d5439ebecc83ff764eb9b2 por dois commits materiais posteriores ao filho de resultados, invalidando o handoff exact-SHA.
> **Libera merge/release:** NAO

**Validade:** Independente
**Triagem:** bloqueadores comprovados: `1` | riscos inferidos: `0` | limitacoes do auditor: `0`
**Rejection ID:** `audit-rejection:b9b62392-f035-49d6-b6f3-e00cef0313a2`

## Auditoria da issue #726 — Inbox A6 / Golden Screen

**Data:** 01/11/2026. Auditoria somente leitura realizada em contexto distinto da implementação, com fontes GitHub autenticadas e bundles oficiais emitidos por GitHub Actions. Parecer independente local: não constitui aprovação assinada/importável por si só. Nenhuma mudança de código, issue, PR, branch, configuração ou workflow foi executada.

**Identidade congelada:** repositório `crgasparoto-br/SolverFin`, issue [#726](https://github.com/crgasparoto-br/SolverFin/issues/726), PR [#754](https://github.com/crgasparoto-br/SolverFin/pull/754) draft, base `develop@36cbfb7ee0a8aea2412073d113644bf2e1e683e5`, HEAD `0374ab3de95900cf60d5439ebecc83ff764eb9b2`. Skill oficial: `crgasparoto-br/skill@2ee50f7897b52de61558eb64416403f1bcbdd9f6`.

**Transporte:** `certified-handoff`. O classificador oficial `auditar-issue/scripts/classify_audit_transport.py`, executado sobre a base imutável sem contrato GitHub-native confiável, retornou `legacy_handoff_required=true`, `reason=no-trusted-native-contract`. O certificado `critical` publicado é obrigatório neste modo.

## Achados bloqueantes

### A-001 — Certificado critical obsoleto após mudanças materiais

- **Requisitos afetados:** GS-726-12, aceite SSR/CI/Chrome exact-SHA e gate de certificação independente da issue #726.
- **Origem comprovada:** entrega
- **Evidência:** No [handoff-ready.json do HEAD 0374ab3](https://github.com/crgasparoto-br/SolverFin/blob/0374ab3de95900cf60d5439ebecc83ff764eb9b2/.audit/entregar-issue/handoff-ready.json), `identity.material_head_sha=072559705c66627ad91fdef3c63b3888b95e3e6e`. O filho de resultados anterior é `5e77012fb60223514a2c009ef83181bbbea820fa`; o HEAD atual é filho direto de `986e6531cd4813eba850a2b18a3bfb929ade4d5a`, que introduziu código e testes de edição tipada após o certificado. A [comparação imutável](https://github.com/crgasparoto-br/SolverFin/compare/5e77012fb60223514a2c009ef83181bbbea820fa...0374ab3de95900cf60d5439ebecc83ff764eb9b2) registra seis caminhos materiais alterados após o certificado.
- **Gate determinístico:** `python auditar-issue/scripts/check_delivery_preflight.py` da Skill oficial, no checkout offline verificado pelo GitHub Actions, com identidade da issue/PR, base, parent real e changed paths, encerrou **exit code 2**. Saída: `BLOCK: result-only child parent differs from certified material_head_sha`; `BLOCK: result-only child contains non-handoff paths`; `RECOVERY: post-write-refreeze`. SHA-256 da saída: `b8c1ac83ea1e4b11a1db3c695fd5da4ee7504a2daabcdf63ff5cbb254753c88a`.
- **Disposição:** `blocking`; situação: `regressed` em relação à classe histórica de certificado A-001, remediada para uma identidade anterior, mas reaberta por alteração material posterior. Requer `post-write-refreeze` e novo `result-only-child` somente de evidências, filho direto do material final.

## Estado dos gates e alcance de testes

| Gate / superfície | Declared | Reached | Passed | Estado e prova |
| --- | --- | --- | --- | --- |
| Classificação do transporte na base | sim | sim | sim | `certified-handoff` no manifesto ancorado em `develop@36cbfb7` |
| Handoff final exact-SHA | sim | sim | **não** | `check_delivery_preflight.py`, exit 2, bloqueio reproduzido |
| Repository CI exato | sim | sim | sim | [run #41334271352](https://github.com/crgasparoto-br/SolverFin/actions/runs/41334271352), completed/success |
| Chrome visual autenticado exato | sim | sim | sim | [run #41334271338](https://github.com/crgasparoto-br/SolverFin/actions/runs/41334271338), completed/success; artefato bruto `statement-visual-evidence-0374ab3de95900cf60d5439ebecc83ff764eb9b2` |
| Delivery audit workspace exato | sim | sim | sim | [run #41334271318](https://github.com/crgasparoto-br/SolverFin/actions/runs/41334271318), completed/success; bundles `repository.bundle` e `skill.bundle` com SHA conferido |
| Parecer visual/técnico independente de aprovação no SHA corrente | previsto | não comprovado | não | Obrigação de governança; o presente parecer é de reprovação por certificado stale |

## Matriz de requisitos — amostragem auditável e limite da conclusão

| Contrato | Evidência observada | Classificação nesta auditoria |
| --- | --- | --- |
| A6 fila → item → evidência → decisão; secundários abaixo | SSR de `inbox-review-archetype.ts` e `issue-565-ai-review-queue.json` no HEAD atual, capturas 1366×768 e 390×844 | Evidência positiva, sem bloqueio adicional demonstrado |
| A-006/GS-726-08/09 contenção das ações e reflow | Teste Chrome mede botão dentro do cartão; controle negativo aplica grid legado (overflow de 162px no mobile e 72px no desktop) e restauração passa | Negativo discriminante observado no artefato exato |
| GS-726-03/04/05/06 contraste, foco, ícones e modal | `goldenScreenControls` no JSON, captura 320×740 e imagem de evidência longa | Evidência visual favorável; não é aprovação formal de todos os estados |
| A-002, A-003, A-010/011 e GS-726-07/11 proteção de edição/decisão | `fingerprintChecks` bloqueia POST para A≠B; `typedEditEvidence` com 11 casos, 10 ataques com 0 POST e um caso válido com 1 POST; `issue-565-ai-review-queue-states.json` sem falhas | Testes declarados, atingidos e aprovados no HEAD atual |
| GS-726-12 certificação/independência exact-SHA | Validador oficial BLOCK no SHA atual | **Reprovado** |

**Alcance:** a auditoria examinou a fonte real, o delta posterior ao certificado, os registros JSON brutos do Chrome (sem `failures` no HEAD), as capturas e os workflows imutáveis; não fez afirmação de execução independente de um novo navegador. O gate de prontidão vermelho encerra a possibilidade de aprovação, independentemente dos testes funcionais verdes. O parecer não declara todos os 25 itens encerrados, inclusive `OBL-012`, `OBL-023` e `OBL-025` diferidos no certificado antigo.

## Dependências complementares

A [PR #756](https://github.com/crgasparoto-br/SolverFin/pull/756), issue #755, possui CI/Chrome verdes no HEAD `1065791df2b76d6485d93d5ff58c89ec5803730c`, mas permanece draft e não equivale à integração na #754. A [PR #757](https://github.com/crgasparoto-br/SolverFin/pull/757) da ressalva visual R-001 também tem CI/Chrome verdes no HEAD `3ee4415a8e82caf542cbdad9eec3adc746cf5922` e permanece draft; o código da PR #754 atual já contém regra de ocultação visual do título duplicado com preservação de acessibilidade. Não inferir nova falha nem exigir merge duplicado com base apenas na existência dessas PRs.

## Pendências objetivas

1. Manter o SHA material definitivo da PR #754 congelado; usar `0374ab3de95900cf60d5439ebecc83ff764eb9b2` se não houver mais alterações materiais.
2. Reexecutar fechamento semântico das 25 obrigações no SHA material atual, com rastreio dos novos controles de edição tipada e evidência Chrome já publicada; não reutilizar as medições do material `0725597` como se fossem de `0374ab3`.
3. Publicar um novo `result-only-child` exclusivo de `.audit/entregar-issue/` com **parent exato igual ao material final**, validar `validate_terminal_handoff.py` e `check_delivery_preflight.py` após leitura remota, e comprovar que a branch não avançou materialmente.
4. Obter parecer técnico/visual independente de aprovação sobre o SHA certificado publicado, incluindo as obrigações reservadas; só então avaliar os gates de integração. Reutilizar CI/Chrome verdes apenas se a identidade material e o escopo permanecerem exatamente iguais.

**Disposição final:** issue #726 aberta e PR #754 draft, sem merge. Nenhum bloqueio funcional novo foi comprovado pelo recorte de código/Chrome examinado. O bloqueio de certificação é demonstrado e determinístico.
