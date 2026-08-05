# Assistente financeiro e insights

Este documento registra o primeiro contrato de dominio para o assistente financeiro e para os insights do SolverFin.

A entrega original das issues #56 e #57 criou contratos puros e testaveis sem provider real, API HTTP ou UI final. A issue #562 adicionou posteriormente a infraestrutura substituivel de provider em `@solverfin/ai`, mas nao ativou automaticamente o assistente em API ou interface. Os contratos deste documento continuam sendo a fonte funcional dos fluxos futuros.

## Escopo rastreado

- #56: assistente financeiro de perguntas e respostas, incluindo disponibilidade de hoje.
- #57: insights, anomalias e resumo mensal com evidencia numerica.
- #562: infraestrutura segura e desativada por padrao para provider real substituivel.

## Assistente financeiro

O assistente usa `answerFinancialQuestion` para classificar a pergunta e responder apenas quando existe base autorizada.

### Disponibilidade de hoje

Perguntas como "quanto posso gastar hoje?" sao tratadas como `daily_availability`.

Nesse caso, o assistente exige um `AvailabilityCalculationResult` produzido por um servico estruturado de disponibilidade financeira. Se esse resultado nao for informado, o assistente retorna fallback controlado e nao estima valor livremente.

A resposta inclui:

- valor disponivel calculado;
- horizonte do calculo;
- componentes considerados, como saldo, receitas, faturas, despesas conhecidas, recorrencias inferidas e reserva;
- premissas usadas;
- limitacoes e nivel de confianca.

## Outras perguntas financeiras

Para perguntas sobre categorias, saldo projetado, assinaturas ou resumo mensal, o assistente pode usar um provider via `runAiTask`, sempre com payload minimizado e mascarado.

`OpenAiProvider` e o primeiro adapter real disponivel, mas permanece inativo enquanto `AI_PROVIDER=disabled`. Um fluxo de produto so deve seleciona-lo depois de definir consentimento, proposito, lista positiva de campos, limites e fallback. Quando provider, consentimento ou dados suficientes nao existem, o retorno e um fallback claro com `safeLogCode` e limitacoes.

O contrato operacional do provider fica em `docs/ai/providers.md`; a decisao arquitetural fica na ADR 0010.

## Insights financeiros

`generateFinancialInsights` produz insights deterministico a partir de lancamentos autorizados do tenant e perfil financeiro.

Tipos iniciais:

- aumento de gasto por categoria;
- aumento de gasto por merchant;
- possivel assinatura ou recorrencia por merchant repetido em meses diferentes;
- risco de saldo negativo a partir de saldo projetado informado;
- orcamento excedido;
- resumo mensal;
- dados insuficientes.

Cada insight inclui evidencia numerica, periodo, fontes e confianca. Quando nao ha base suficiente, a funcao retorna `insufficient_data` em vez de inventar conclusao.

## Privacidade e limites

- As funcoes filtram dados por `organizationId` e `financialProfileId`.
- Fixtures e testes usam dados ficticios.
- O assistente nao deve receber texto financeiro bruto quando a politica exigir minimizacao.
- `runAiTask` revalida consentimento imediatamente antes de cada tentativa quando recebe um resolvedor dinamico.
- Logs de provider nao incluem prompt, campos, resposta bruta, credencial ou identificadores de tenant.
- Respostas nao substituem aconselhamento financeiro, juridico ou fiscal.

## Dependencias futuras

A pergunta de disponibilidade depende do epic #72 e suas subissues para fornecer o calculo estruturado usado por dashboard, assistente e experiencia de revisao.

A UI final do assistente e dos insights deve reutilizar estes contratos para evitar respostas divergentes entre telas e provider de IA. A ativacao de um fluxo real deve permanecer em issue propria, com criterios de consentimento, revisao, custo, observabilidade e fallback.
