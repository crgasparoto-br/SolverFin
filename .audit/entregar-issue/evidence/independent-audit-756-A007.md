# RESULTADO: REPROVADA

> **Conclusao:** `REPROVADA` — achados bloqueantes: `1` — recomendacoes opcionais: `0`
> **Motivo determinante:** Um campo arbitrario de classe de excecao CDP atravessa o redator e e persistido no JSON de falha, contrariando a restricao de privacidade da issue #755.
> **Libera merge/release:** NAO

**Validade:** Independente
**Triagem:** bloqueadores comprovados: `1` | riscos inferidos: `0` | limitacoes do auditor: `0`

**Rejection ID:** `audit-rejection:50e1f167-0d18-4a96-a859-eb5d5a824245`

# Auditoria independente PR #756 - SolverFin / issue #755

**Data:** 2 de novembro de 2026. **Modo de transporte:** `certified-handoff`, classificado com contrato oficial da Skill na base imutavel. **Sem escritas no candidato nem merge.**

## Identidade congelada

- PR: https://github.com/crgasparoto-br/SolverFin/pull/756; issue: https://github.com/crgasparoto-br/SolverFin/issues/755.
- Base remota: `develop@06409277b5ad2f5e7af1e26c743986ab1a6e32c3`. Branch da PR: `fix/755-chrome-fixture-determinism`.
- Material M: `4150fb3545a7bbdf5079e5032cdc50e5ab6b2cb9`. Handoff H (HEAD auditado): `73aee32f3a4130fc077d7900eac276b2bbc11533`.
- Work item start: `36cbfb7ee0a8aea2412073d113644bf2e1e683e5`.
- 26 caminhos no diff da PR; 15 em B..M (7 scripts Chrome + 8 historicos .audit) e 17 paths exclusivamente .audit no filho M..H.
- Skill oficial autenticada: `crgasparoto-br/skill@develop`, commit `2ee50f7897b52de61558eb64416403f1bcbdd9f6` obtido pelo artefato do GitHub Actions.

## Motivo determinante

A implementacao `scripts/statement-visual/issue-755-ci-determinism.mjs:183-192` filtra o nome da classe de excecao do Chrome somente por `/^[A-Za-z]+Error$/`. Qualquer string formada por letras e terminada em `Error`, incluindo um identificador de pessoa, passa sem categorizacao. Em `:233-252`, a classe e escrita literalmente no JSON de falha. A mensagem `error.message` e sanitizada corretamente; a exposicao ocorre no campo independente `browserErrors[].className`.

O controle independente executou Chromium 144 real, produziu a excecao sintética `class MariaAccountError extends Error` e chamou a rotina real `watchVisualFailures(...).save(...)`. O JSON emitido incluiu `browserErrors:[{"className":"MariaAccountError","lineNumber":2}]`. Nenhuma pessoa nem dado bancario real foi usado. O identificador sintetico serve para refutar a garantia de nao serializar nomes provenientes de eventos externos do navegador. O proprio watcher aceita tambem `request.method` sem enumeracao segura; este segundo vetor foi demonstrado com CDP de teste, nao presumido como vazamento real ocorrido em producao.

**Contraexemplo bruto:** `evidence/chromium-privacy-counterexample.json`, reproduzido contra o mesmo arquivo material no SHA M; complementar `evidence/adversarial-cdp.log`. A prova real usa Chromium, nao apenas teste simulado.

## Escopo e criterios da issue #755

| Criterio | Resultado independente | Prova |
|---|---|---|
| Diagnostico de DOM, fixture, rede e console | Implementado para falhas instrumentadas | `watchVisualFailures` e testes focados 3/3 |
| Diagnostico sem valores/payload sensiveis | **Incorreto** | excecao do Chromium real com classe nominal persistida |
| Anexos do Extrato com menu aberto, modal e identidade | Validado | Chrome real, modal ausente/oculto/ID errado rejeitados |
| Orcamentos com 10 periodos pela API | Validado | 9 criados e relidos, 10 criados e relidos |
| Historico de nove meses na unica linha da categoria | Validado | oraculo DOM e negativos de mes/categoria/duplicidade |
| Restauracao dos estados apos mutacoes | Validada | artefatos reais dos dois cenarios |
| 75 cenarios sem desabilitar cobertura | Validado | registrador 67 modulos, 75 unidades, 75 fingerprints; workflow 75/75 |
| Branch develop, PR propria, sem VPS ou merge | Validado | Git refs e GitHub Actions exatos |
| Escopo/certificado M-H, crescimento e ancoragem | Validado | validador oficial READY; Git delta e hashes conferidos |

## Estado de gates e evidencias

| Controle | Resultado | Fonte exata |
|---|---|---|
| Repository CI H | **success** | https://github.com/crgasparoto-br/SolverFin/actions/runs/41443033110 (CRITICAL, integracao e build) |
| Chrome H | **success**, 75/75 e zero falhas | https://github.com/crgasparoto-br/SolverFin/actions/runs/41443033111, artifact `13142490291` |
| Audit workspace H | **success** | https://github.com/crgasparoto-br/SolverFin/actions/runs/41443033125, trusted Git bundle `13140412712` |
| Teste focado Node M | **success**, 3/3 | `node --test scripts/statement-visual/issue-755-ci-determinism.test.mjs` |
| Cobertura visual | **success**, 75/75 registrados | `node scripts/validate-statement-visual-coverage.mjs` |
| Handoff terminal / preflight | **READY** / **READY** | validadores oficiais com B..M=15 paths e M..H=17 paths |
| Verificador de completude da auditoria | **PASS** | 9 obrigacoes, 16 superficies, 26 paths, 3 findings historicos |
| Privacidade adversarial Chromium | **FAIL do requisito**, reproduzido | `scripts/statement-visual/issue-755-ci-determinism.mjs:183-192` |

Os checks verdes nao foram tratados como evidencia unica de conclusao. Foram examinados os arquivos fonte, testes e os JSONs autenticos de Chrome no SHA H, incluindo `issue-606-budgets-pilot.json` e `operational-attachments-0-lancamentos-attachment-lifecycle.json`.

## Achados bloqueantes

### A-007 - [ALTO] Metadados de excecao CDP nao sao sanitizados por lista de permissoes

- **Requisitos afetados:** criterio 1 da issue #755 (evidencias de falha sem valores financeiros/payloads), mais a obrigacao de privacidade R-02.
- **Origem comprovada:** candidato
- **Evidência:** no material `4150fb3545a7bbdf5079e5032cdc50e5ab6b2cb9`, `scripts/statement-visual/issue-755-ci-determinism.mjs:183-192` copia qualquer classe textual com letras e sufixo `Error`; `scripts/statement-visual/issue-755-ci-determinism.mjs:233-252` a serializa. Execucao Chromium real reproduziu `MariaAccountError` em `browserErrors[0].className`, registrado em `evidence/chromium-privacy-counterexample.json`. Controle de CDP de teste mostrou tambem `request.method` propagado sem enum em `evidence/adversarial-cdp.log`.
- **Implementacao plausivelmente errada refutada:** sanitizar apenas `error.message`, queries, URLs e formatos decimais, mas deixar metadados CDP textuais arbitrarios em excecoes e metodos HTTP.
- **Impacto:** campos com nome/identificador introduzido em excecao customizada podem persistir no artefato de falha apesar da afirmacao de privacidade; nao ha evidencia de vazamento de dados financeiros reais nesta auditoria.
- **Disposicao:** `blocking`, `targeted-remediation`.
- **Correcao objetiva:** usar lista fechada de classes de excecao permitidas (ex. classes JavaScript estaveis) e verbos HTTP conhecidos; todos os valores inesperados devem virar categorias fixas. Cobrir com regressao real Chromium/CDP para classe customizada contendo nome sintetico, metodo inesperado e erro monetario, verificando o JSON final sem payloads, antes de recertificar novo M/H.

## Reauditoria dos achados anteriores

| Achado historico | Disposicao | Comprovacao independente |
|---|---|---|
| A-004 - valores decimais em `error.message` | **resolved** na superficie originalmente identificada | allowlist `safeErrorMessage`; 3/3 Node com BRL/USD, CPF e e-mail. A-007 e novo ponto de entrada CDP, nao a mesma implementacao antiga |
| A-005 - oraculo de orcamento sem historico da mesma categoria | **resolved** | readback de ID/moeda/categoria/datas; Chrome rejeita 9 registros, historico ausente, mes ausente, categoria incorreta e linha duplicada; restauracao aprovada |
| A-006 - escopo do handoff incompleto | **resolved** | Git B..M lista 15 caminhos; certificate `issue_changed_paths` contem os 15, digest valido; H e filho direto M somente com 17 arquivos `.audit`; preflight e terminal READY |

A integridade dos nove artefatos declarados no certificado foi comparada por SHA-256 independente. Nenhum resultado ou comentario da implementacao foi usado isoladamente como atestacao.

## Recomendacao para fechamento em um ciclo

Corrigir **apenas** as duas entradas de texto nao-confinadas no watcher (classe da excecao e metodo HTTP), acrescentar teste negativo que execute o evento customizado pelo Chromium real e cheque o JSON serializado, executar o teste focado, a CI completa e o Chrome 75/75 no novo material, regenerar o handoff result-only H para a base remota atual e submeter **uma** nova auditoria do SHA composto. O codigo de produto, API e banco nao precisa ser alterado para este achado.

**Nenhuma alteracao, merge, rerun remoto ou exclusao foi executada por esta auditoria.** O parecer e independente nesta conversa, mas nao reivindica assinatura criptografica do verificador externo nem substitui um check GitHub de aprovacao formal registrado por identidade confiada.
