# RESULTADO: REPROVADA

> **Conclusao:** `REPROVADA` — achados bloqueantes: `2` — recomendacoes opcionais: `0`
> **Motivo determinante:** Os oráculos do SHA material permitem vazamento de valores monetários em diagnósticos de falha e aprovam cenários de orçamento sem histórico vinculado à categoria, contrariando os compromissos verificáveis da PR.
> **Libera merge/release:** NAO

**Validade:** Independente
**Triagem:** bloqueadores comprovados: `2` | riscos inferidos: `0` | limitacoes do auditor: `0`

**Rejection ID:** `audit-rejection:1bc557a9-4ae9-4fd9-ab6d-d815019e7ba2`

# Auditoria independente — SolverFin PR #756 / Issue #755

## Motivo determinante

A PR melhora os dois fluxos de Chrome, tem handoff formalmente pronto e passou duas execuções independentes de 75/75 cenários. Entretanto, a inspeção das funções reais e a execução de controles próprios sobre o SHA material demonstraram dois falsos positivos relevantes. A CI verde não substitui a prova discriminante solicitada pela issue e declarada pela própria PR.

## Validade da execucao

Esta revisão ocorreu em contexto de auditoria separado da implementação; nenhuma correção ou escrita no repositório foi realizada. A conclusão é sustentada por execução local de controles adversariais, artefatos oficiais do GitHub Actions, objetos Git restaurados de bundle autenticado e validação dos scripts oficiais `crgasparoto-br/skill@develop`. Independência de sessão não significa assinatura criptográfica nem aprovação de um terceiro usuário.

- **Repositório/PR:** [crgasparoto-br/SolverFin #756](https://github.com/crgasparoto-br/SolverFin/pull/756), em draft, sem merge.
- **Issue:** [#755](https://github.com/crgasparoto-br/SolverFin/issues/755), correção isolada do harness de testes Chrome.
- **Base congelada `develop`:** `36cbfb7ee0a8aea2412073d113644bf2e1e683e5`.
- **SHA material M:** `b027adad59be5367038f0942a5f339ca8a89b2c7`.
- **HEAD de certificado H:** `0e70f7564bb532a113f32ebc660390f5513cae4a`; o único pai é M e seus oito arquivos estão na allowlist de `.audit/entregar-issue/`.
- **Merge preview material certificado:** `c639618c1ef2691b1301c0cb6c489255de94f004`. O GitHub publica preview próprio para H.
- **Transporte:** `certified-handoff`, classificador oficial executado com o SHA imutável da base.
- **Preflight do certificado:** `READY: standard delivery child ... preserves material head ...` (exit 0).
- **Escopo material:** seis arquivos de `scripts/statement-visual/`; zero arquivos alterados de produto, API, banco ou migration.

## Resumo executivo

| Critério | Resultado | Evidência |
|---|---|---|
| Certificação e identidade | Conforme | `check_delivery_preflight.py` com `--source-repository-root`, base/HEAD/parent exatos e oito paths permitidos |
| Extrato: menu, modal, anexo e identidade | Conforme | Chrome 2×, controles de modal removido, oculto e ID diferente, restauro da estrutura |
| Orçamentos: 9 → 10 persistidos via API | Conforme | POSTs, readback de IDs, negativo de 9, aceitação de 10 e mês omitido/restaurado |
| Orçamentos: vínculo ao histórico da categoria | **Incorreto** | O oráculo aceita DOM com `historyCount=0` e contagem global de linhas |
| Diagnóstico sem valores financeiros | **Incorreto** | O JSON de erro mantém `R$ 12,34` e `USD 56.78` no teste adversarial independente |
| Gate Chrome completo | Conforme | 75/75 no run material `41367758734` e 75/75 no HEAD `41368777950` |
| Repository CI | Conforme | Runs `41367758751` (M) e `41368777952` (H), com validação CRITICAL verde |
| Controle formal de completude do auditor | Conforme | `validate_audit_completeness.py` executado com Git bundle confiável e 14 paths revisados |

## Estado dos gates e alcance de testes

| Gate ou família | declared | reached | passed | Observação |
|---|---|---|---|---|
| Node focado, 3 subtestes da issue | sim | sim | sim | Execução própria com Node v22.16.0 e execução CRITICAL do GitHub |
| Chrome Extrato/anexos | sim | sim | sim | Cenário executado nas duas runs; controles reais de DOM no artefato |
| Chrome Orçamentos | sim | sim | sim | Cenário executado nas duas runs; testes adicionais refutam suficiência do oráculo |
| Chrome cobertura integral | sim | sim | sim | 67 módulos, 75 execuções, 75 fingerprints, zero falhas |
| Certificado `result-only-child` | sim | sim | sim | Preflight e objetos Git confiáveis, SHA de origem e alvo coerentes |
| Contraexemplo independente: redaction | novo adversarial | sim | falhou como desejado | Foi possível produzir JSON com valores monetários sintéticos indevidamente retidos |
| Contraexemplo independente: categoria | novo adversarial | sim | falhou como desejado | Um DOM logicamente incorreto foi aceito pelo oráculo positivo |

## Matriz de requisitos

| ID | Requisito atômico auditado | Status | Prova |
|---|---|---|---|
| R755-01 | Diagnóstico de falha discriminante e seguro | **Parcial** | Cobertura de CDP existente, mas serialização permite números financeiros |
| R755-02 | Seleção visível do Editar do Extrato e modal real sem timeout arbitrário | Implementado | `operational-attachments.mjs:73-124`; Chrome M e H |
| R755-03 | 10 períodos criados/persistidos e exibidos no histórico da categoria | **Parcial** | API/10 meses corretos; oráculo não exige história nem vínculo categorial |
| R755-04 | Negativos: modal ausente/oculto/ID errado e 9 períodos/mês omitido/restauro | Implementado para controles registrados | Artefatos de Chrome e `issue-755-ci-determinism.test.mjs` |
| R755-05 | Duas execuções completas Chrome, preservação dos 75 | Implementado | Actions `41367758734` e `41368777950`, 75/75 cada |
| R755-06 | `skill@develop`, base develop, PR própria, sem VPS ou merge | Implementado | Metadados da PR, diff imutável, certificado e ausência de merge |

## Achados bloqueantes

### A-004 — ALTO: valor financeiro é preservado em diagnóstico de erro

- **Requisitos afetados:** R755-01; compromisso expresso da [PR #756](https://github.com/crgasparoto-br/SolverFin/pull/756) de diagnóstico JSON sem valores financeiros ou payloads.
- **Origem comprovada:** candidato
- **Evidência:** [`safeErrorMessage`, linhas 160–168](https://github.com/crgasparoto-br/SolverFin/blob/b027adad59be5367038f0942a5f339ca8a89b2c7/scripts/statement-visual/issue-755-ci-determinism.mjs#L160-L168) e serialização em [`save`, linhas 235–270](https://github.com/crgasparoto-br/SolverFin/blob/b027adad59be5367038f0942a5f339ca8a89b2c7/scripts/statement-visual/issue-755-ci-determinism.mjs#L235-L270). Prova bruta: `evidence/issue-755-financial-amount-adversarial-failure.json` e `evidence/adversarial-probes.json`.
- **Caso reproduzido:** chamar a função real `watchVisualFailures(...).save()` com `new Error('Failed to create budget for amount R$ 12,34 (USD 56.78)')`. O JSON efetivamente gravado manteve literalmente `R$ 12,34` e `56.78`.
- **Causa raiz:** a sanitização oculta apenas sequências numéricas de quatro ou mais dígitos, URLs, e-mails e UUIDs; valores decimais pequenos, com separadores, permanecem intocados.
- **Impacto:** diagnóstico de exceção que inclua montantes pode vazar valores financeiros nos artefatos de CI em um cenário de falha real. Os testes atuais usam número de seis dígitos e não refutam essa variante.
- **Disposição:** `blocking`, `targeted-remediation`; não confundir com falha do runtime de auditoria.
- **Correção exigida:** não serializar mensagem de erro livre quando possa conter valores financeiros; utilizar categorias de erro e código/rota/status permitidos, ou mascaramento comprovadamente amplo com controles adversariais de formatos monetários e payloads. Reexecutar teste de vazamento e regressão no SHA material posterior.

### A-005 — ALTO: oráculo de orçamento aprova resultado sem histórico da categoria

- **Requisitos afetados:** R755-03, critérios de contagem discriminante da issue e compromisso expresso da PR com história da categoria.
- **Origem comprovada:** candidato
- **Evidência:** [`issue-755-ci-determinism.mjs`, linhas 19–40](https://github.com/crgasparoto-br/SolverFin/blob/b027adad59be5367038f0942a5f339ca8a89b2c7/scripts/statement-visual/issue-755-ci-determinism.mjs#L19-L40) soma `rendered.rows + rendered.historyCount`, usando números globais; [`issue-606-budgets-pilot.mjs`, linhas 447–459](https://github.com/crgasparoto-br/SolverFin/blob/b027adad59be5367038f0942a5f339ca8a89b2c7/scripts/statement-visual/issue-606-budgets-pilot.mjs#L447-L459) extrai todos os labels globais sem associá-los à categoria de fixture. Prova bruta: `evidence/adversarial-probes.json`.
- **Caso reproduzido:** fornecer ao oráculo a fixture válida de 10 IDs/readback e DOM com `rows=10`, `historyCount=0`, dez labels de períodos, mas **nenhum histórico da categoria**. `assertBudgetLongList` **não lança exceção**. O mesmo ocorre com 10 linhas de categorias não vinculadas ao conjunto criado.
- **Causa raiz:** o teste soma linhas de toda a tabela, não exige que os períodos apareçam na mesma categoria nem verifica cardinalidade de itens de histórico do agrupamento afetado.
- **Impacto:** uma regressão que desagrupe orçamento ou duplique linhas pode manter o gate verde mesmo após o usuário deixar de ter a visão de histórico prometida na PR. Contraria a proteção contra falsos verdes solicitada na issue.
- **Disposição:** `blocking`, `targeted-remediation`.
- **Correção exigida:** manter os 10 registros com readback e adicionar associação inequívoca `categoryId`/moeda/intervalos à linha da categoria e ao histórico renderizado, com controles negativos de histórico vazio, categoria errada, linhas duplicadas e perda de um período. Exigir que cada uma dessas variantes falhe e a restauração passe.

## Testes e validações

- `node --test scripts/statement-visual/issue-755-ci-determinism.test.mjs`: 3/3 passaram localmente, confirmando alcance dos casos positivos/negativos existentes.
- `node scripts/validate-statement-visual-coverage.mjs`: 67 módulos e 75 execuções/fingerprints preservados.
- `git diff --check base..M`: passou.
- `classify_audit_transport.py`: `certified-handoff` pela base confiável; não se autoisenta de certificado.
- `restore_ci_git_bundle.py`: restaurou Git bundle da run oficial `41368777949`; 14 arquivos alterados reconciliados com o conector GitHub.
- `check_delivery_preflight.py`: `READY`, schema v2, profile standard, parent H=M, base e subject corretos.
- `validate_audit_completeness.py`: PASS; inventário independente com 6 requisitos, 10 superfícies, 14 arquivos revisados e 2 blockers.
- Controles próprios: **duas refutações reproduzidas** em Node no SHA M; ver `independent-probes.mjs` e `evidence/adversarial-probes.json`.
- Chrome M: [run #41367758734](https://github.com/crgasparoto-br/SolverFin/actions/runs/41367758734) com artefato `13108640831`: 75/75, cenário de anexos e orçamento executados.
- Chrome H: [run #41368777950](https://github.com/crgasparoto-br/SolverFin/actions/runs/41368777950) com artefato `13108109836`: 75/75, mesmo resultado material.
- CI M/H: [#41367758751](https://github.com/crgasparoto-br/SolverFin/actions/runs/41367758751) e [#41368777952](https://github.com/crgasparoto-br/SolverFin/actions/runs/41368777952), concluídas com sucesso, não substituem auditoria.

## Próxima ação disponível

Remediar conjuntamente os achados A-004 e A-005 num novo SHA material, executar testes que refutem essas duas falhas, recertificar o filho `result-only` sem alterar produtos ou a PR #754, executar Chrome/Repository CI no SHA exato e submeter a uma nova auditoria independente. A PR permanece em draft, sem liberação para merge; nenhuma escrita/merge foi realizada durante este parecer.
