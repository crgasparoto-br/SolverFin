# Assistente financeiro e insights

Este documento registra os contratos do assistente financeiro e aponta para a implementação canônica dos insights verificáveis do SolverFin.

A entrega original das issues #56 e #57 criou contratos puros e testáveis. A issue #562 adicionou a infraestrutura substituível de provider em `@solverfin/ai`. A issue #567 tornou a geração de insights proativa, persistida e revisável na Inbox, sem transferir cálculos financeiros para o provider.

## Assistente financeiro

O assistente usa `answerFinancialQuestion` para classificar a pergunta e responder apenas quando existe base autorizada.

### Disponibilidade de hoje

Perguntas como "quanto posso gastar hoje?" são tratadas como `daily_availability`.

O assistente exige um `AvailabilityCalculationResult` produzido por um serviço estruturado de disponibilidade financeira. Se esse resultado não for informado, retorna fallback controlado e não estima valor livremente.

A resposta inclui valor disponível, horizonte, componentes considerados, premissas, limitações e confiança.

## Outras perguntas financeiras

Para perguntas sobre categorias, saldo projetado, assinaturas ou resumo mensal, o assistente pode usar provider via `runAiTask`, sempre com payload minimizado e mascarado.

`OpenAiProvider` permanece inativo enquanto `AI_PROVIDER=disabled`. Todo fluxo que alcance provider deve definir consentimento, propósito, campos permitidos, limites e fallback e revalidar consentimento imediatamente antes de cada tentativa. O contrato operacional está em `docs/ai/providers.md`; a decisão arquitetural está na ADR 0010.

## Insights financeiros verificáveis

A fonte canônica é `docs/FINANCIAL_INSIGHTS.md`.

`generateFinancialInsights` calcula anomalias, recorrências, risco de saldo negativo, orçamento excedido e resumo do período de forma determinística. O serviço da API persiste resultados acionáveis como `AiSuggestion.kind = INSIGHT` com payload V2 versionado e idempotente, e a Inbox mostra evidências, limitações e navegação relacionada.

Cálculos usam somente dados do tenant/perfil ativo e nunca misturam moedas. Lançamentos não revisados ficam fora dos totais realizados. Ausência de amostra suficiente retorna `insufficient_data` no cálculo e não cria item artificial na fila.

Provider é opcional e serve apenas para narrativa. Falha, indisponibilidade ou texto que tente introduzir números preserva a explicação determinística e não altera evidências.

## Privacidade e limites

- Os cálculos filtram por `organizationId`, `financialProfileId` e moeda.
- Fixtures e testes usam dados fictícios.
- Texto financeiro bruto não é necessário para gerar insight.
- Logs de provider não incluem prompt, campos, resposta bruta, credencial ou identificadores de tenant.
- A projeção pública omite fingerprints internos e metadados do provider.
- Aprovar/rejeitar insight apenas audita a decisão e não aplica efeito financeiro.
- Respostas não substituem aconselhamento financeiro, jurídico ou fiscal.
