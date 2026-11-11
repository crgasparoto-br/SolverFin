# RESULTADO: REPROVADA

> **Conclusao:** `REPROVADA` — achados bloqueantes: `1` — recomendacoes opcionais: `0`
> **Motivo determinante:** O certificado de handoff vincula sete arquivos ao escopo da issue, mas o diff Git autenticado entre o inicio da entrega e o SHA material contem quinze; o preflight oficial bloqueia o certificado.
> **Libera merge/release:** NAO

**Validade:** Independente
**Triagem:** bloqueadores comprovados: `1` | riscos inferidos: `0` | limitacoes do auditor: `0`

**Rejection ID:** `audit-rejection:2d877402-971a-4906-b0e4-f4f13cde773c`

# Auditoria independente da PR #756 — Issue #755

**Data:** 2 de novembro de 2026.

## Escopo e identidade congelada

- **Repositorio:** `crgasparoto-br/SolverFin`.
- **PR:** https://github.com/crgasparoto-br/SolverFin/pull/756 (aberta, draft, sem merge).
- **Issue vinculada:** https://github.com/crgasparoto-br/SolverFin/issues/755.
- **Base:** `develop@36cbfb7ee0a8aea2412073d113644bf2e1e683e5` (snapshot da PR).
- **Branch:** `fix/755-chrome-fixture-determinism`.
- **Material M:** `4150fb3545a7bbdf5079e5032cdc50e5ab6b2cb9`.
- **Handoff H:** `b86730805450cd96fd1a7fd0a687bb0488b17e8a`, pai direto M.
- **Preview material:** `8a9a2d8025fe1d8546e79e0a4eaa56a1d615107e`.
- **Preview corrente H:** `f0d574bca4983a568f32d45c19cef826f572ca31`.
- **Skill oficial:** `crgasparoto-br/skill@develop`, SHA `2ee50f7897b52de61558eb64416403f1bcbdd9f6`.
- **Modo de transporte:** `certified-handoff`, conforme classificador oficial sobre base imutavel sem contrato GitHub-native confiavel.
- **Evidencia de escopo:** `git diff --name-only B M` em bundle autenticado pelo run 41382949666, confirmado independentemente pelo endpoint GitHub `compare/B...M`.
- **Estado remoto final:** PR aberta, em draft, HEAD e base identicos aos valores congelados.

## Resumo executivo

A PR corrige o harness Chrome de anexos, orcamentos e diagnosticos. Os controles funcionais e a privacidade dos diagnosticos apresentaram evidencias positivas, controles negativos e regressao efetivamente executados. A infraestrutura de CI e o gate Chrome passaram nos SHAs exatos.

Contudo, o certificado publica `scope.work_item_start_sha=B` e `scope.material_head_sha=M`, mas reduz `scope.issue_changed_paths` a sete scripts, excluindo oito arquivos `.audit/entregar-issue/` que tambem fazem parte do delta real B..M. O gate oficial rejeita a divergencia. Portanto, este parecer reprova a prontidao da certificacao, nao atribui regressao funcional nova aos scripts.

**Resumo:** 6 criterios de aceite examinados; 5 com evidencia funcional/operacional positiva e 1 bloqueado por inconsistencia formal de escopo. Nenhuma recomendacao opcional adicionada.

## Estado dos gates e alcance dos testes

| Gate/familia | Estado | Declarado | Alcancado | Passou | Evidencia |
|---|---|---|---|---|---|
| Repository CI material | green | sim | sim | sim | [Run #41381655011](https://github.com/crgasparoto-br/SolverFin/actions/runs/41381655011), CRITICAL, formatacao, lint, testes, integracao e build |
| Chrome material | green | sim | sim | sim | [Run #41381654966](https://github.com/crgasparoto-br/SolverFin/actions/runs/41381654966), 75/75, artefato 13114220297 |
| Testes focados Node | green | sim | sim | sim | `node --test scripts/statement-visual/issue-755-ci-determinism.test.mjs` no M: 3/3 |
| Repository CI handoff | green | sim | sim | sim | [Run #41382949710](https://github.com/crgasparoto-br/SolverFin/actions/runs/41382949710) |
| Chrome handoff | green | sim | sim | sim | [Run #41382949700](https://github.com/crgasparoto-br/SolverFin/actions/runs/41382949700), 75/75 |
| Bundle autenticado H | green | sim | sim | sim | [Delivery audit workspace #41382949666](https://github.com/crgasparoto-br/SolverFin/actions/runs/41382949666), artifact 13114306163, restorer oficial confirmou SHA/base/head |
| Integridade do escopo do handoff | **red-candidate-caused** | sim | sim | **nao** | `check_delivery_preflight.py`: `BLOCK: certificate issue_changed_paths differ from observed work-item delta` |

`blocker_bounded=true`: apos o bloqueio contratual, foi feita varredura estatica dos arquivos materiais, evidencias Chrome, teste Node direcionado, rechecagem de escopo e historico da reprovacao anterior. A aprovacao integral e o gate completo de auditoria nao foram reivindicados nem contornados. Evidencias CI verdes foram reutilizadas somente nos seus respectivos escopos.

## Matriz de requisitos

| Requisito da issue #755 | Evidencia rederivada | Status |
|---|---|---|
| R-755-01 — Reproduzir falhas com estados de DOM, fixture, console e rede, separando harness de produto | `watchVisualFailures` captura estagios, contagens e classes sem payload sensivel; teste Node focado 3/3 e Chrome real | Implementado para o harness auditado |
| R-755-02 — Corrigir acesso ao modal de anexo do Extrato sem alongar timeout ou ocultar falha | `operational-attachments.mjs` abre menu real, valida hit-test, modal, disclosure e identidade; controles reais ausente/oculto/ID errado rejeitam | Implementado |
| R-755-03 — Garantir dez ou mais periodos deterministas na API e lista de orcamentos | POST de 9 e de 10 periodos, readback de IDs/categoria/moeda/datas; DOM exige linha unica e 9 meses de historico | Implementado |
| R-755-04 — Controles negativos e restauracao | Artefatos Chrome confirmam rejeicao de nove periodos, mes ausente, historico ausente, categoria errada, duplicidade, modal ausente/oculto e ID incorreto, com restauracao aprovada | Implementado |
| R-755-05 — Manter 75 cenarios e execucoes independentes | Chrome material e handoff 75/75; registro visual 75 unidades e 75 fingerprints; testes focados Node passaram | Implementado |
| R-755-06 — Seguir a Skill, usar develop, PR propria, sem VPS/merge automatico e certificacao valida | Branch e CI conformes; porem certificado declara 7 caminhos em vez de 15 no escopo B..M | **Incorreto na certificacao** |

## Achados bloqueantes

### A-006 — [ALTO] Escopo de alteracoes do certificado diverge do delta Git real

- **Requisitos afetados:** R-755-06 e invariante `scope.issue_changed_paths` do handoff certificado.
- **Origem comprovada:** entrega
- **Evidência:** o Git autentico em `36cbfb7ee0a8aea2412073d113644bf2e1e683e5..4150fb3545a7bbdf5079e5032cdc50e5ab6b2cb9` lista 15 caminhos, enquanto o certificado em https://github.com/crgasparoto-br/SolverFin/blob/b86730805450cd96fd1a7fd0a687bb0488b17e8a/.audit/entregar-issue/handoff-ready.json declara sete. O endpoint `compare/B...M` da API GitHub retorna o mesmo conjunto. O validador oficial `auditar-issue/scripts/check_delivery_preflight.py`, alimentado com os 15 caminhos observados e os 12 caminhos de M..H, termina com `BLOCK: certificate issue_changed_paths differ from observed work-item delta` e `RECOVERY: handoff-only`.
- **Caminhos ausentes no certificado:** `.audit/entregar-issue/code-growth.json`, `.audit/entregar-issue/codebase-grounding.json`, `.audit/entregar-issue/evidence/issue-755-focused-test-execution.txt`, `.audit/entregar-issue/handoff-ready.json`, `.audit/entregar-issue/requirement-closure.json`, `.audit/entregar-issue/specification-snapshot.json`, `.audit/entregar-issue/specification-sources/SRC-ISSUE.txt`, `.audit/entregar-issue/standard-evidence.json`.
- **Controle discriminante:** o mesmo validador retorna `READY` apenas numa variante diagnostica artificial alimentada com a lista incompleta de 7 caminhos. Isso demonstra que o desvio e de integridade entre escopo declarado e observacao real, e que o parecer nao deve aceitar a lista fornecida pelo produtor como fonte autoritativa.
- **Solicitado:** escopo total, reproduzivel e vinculado ao SHA material, validado contra o diff Git efetivo.
- **Encontrado:** descricao reduzida do diff, que nao passa pelo preflight oficial quando o auditor informa o inventario integral.
- **Impacto:** o handoff nao pode provar a integridade do escopo nem obter aprovacao auditavel. O CI verde, por si so, nao repara a incongruencia.
- **Lacuna a corrigir:** recertificar a entrega com escopo completo B..M (incluindo os oito caminhos `.audit` historicos) e recomputar o delta hash, validando o handoff contra o delta integral. Nao forcar a aprovacao passando apenas a lista declarada; preservar SHA M caso nao haja alteracao material adicional.
- **Disposicao:** `blocking`.
- **Remediation mode:** `targeted-remediation`.
- **Recuperacao:** `handoff-only` segundo o validador oficial; `requires_refreeze=false` enquanto M permanecer imutavel.

## Verificacao dos achados anteriores

Os IDs A-004 (vazamento de valores monetarios em diagnosticos) e A-005 (oraculo de historico que aceitava registros de outra categoria) da reprovacao `audit-rejection:1bc557a9-4ae9-4fd9-ab6d-d815019e7ba2` foram comparados com o codigo material atual, testes reais do Chrome e o ledger `audit-remediation.json`. Nao se observou persistencia desses dois defeitos nas superficies examinadas. O novo bloqueio A-006 e **distinto** deles e nao exige repeticao cega de toda CI.

## Integridade do filho de resultados

O objeto Git remoto confirma `parent(H)==M`. Os 12 arquivos alterados em M..H ficam integralmente sob `.audit/entregar-issue/`, na allowlist de `certificate_commit_policy.allowed_paths`; isso e valido. O problema nao e o ultimo commit H, mas a ligacao entre o snapshot B, o material M e a lista parcial de caminhos da issue. Os nove artefatos JSON declarados no certificado foram recalculados por SHA-256 e coincidiram; hashes validos de arquivos individuais nao corrigem uma lista de escopo incompleta.

## Fronteira de privacidade e controles negativos

- `safeErrorMessage` converte erros arbitrarios a categorias seguras; nao persiste mensagem livre, CPF, nome, e-mail ou valores financeiros.
- `safeEndpoint` suprime valores de IDs e query strings; eventos CDP sao limitados e nao persistem corpos de requisicao.
- Teste local Node com injecoes `R$ 12,34`, `USD 56.78`, CPF e e-mail passou; o artefato final nao preservou esses literais.
- Chrome material `issue-606-budgets-pilot.json` comprovou nove versus dez registros, leituras pela API, mutacoes adversariais no DOM e restauracao.
- Chrome material `operational-attachments-0-lancamentos-attachment-lifecycle.json` comprovou negativas reais de modal ausente, modal oculto e ID incorreto, com restauracao.

## Pendencias objetivas

1. Corrigir exclusivamente o escopo/delta SHA-256 no certificado para corresponder ao conjunto integral B..M. Preservar a historia Git: os arquivos `.audit` incluidos no delta nao desaparecem por serem artefatos intermediarios.
2. Regenerar o handoff sem modificar codigo material, se possivel, e executar `check_delivery_preflight.py` alimentando-o com a **lista observada independentemente de 15 caminhos**; somente `READY` nesse teste fecha A-006.
3. Auditar novamente o SHA resultante em contexto independente. Nao considerar CI verde nem `READY` artificial com somente sete caminhos como aprovacao. Nao fazer merge ate o bloqueio ser fechado.

**Proxima fase para remediacao:** `handoff-only`, sem necessidade de novo ciclo de build/Chrome no SHA M caso nenhuma fonte material mude; certificar novamente o resultado e revalidar HEAD/base.

## Garantias e limites do parecer

Esta auditoria usou fonte GitHub remota independente, bundles do CI autenticados, os scripts da Skill oficial, testes locais e evidencias brutas do Chrome. Nao foi produzido artefato `external-audit.json` assinado por uma chave de auditoria previamente confiada; portanto este relatorio nao reivindica aprovacao criptograficamente importavel nem substitui o check de auditoria independente registrado na infraestrutura.

**Operacoes remotas executadas:** apenas leituras; nenhum comentario, review, commit, issue, merge ou reexecucao de workflow efetuados.
