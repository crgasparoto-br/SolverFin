# RESULTADO: REPROVADA

> **Conclusao:** `REPROVADA` — achados bloqueantes: `3` — recomendacoes opcionais: `0`
> **Motivo determinante:** o Chrome exact-SHA comprova overflow e reflow incorreto em Configurações; a matriz de capturas está incompleta e o certificado do alvo #727 não foi produzido.
> **Libera merge/release:** NAO

**Validade:** Independente
**Triagem:** bloqueadores comprovados: `3` | riscos inferidos: `0` | limitacoes do auditor: `1`

**Rejection ID:** `audit-rejection:b37bcd2a-80ad-4336-a184-c098141e37dc`

## Auditoria da implementacao — issue #727 / PR #758

**Escopo:** `crgasparoto-br/SolverFin`, issue [#727](https://github.com/crgasparoto-br/SolverFin/issues/727), PR [#758](https://github.com/crgasparoto-br/SolverFin/pull/758), branch `feat/727-golden-settings-contextual-actions` contra `develop`.

**Identidade material revalidada:** head `20d96df765d52f54160249fb56095a053ad66c11`; base e `develop` `a11e9d72a1ec7e9c563720b7beb91e77ecdde830`. PR aberta em Draft. Auditoria somente leitura em contexto distinto da implementação, sem assinatura externa importável.

**Skill oficial:** `crgasparoto-br/skill@develop`, `auditar-issue`, com preflight do transporte: `certified-handoff` (`no-trusted-native-contract`), verificado por `scripts/classify_audit_transport.py` sobre o SHA imutável da base.

### Resumo executivo

- A refatoração está integrada ao renderer SSR e mantém uma ação primária por aba no código; a navegação entre tabs e os diálogos foram exercitados no Chrome.
- O run [Repository CI #41640527387](https://github.com/crgasparoto-br/SolverFin/actions/runs/41640527387) terminou `success` para o HEAD auditado, com lint, typecheck, testes, integração e build na validação CRITICAL.
- O run [Statement visual validation #41640527380](https://github.com/crgasparoto-br/SolverFin/actions/runs/41640527380) terminou `failure` no mesmo SHA, com **duas falhas diretamente em `/configuracoes`**, além de uma terceira em `/inbox` cuja origem não foi atribuída a esta PR.
- O artefato autenticado `statement-visual-evidence-20d96df765d52f54160249fb56095a053ad66c11` (ID GitHub `13232789357`) contém `settings-interface.json`, `settings-interface-reservations.json`, capturas e `visual-gate-index.json`, que foram inspecionados localmente.

## Estado dos gates e alcance de testes

| Gate / família | Estado | Declarado | Executado | Aprovado | Evidência |
|---|---|---:|---:|---:|---|
| Lint, typecheck, teste SSR, testes de integração, build | `green` | sim | sim | sim | Repository CI #41640527387, CRITICAL validation |
| Chrome `/configuracoes`, `settings-interface` | `red-candidate-caused` | sim | sim | não | Chrome #41640527380, run log 13:08:36–13:08:39 UTC, artefato `settings-interface.json` |
| Chrome `/configuracoes`, `settings-interface-reservations` | `red-candidate-caused` | sim | sim | não | Mesmo run, log 13:08:45–13:08:48 UTC, `settings-interface-reservations.json` |
| Chrome `/inbox`, `category-learning` | `red-inherited-or-unattributed` | sim | sim | não | Mesmo run, `issue-564-category-learning.mjs:94`; arquivo fora do diff da PR |
| Pacote de capturas requerido pela issue | `missing` | parcial | parcial | não | Inventário de arquivos do artefato exact-SHA e `scripts/statement-visual/settings-interface-adversarial.mjs` |
| Certificação do alvo #727 | `missing` | não | não | não | Blob Git idêntico na base/head, `subject` de #726/#754 |

**Nota de alcance:** os testes de fluxo real de reservas registram `mutationCoverage.profileCreate`, `profileEdit`, `profileArchive`, `ruleCreate`, `ruleInactivate` e `rulesApply` como `true`, mas o cenário completo falha em zoom de texto. O teste de nome longo registra `wrapped=true` e `truncationRejected=true` em 320 px; falha `noHorizontalOverflow=false` e `restored=false`.

## Matriz de requisitos

| ID | Critério da issue #727 | Situação | Prova / ressalva |
|---|---|---|---|
| REQ-01 | Baseline Chrome anterior à mudança | Parcial | Run histórico #40811518620 verde em outro HEAD; divergência declarada, não re-homologada aqui |
| REQ-02 | Hierarquia, única ação primária e destaque contextual | Implementado parcialmente | SSR e Chrome reportam `primaryCount=1` e controle de ação concorrente aprovado; acabamento geral não aprovado no mobile |
| REQ-03 | Perfis e regras legíveis, inclusive conteúdo longo, 320 px e 200% | Incorreto | Overflow real e falha de restauração do teste negativo |
| REQ-04 | Capturas das duas tabs em repouso, vazio/erro, novo/editar e formulário | Parcial | Capturas de repouso e novo existem; não há capturas identificáveis de edit/vazio/erro dos dois contextos |
| REQ-05 | Foco, Escape, labels, retorno ao acionador | Parcial | Teste de teclado no Chrome alcançado; suite visual total vermelha e cobertura dos estados de editar/erro não comprovada |
| REQ-06 | Criar, editar e arquivar perfis; criar, inativar e aplicar regras | Implementado com ressalva de evidência | Seis operações reais passaram em `mutationCoverage`; a família ainda falha em reflow |
| REQ-07 | Regras geram sugestões revisáveis; sem alteração de API, moeda/tenant | Preservado no diff | Quatro arquivos alterados, só web SSR/teste e cenário Chrome; texto e endpoints observados sem mudança de contrato |
| REQ-08 | CI e Chrome exact-SHA verdes | Não implementado | CI verde, Chrome vermelho |
| REQ-09 | Auditoria independente e certificado da entrega | Não implementado | Handoff herdado de outra issue/PR, sem certificado #727 |

## Achados bloqueantes

### [ALTO] A-001 — Overflow horizontal e reflow reprovado no navegador real

- **Requisitos afetados:** REQ-02, REQ-03, REQ-05, REQ-08.
- **Disposição:** `blocking` · **remediation_mode:** `targeted-remediation`.
- **Origem comprovada:** fluxo de apresentação `/configuracoes` e validações tocadas pela PR #758.
- **Evidência:** `settings-interface.json` (SHA-256 `e85df7954aa4542e59ef7018a4295050fa962172c89ee6619eae482e04dba97b`) e `settings-interface-reservations.json` (SHA-256 `b58444e919f63fe9392debf3d453c65d5653859aeaabf49101c67ef319e516a9`), run #41640527380, head `20d96df7...`.
- **Observado:** `profiles-320` registra overflow, nome longo e `restored=false`; `rules-320` registra overflow; `rules-mobile-zoom-200` e `profiles-mobile-zoom-200` registram overflow; duas suítes Chrome de `/configuracoes` terminaram com exit code 1.
- **Controle negativo:** nome artificial longo de 360 caracteres foi inserido; a detecção de truncamento (`truncationRejected=true`) funcionou, mas o retorno ao estado sem overflow não ocorreu (`restored=false`) em 320 px.
- **Causa/impacto:** regressão ou lacuna responsiva material, visível nas capturas `issue-727-profiles-320-rest.png`, `issue-727-profiles-320-long-profile.png` e `issue-727-rules-320-rest.png`, com conteúdo lateral cortado.
- **Correção verificável:** diagnosticar os elementos que expandem `scrollWidth`, corrigir o CSS local mantendo tabs e controles acessíveis e reproduzir todos os casos 320 px e 200% na execução Chrome exact-SHA, incluindo a restauração do controle negativo.

### [ALTO] A-002 — Aceite visual incompleto para estados alternativos e edição

- **Requisitos afetados:** REQ-04, REQ-05, REQ-08.
- **Disposição:** `blocking` · **remediation_mode:** `targeted-remediation`.
- **Origem comprovada:** cobertura/evidência prevista pela issue não produzida pela entrega.
- **Evidência:** inventário efetivo do artefato `statement-visual-evidence-20d96df765d52f54160249fb56095a053ad66c11`, script `scripts/statement-visual/settings-interface-adversarial.mjs` (capturas de repouso, diálogo de novo e nome longo) e `settings-interface-reservations.mjs` (captura zoom de novo perfil, mas sem captura de edição). Os SSR tests cobrem HTML de vazio e erro, não substituindo screenshot autenticada.
- **Observado:** não foram localizadas capturas de estados vazio/erro e de modal de edição com as duas tabs no conjunto da entrega, embora estejam expressamente exigidas no checklist da #727.
- **Impacto:** o aceite visual do fluxo de erro, da edição e da densidade alternativa não é comprovável pela evidência entregue, mesmo após corrigir o overflow.
- **Correção verificável:** ampliar os cenários Chrome para os estados e viewports exigidos, nomear/registrar capturas por cenário, validar falha recuperável, foco e persistência, e inspecionar os arquivos do run do HEAD final.

### [ALTO] A-003 — Handoff certificado da issue #727 não foi produzido

- **Requisitos afetados:** REQ-09 e gate de release da Skill oficial.
- **Disposição:** `blocking` · **remediation_mode:** `targeted-remediation`.
- **Origem comprovada:** entrega incompleta; **não** é uma alteração errada introduzida na PR.
- **Evidência:** em base `a11e9d72...` e head `20d96df7...`, `.audit/entregar-issue/handoff-ready.json` tem o mesmo blob `15170d0688e3f5b30b6ffe793fd366957fed6890`. Seu `subject` é `issue_number=726`, `pull_request_number=754`, `head_ref=feat/726-golden-inbox-review-hierarchy`, não #727/#758. Classificador oficial: `mode=certified-handoff`.
- **Classificação:** `inherited-base-artifact`, `reason=handoff-not-produced`, `recovery_scope=handoff-only` **após** corrigir os defeitos materiais e congelar o HEAD final; se houver novos commits materiais, refazer o freeze e as evidências dos gates.
- **Impacto:** impede a certificação semântica do candidato; CI verde sozinho não substitui o handoff vinculado ao material SHA correto.
- **Correção verificável:** gerar e validar o pacote próprio da issue #727 seguindo a Skill oficial, usar o material SHA final, publicar `result-only-child` autorizado (quando aplicável) e conferir a linhagem Git e hashes.

## Limitações exclusivas do auditor

### LIM-001 — Validador integral do relatório não executável neste runtime

- **Recurso indisponível:** código-fonte executável integral do validador `auditar-issue/scripts/validate_verdict_header.py` do repositório remoto no container local (egress/DNS ao `raw.githubusercontent.com` indisponível).
- **Gate obrigatório afetado:** validação automatizada final do cabeçalho e matriz do presente parecer.
- **Tentativas e fallbacks:** leitura da Skill pelo connector GitHub, execução local bem-sucedida do classificador de transporte materializado e validação manual de identidade/contadores/estrutura; tentativa de acesso raw GitHub por `curl` falhou com DNS exit 6. Evidência do candidato permaneceu disponível via GitHub e ZIP de Actions.
- **Prova indisponível:** execução do verificador integral de formato do relatório. Esta limitação não é defeito do SolverFin e não altera os três blockers materiais comprovados.

## Superfícies revisadas e regressão

- **Cobertas em código, SSR ou Chrome:** tabs, ações primárias/secundárias, status de perfil, nomenclatura de prioridade/status, diálogos de novo/editar, mutações reais, labels de ícones, HTML escaping, erro de rede no formulário novo por falha simulada, nome longo, viewport 1366/390/320 e zoom 200%.
- **Não cobertas satisfatoriamente:** capturas autenticadas dos estados vazio/erro/editar; cenário completo verde em 320 e 200%; inspeção visual final de hover/disabled e estética nos cenários alternativos.
- **Não aplicáveis ao delta:** novas migrations, payload público, manipulação financeira, múltiplas moedas e redefinição de tenant, pois os quatro arquivos da PR são exclusivamente UI/SSR/testes e não alteram essas fronteiras. Nenhuma conclusão de testes de fronteira API é extrapolada do Chrome.
- **Falha separada em `/inbox`:** `category-learning`, `scripts/statement-visual/issue-564-category-learning.mjs:94`, falhou com `Learning settings must fit mobile viewport`. O arquivo/rota não integra o diff da #727; não foi imputado à candidata e precisa de triagem própria se persistir.

## Pendências objetivas e conclusão

1. Remover todo overflow horizontal em ambas as abas a 320 px e em 200% de escala, inclusive perfis com nomes longos, e fazer os controles negativos restaurarem o estado.
2. Completar os casos de captura exigidos pela #727 (vazio, erro, conteúdo longo, novo, editar e erro de formulário) nas viewports especificadas.
3. Executar e inspecionar Chrome e Repository CI verdes no mesmo HEAD final; separar problemas alheios à PR.
4. Somente depois, produzir certificado de entrega para #727/PR #758 e submeter nova auditoria independente exact-SHA.

**Estado final:** a issue #727 e a PR #758 permanecem abertas; nenhuma alteração remota, merge, revisão GitHub ou fechamento foi executado nesta auditoria.
