# Assistente financeiro e insights

Este documento registra os contratos de IA do assistente financeiro e aponta para as implementações canônicas de conversa e de insights verificáveis do SolverFin.

A entrega original das issues #56 e #57 criou contratos puros e testáveis. A issue #562 adicionou a infraestrutura substituível de provider em `@solverfin/ai`. A issue #567 tornou a geração de insights proativa, persistida e revisável na Inbox, sem transferir cálculos financeiros para o provider. A issue #568 torna o assistente conversacional operacional, persistido e estritamente somente leitura.

## Assistente financeiro

A fonte canônica do fluxo operacional é `docs/FINANCIAL_ASSISTANT.md` e a decisão arquitetural está na ADR 0011.

O assistente usa `answerFinancialQuestion` depois que a API resolve intent, perfil, período, moeda, filtros e evidência financeira. O provider nunca é a fonte dos números ou de texto financeiro livre: quando habilitado e consentido, ele só pode retornar a diretiva fechada `DIRECT` ou `CONTEXTUAL`, e o backend compõe a resposta com texto controlado pelo SolverFin.

A conversa é persistida antes da resposta pendente e usa estado/versionamento/idempotência para sobreviver a retry, concorrência, cancelamento e restart. Troca de perfil ou moeda incompatível expira o contexto anterior em vez de misturar dados.

### Disponibilidade de hoje

Perguntas como "quanto posso gastar hoje?" são tratadas como `daily_availability`.

O assistente exige um `AvailabilityCalculationResult` produzido por um serviço estruturado de disponibilidade financeira. Se esse resultado não for informado, retorna fallback controlado e não estima valor livremente.

A resposta inclui valor disponível, horizonte, componentes considerados, premissas, limitações e confiança. Faturas já representadas por uma transação de pagamento não são descontadas de novo.

## Outras perguntas financeiras

Perguntas sobre receitas/despesas, categorias, saldo projetado, faturas/parcelas, assinaturas/recorrências e resumo mensal usam evidência estruturada calculada no backend.

Quando o provider está habilitado, `runAiTask` recebe apenas intent, período/moeda/filtros minimizados e métricas agregadas. A pergunta bruta não é enviada. Todo fluxo que alcance provider define consentimento, propósito, campos permitidos, limites e fallback e revalida consentimento imediatamente antes de cada tentativa. O contrato operacional está em `docs/ai/providers.md`.

Qualquer saída diferente de `DIRECT` ou `CONTEXTUAL` é descartada integralmente. Falha, timeout, rate limit, indisponibilidade ou revogação tardia preservam a resposta determinística.

## Insights financeiros verificáveis

A fonte canônica é `docs/FINANCIAL_INSIGHTS.md`.

`generateFinancialInsights` calcula anomalias, recorrências, risco de saldo negativo, orçamento excedido e resumo do período de forma determinística. O serviço da API persiste resultados acionáveis como `AiSuggestion.kind = INSIGHT` com payload V2 versionado e idempotente, e a Inbox mostra evidências, limitações e navegação relacionada.

Cálculos usam somente dados do tenant/perfil ativo e nunca misturam moedas. Lançamentos não revisados ficam fora dos totais realizados. Ausência de amostra suficiente retorna `insufficient_data` no cálculo e não cria item artificial na fila.

Provider é opcional e serve apenas para narrativa. Falha, indisponibilidade ou texto que tente introduzir números preserva a explicação determinística e não altera evidências.

## Privacidade e limites

- Os cálculos filtram por `organizationId`, `financialProfileId` e moeda.
- Fixtures e testes usam dados fictícios.
- Texto financeiro bruto não é necessário para gerar insight nem para montar a evidência do assistente.
- Prompt bruto e resposta bruta do provider não são persistidos no histórico conversacional.
- Logs de provider não incluem prompt, campos, resposta bruta, credencial ou identificadores de tenant.
- A projeção pública do assistente omite evidência persistida, IDs internos, chaves de idempotência e códigos internos de falha.
- Aprovar/rejeitar insight apenas audita a decisão e não aplica efeito financeiro.
- O assistente conversacional não possui operações financeiras de escrita.
- Respostas não substituem aconselhamento financeiro, jurídico, fiscal, contábil, de investimento ou crédito.
