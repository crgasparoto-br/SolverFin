# RESULTADO: REPROVADA

> **Conclusao:** `REPROVADA` — achados bloqueantes: `3` — recomendacoes opcionais: `0`
> **Motivo determinante:** A PR #807 apresenta defeito visual comprovado nas abas, três testes Chrome sem adaptação para a navegação nova e ausência do handoff certificado para a identidade auditada.
> **Libera merge/release:** NAO

**Validade:** Independente
**Triagem:** bloqueadores comprovados: `3` | riscos inferidos: `0` | limitacoes do auditor: `0`

**Rejection ID:** `audit-rejection:622fe8b6-a43a-4408-a377-4145f7a5f67c`

## Escopo auditado

| Item | Evidência |
|---|---|
| Repositório | [crgasparoto-br/SolverFin](https://github.com/crgasparoto-br/SolverFin) |
| Pull request | [#807 — Refatoração Inbox](https://github.com/crgasparoto-br/SolverFin/pull/807), aberta; 13 arquivos alterados, 20 commits |
| Issue | [#806 — Refatorar Inbox com abas](https://github.com/crgasparoto-br/SolverFin/issues/806), aberta |
| Base protegida | `develop` / `56e7549df6262c91173bf5bb250b722ba5b80c01` |
| HEAD material | `2f202aedf58a2866c69659d260984e2d0bc43334` |
| Merge preview observado | `eceda67c8c240cf1248a2b3586027bb2fd386e1b` |
| Transporte oficial de auditoria | `certified-handoff`; sem contrato GitHub-native no SHA da base |
| Handoff corrente | Não produzido; arquivo presente herdado da base, da issue #695/PR #796 |

A revisão foi feita em sessão dedicada, somente leitura, com o bundle Git de [Delivery audit workspace #44554961494](https://github.com/crgasparoto-br/SolverFin/actions/runs/44554961494), restauro do checkout exato e confronto com metadados remotos. Foram reconciliados os 13 caminhos alterados, os contratos da skill oficial `crgasparoto-br/skill` na branch `develop` e as evidências de execução do Chrome 157. O validador oficial de completude (`validate_audit_completeness.py`) aprovou a reconciliação do inventário e relatório; isso valida a cobertura do parecer, não a implementação.

## Estado dos gates e testes

| Portão | Declared | Reached | Passed | Resultado |
|---|---|---|---|---|
| [Repository CI #44554961662](https://github.com/crgasparoto-br/SolverFin/actions/runs/44554961662): formato, lint, typecheck, testes, integração, build, merge preview e Delivery V2 | Sim | Sim | Sim | Verde |
| [Delivery audit workspace #44554961494](https://github.com/crgasparoto-br/SolverFin/actions/runs/44554961494): bundle autenticado | Sim | Sim | Sim | Verde |
| [Statement visual validation #44554961440](https://github.com/crgasparoto-br/SolverFin/actions/runs/44554961440): 77 cenários registrados | Sim | Sim | Não | **4 cenários falharam** |
| [Verify certified handoff provenance #44554961495](https://github.com/crgasparoto-br/SolverFin/actions/runs/44554961495) | Sim | Sim | Não | `handoff subject mismatch` |
| [Session review evidence #44554961447](https://github.com/crgasparoto-br/SolverFin/actions/runs/44554961447) | Sim | Sim | Não | `exact SHA certificate is not bound to this PR` |

Observação: os testes positivos e negativos de governança do workflow de sessão foram alcançados e passaram (154 testes pytest e 157 testes Node/JUnit); a publicação da evidência assinada foi bloqueada na etapa seguinte de vínculo do certificado. Esses testes não substituem o artefato certificado.

## Matriz dos critérios de aceite da issue #806

| Critério | Estado auditado | Justificativa |
|---|---|---|
| Quatro abas e apenas painel ativo visível | **Implementado estruturalmente** | `inbox-tabs.ts` e Chrome confirmam quatro papéis ARIA, quatro painéis e isolamento visual; outros painéis ficam montados |
| Revisões, filtros, evidência e decisões | **Parcialmente comprovado** | Testes de UI registram evidência pronta, filtros e isolamento; inspeção visual completa não obteve portão verde |
| Importações CSV/OFX e mensagens | **Parcialmente comprovado** | Ações estão nos contextos corretos e testes próprios de importação passaram; cenário de retry de mensagem permanece vermelho por não ativar a aba Mensagens |
| Insights, paginação, URLs e filtros | **Parcialmente comprovado** | Rotas `?tab=`, `?importBatchId=` e `#financial-insights` são resolvidas; teste de estado DOM cobre histórico e query, mas o aceite Chrome total está pendente |
| Teclado, ARIA e estados acessíveis | **Parcialmente comprovado** | Seleção, setas/Home/End e semântica passam no Chrome; destaque visual de selecionado não corresponde aos tokens |
| Golden Screen desktop/mobile | **Incorreto** | Estado selecionado usa cor/fundo/borda iguais aos da aba inativa, comprovado no Chrome e explicado pela especificidade do CSS |
| Testes executados e limitações registradas | **Atendido quanto à execução**, não quanto ao aceite final | CI principal executado; 4 falhas visuais e 2 falhas de certificado explicitadas |
| Inspeção visual obrigatória | **Não concluída com sucesso** | Quatro cenários falharam no workflow real; não há comprovação terminal verde para o conjunto |

Os itens já marcados na issue foram respeitados apenas como histórico; nenhum checkbox foi modificado pela auditoria. Checklist não equivale a aprovação independente.

## Achados bloqueantes

### A-001 — Abas ativas não têm diferenciação visual Golden Screen

- **Requisitos afetados:** R-006 — critério de aparência Golden Screen no desktop/mobile e estados corretos da aba.
- **Origem comprovada:** candidato
- **Evidência:** [inbox-tabs.ts:29-39](https://github.com/crgasparoto-br/SolverFin/blob/2f202aedf58a2866c69659d260984e2d0bc43334/apps/web/src/dev-server/inbox-tabs.ts#L29-L39), [inbox-tabs.ts:77-108](https://github.com/crgasparoto-br/SolverFin/blob/2f202aedf58a2866c69659d260984e2d0bc43334/apps/web/src/dev-server/inbox-tabs.ts#L77-L108), [shared-styles.ts:149-171](https://github.com/crgasparoto-br/SolverFin/blob/2f202aedf58a2866c69659d260984e2d0bc43334/apps/web/src/dev-server/shared-styles.ts#L149-L171) e [Chrome run #44554961440](https://github.com/crgasparoto-br/SolverFin/actions/runs/44554961440).
- **Severidade:** Alta, `disposition=blocking`, `root_cause=css-specificity`.
- **Caso literal:** No viewport 390×844, `nav.background` e `activeTab.background` são ambos `rgb(255,255,255)` e a borda inferior de ambos é `rgb(226,232,240)`; `golden.tokenMatch=false`. A aba Revisões selecionada não exibe a cor de fundo ou borda ativa definida nos tokens.
- **Causa raiz:** O atributo `data-button-variant="neutral"` é aplicado às abas, porém a regra global de botões neutros com seletores `:not(...)` tem especificidade superior à regra de estado `aria-selected="true"` do componente novo; o navegador aplica estilo neutro a ambas.
- **Impacto:** Distinção visual insuficiente da aba selecionada e falha no cenário `ai-review-queue`.
- **Correção requerida:** Desacoplar o componente de abas da variante neutra global ou fazer uma regra semântica de precedência compatível com os tokens; comprovar repouso, selecionado, foco, hover e ativo nos tamanhos mobile/desktop.

### A-002 — Testes visuais legados não foram integralmente migrados para abas

- **Requisitos afetados:** R-007 e R-008 — regressões e inspeção visual efetiva da nova navegação.
- **Origem comprovada:** candidato
- **Evidência:** [Visual validation #44554961440](https://github.com/crgasparoto-br/SolverFin/actions/runs/44554961440), [inbox-interface-refinement.mjs:123-128](https://github.com/crgasparoto-br/SolverFin/blob/2f202aedf58a2866c69659d260984e2d0bc43334/scripts/statement-visual/inbox-interface-refinement.mjs#L123-L128), [bank-message-ai-inbox.mjs:72-81](https://github.com/crgasparoto-br/SolverFin/blob/2f202aedf58a2866c69659d260984e2d0bc43334/scripts/statement-visual/bank-message-ai-inbox.mjs#L72-L81).
- **Severidade:** Alta, `disposition=blocking`, `root_cause=outdated-visual-oracles`.
- **Casos literais:** `inbox-interface-refinement` e `inbox-interface-accessibility` classificam como overflow a aba **Insights** que ultrapassa os limites internos de um `tablist` com rolagem horizontal; o próprio documento confirma `bodyFitsViewport=true` e `navScrollsHorizontally=true`, portanto **não se comprovou overflow do viewport**. `bank-message-ai-inbox` espera o botão de retry visível enquanto a URL abre por padrão Revisões, não Mensagens.
- **Impacto:** Três cenários vermelhos adicionais no conjunto visual; não comprovam, por si, falha no fluxo de retry nem overflow real, mas retiram a confiabilidade do oráculo de aceite.
- **Correção requerida:** Atualizar o teste de largura para distinguir rolagem interna intencional de overflow do documento; selecionar Mensagens antes de exercitar retry e verificar a interação real. Reexecutar o conjunto Chrome completo.

### A-003 — Handoff exato da PR #807 não foi produzido

- **Requisitos afetados:** R-009 — identidade imutável, pacote de entrega e auditoria independente da issue #806.
- **Origem comprovada:** entrega
- **Evidência:** [provenance run #44554961495](https://github.com/crgasparoto-br/SolverFin/actions/runs/44554961495), [session evidence run #44554961447](https://github.com/crgasparoto-br/SolverFin/actions/runs/44554961447), [handoff herdado](https://github.com/crgasparoto-br/SolverFin/blob/2f202aedf58a2866c69659d260984e2d0bc43334/.audit/entregar-issue/handoff-ready.json).
- **Severidade:** Alta, `disposition=blocking`, `root_cause=handoff-not-produced`.
- **Caso literal:** O mesmo Git blob (`0a53c65d8e0076286766aa8c2fe9b780546e8aba`) existe na base e no HEAD e referencia issue **#695**, PR **#796** e SHA `4296b6778da8f457e99557fe53d9be25412d10e0`; o alvo atual é issue **#806**, PR **#807**, SHA `2f202aedf58a2866c69659d260984e2d0bc43334`. O artefato é **inherited-base-artifact**, não certificado criado incorretamente pela issue #806.
- **Impacto:** Falham dois portões de procedência; a aprovação independente não pode ser consumida.
- **Correção requerida:** Após correções funcionais, produzir e validar handoff vinculado ao novo SHA material e à issue/PR corretas, respeitando a política `result-only-child` quando aplicável. Não reutilizar nem falsificar o certificado da issue anterior.

## Decisão técnica e próxima etapa

A arquitetura de abas está implementada, com isolamento de painéis e fluxo de navegação por teclado básico. No entanto, a PR não está pronta para merge porque um defeito visual é reproduzível, três testes visuais usam premissas anteriores à mudança e os gates certificados recusam a identidade. A remediação deve corrigir os dois grupos de problemas de interface/validadores, obter o workflow visual totalmente verde no SHA definitivo, gerar o pacote certificado correspondente e submeter a reauditoria independente. O CI principal verde e a propriedade `mergeable=true` não alteram este resultado.

**Estado ao encerramento do exame:** PR aberta, HEAD acima congelado, base `develop` revalidada por GitHub remoto, nenhum merge, nenhum commit, nenhuma issue ou checkbox alterado. Cobertura de fontes, testes e arquivos: 13/13 arquivos revisados, 9 obrigações mapeadas e 10 famílias/superfícies reconciliadas pelo validador oficial.
