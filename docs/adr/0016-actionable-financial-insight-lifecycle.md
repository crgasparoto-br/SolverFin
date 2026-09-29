# ADR 0016 — Fila acionável de insights com ciclo de vida por snapshot

## Status

Aceito.

## Contexto

A issue #567 criou insights determinísticos persistidos como `AiSuggestion.kind = INSIGHT`, com identidade `calculationVersion + dataFingerprint` e decisões audit-only (`APPROVED`/`REJECTED`). A issue #621 exige uma fila pequena e acionável: prioridade determinística, limite de três itens no Dashboard, resolução explícita e adiamento temporário — sem que uma decisão sobre uma situação antiga silencie uma situação financeira nova.

Ao mesmo tempo, `negative_balance_risk` mantinha uma projeção própria (saldo de abertura + lançamentos realizados/planejados), concorrente com a série canônica de `GET /api/cash-flow-projection` entregue pela #617.

## Decisão

1. **Prioridade versionada no domínio de IA determinística.** `packages/ai/src/insight-priority.ts` define `financial-insight-priority-v1`: severidade (`critical > warning > info`, vocabulário existente), precedência fixa por tipo e desempate por identidade estável. `confidence`, `createdAt`, título e ordem de persistência não participam. A tabela de precedência é tipada sobre todos os tipos acionáveis, forçando posição explícita para novos tipos.
2. **Severidade persistida no payload V2.** `severity` passa a ser campo opcional validado no parser de domínio e no trigger SQL; snapshots anteriores usam a severidade mínima do detector.
3. **Ciclo de vida por snapshot.** `RESOLVED` é um novo valor terminal de `AiSuggestionStatus`, restrito a `INSIGHT` por constraint. `snoozedUntil` é uma coluna relacional restrita a `INSIGHT`, fora do payload e do fingerprint. Ambos pertencem à linha e, portanto, ao `dataFingerprint` daquele snapshot. O scanner continua sem recriar fingerprints resolvidos e continua expirando pendências quando a evidência muda; logo, um novo fingerprint aparece imediatamente sem herdar resolução ou adiamento.
4. **Fonte única para o risco de saldo.** O scanner consome `buildCashFlowProjectionForContext` (mesma composição do endpoint #617/#618) dentro da sua transação. A projeção paralela foi removida. A versão de cálculo passa a `financial-insights-v3`.
5. **Um conjunto lógico para todas as superfícies.** `GET /api/financial-insights` aplica deduplicação por equivalência → ordenação → paginação. Dashboard (`limit=3`) e Inbox (fila completa) consomem o mesmo endpoint; nenhuma superfície reordena ou deduplica por heurística própria.

## Consequências

- A troca para `financial-insights-v3` expira pendências `v2` do scanner e pode recriar snapshots equivalentes uma vez, conforme o contrato de identidade.
- O período faz parte da evidência/fingerprint (contrato herdado). Tipos com período terminando na data corrente ou horizonte móvel geram novo snapshot com a passagem do dia; resolução/adiamento valem para o snapshot vigente. Mudar essa identidade exige contrato próprio.
- Supressão entre tipos diferentes não existe; uma relação de dominância futura exige novo contrato versionado.
- Detalhes operacionais: `docs/FINANCIAL_INSIGHTS.md`, `docs/AI_REVIEW_QUEUE.md`, `docs/AI_SUGGESTION_PAYLOADS.md` e `docs/DASHBOARD.md`.
