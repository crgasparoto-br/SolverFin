# Insights financeiros verificáveis

## Objetivo

Os insights do SolverFin destacam padrões financeiros usando cálculos determinísticos e evidências auditáveis. Eles não executam ações financeiras, não substituem aconselhamento financeiro e não permitem que um provider altere valores, percentuais, períodos, filtros ou comparações calculados pelo sistema.

A implementação canônica está em `@solverfin/ai` e é materializada como `AiSuggestion.kind = INSIGHT` para revisão na Inbox.

## Ordem de execução

1. O backend lê apenas dados da organização e do perfil financeiro ativos.
2. Os dados são separados por moeda antes de qualquer agregação.
3. O cálculo determinístico produz tipo, período, filtros, evidências, comparação, confiança, limitações e navegação relacionada.
4. O resultado recebe `calculationVersion` e `dataFingerprint` internos para idempotência e rastreabilidade.
5. Apenas insights acionáveis são persistidos como payload `insight` V2; `insufficient_data` é fallback calculado e não vira item da fila.
6. Narrativa por provider é opcional e não faz parte do caminho necessário para persistir o insight. Se usada, não pode introduzir números nem linguagem quantitativa/comparativa que redefina o cálculo canônico; texto inválido ou provider indisponível preserva a explicação local.
7. A Inbox apresenta o payload público tipado, incluindo evidências e limitações, sem reconstruir números a partir de `explanation`.

## Tipos iniciais

- `category_spending_increase`: aumento relevante de despesa por categoria;
- `merchant_spending_increase`: aumento relevante de despesa por merchant normalizado;
- `probable_subscription`: recorrência provável em meses consecutivos com valor estável;
- `negative_balance_risk`: saldo agregado projetado abaixo de zero no horizonte atual;
- `budget_exceeded`: realizado da categoria acima do orçamento ativo na mesma moeda e dentro do período exato do orçamento;
- `monthly_summary`: resumo do período atual com receitas, despesas, saldo realizado, comparação de despesas e principais variações por categoria.

`insufficient_data` existe somente como retorno do cálculo para impedir conclusões sem base suficiente.

## Regras determinísticas e limiares

### Aumento de gasto

O limiar padrão é aumento de pelo menos 25%. A categoria ou merchant precisa ter pelo menos dois lançamentos realizados no período atual e dois no período anterior comparável. Um único gasto alto isolado não produz anomalia de aumento.

A evidência inclui total atual, total anterior, diferença, variação percentual e tamanho da amostra atual.

### Recorrência provável

O padrão exige pelo menos três meses consecutivos com o mesmo `merchantKey`. O valor mensal agregado precisa permanecer dentro de tolerância padrão de 20% em relação à média dos meses observados. Uma sequência interrompida não é classificada como recorrência.

`merchantKey` é derivado de forma determinística da descrição persistida quando o modelo de lançamento não possui merchant estruturado próprio. Números, pontuação e diacríticos são normalizados para reduzir variações triviais; essa chave é evidência auxiliar, não identidade externa.

### Risco de saldo negativo

A projeção agrega, por moeda:

- saldo de abertura das contas;
- receitas e despesas `POSTED`/`RECONCILED` já ocorridas;
- receitas e despesas `PLANNED` até o fim do horizonte mensal.

Transferências internas não alteram o saldo agregado do perfil na mesma moeda. A projeção é uma estimativa determinística e a própria limitação é exibida ao usuário.

### Orçamento excedido

Somente orçamentos `ACTIVE`, tenant-scoped e na mesma moeda entram no cálculo. Um orçamento pode apenas se sobrepor ao período corrente, mas o realizado usado para decidir `budget_exceeded` é restrito às despesas confirmadas da categoria cujo `occurredOn` esteja entre `periodStartOn` e `periodEndOn` do próprio orçamento. Despesas do mesmo mês, porém fora dessa janela, não contam para esse insight.

A evidência compara realizado com planejado e usa exatamente o período do orçamento.

### Resumo mensal

O resumo apresenta receitas, despesas e saldo realizado (`receitas - despesas`) do período atual como evidências numéricas tipadas. A comparação preserva despesa atual versus despesa do período anterior comparável e sua variação percentual quando o denominador é válido.

Quando existe período anterior comparável, o resumo também publica até três principais variações de despesa por categoria, ordenadas pelo valor absoluto da diferença entre os períodos. Antes da projeção pública, IDs internos de categoria são convertidos para nomes autorizados; categoria ausente usa o rótulo `Sem categoria`, e um ID sem nome autorizado nunca é exposto como rótulo visível.

Ausência de base anterior é explicitada como limitação e não inventa uma variação.

## Status de lançamentos

Valores históricos e comparações usam apenas `POSTED` e `RECONCILED`.

- `SUGGESTED`, `PENDING_REVIEW` e `DUPLICATE` não entram nos totais e geram limitação quando presentes no escopo;
- `PLANNED` não entra no realizado histórico; é usado somente na projeção de saldo quando aplicável;
- `VOIDED` é ignorado.

Essa separação impede que dados ainda não confirmados alterem anomalias, orçamentos ou resumo mensal.

## Multimoeda

Não existe soma entre moedas. Cada execução gera conjuntos independentes por código ISO 4217 de três letras. Transações, contas, orçamento, projeção, evidência e comparação devem compartilhar a mesma moeda do insight.

## Persistência e idempotência

A versão de cálculo atual é `financial-insights-v2`.

A identidade lógica usa:

- tipo de insight;
- organização e perfil financeiro;
- período calculado;
- moeda e filtros relevantes;
- versão de cálculo;
- `dataFingerprint` derivado das evidências e fontes autorizadas.

Como as evidências estruturadas do resumo fazem parte do fingerprint, mudança de receita, despesa, saldo ou principal variação invalida o snapshot anterior mesmo quando os demais filtros permanecem iguais.

A varredura usa advisory lock transacional por organização/perfil. Uma pendência com a mesma chave, versão e fingerprint é reutilizada. Quando os dados mudam, a pendência antiga é expirada e uma nova versão pode ser criada. Um fingerprint já resolvido (`APPROVED`, `REJECTED`, `EDITED` ou `EXPIRED`) não é recriado com os mesmos dados.

O refresh da Inbox pode executar a varredura repetidamente sem multiplicar candidatos equivalentes.

## Payload `insight` V2

O payload persistido mantém, além do envelope comum:

- `insightType` e `insightKind`;
- `insightKey` interno;
- título e resumo;
- período;
- moeda e filtros;
- `evidence[]` numérico tipado;
- comparação opcional;
- limitações;
- `calculationVersion`;
- `dataFingerprint` interno;
- referências autorizadas e navegação relacionada.

Para `monthly_summary`, `evidence[]` inclui rótulos explícitos para `receitas`, `despesas`, `saldo`, `despesas_periodo_anterior`, variação percentual quando aplicável e as principais variações de categoria.

A projeção pública da Inbox omite `insightKey`, `dataFingerprint`, provider/model e metadados internos. IDs escopados só são retornados no detalhe autenticado quando necessários para navegação ou controles e não são usados como rótulos visíveis.

## Inbox e decisão

Antes de listar `GET /api/ai-review-queue`, o backend atualiza os insights do perfil ativo. A Inbox mostra:

- título e resumo;
- período;
- confiança;
- evidências verificáveis;
- limitações;
- link para a área relacionada (`/lancamentos`, `/orcamentos` ou `/relatorios`) quando aplicável.

Aprovar ou rejeitar um insight apenas registra a decisão auditável. Não cria, altera, concilia, categoriza nem cancela lançamentos.

## Provider opcional

`explainFinancialInsightWithProvider` aceita um provider narrativo opcional. O retorno é rejeitado e substituído pela explicação determinística quando estiver vazio, exceder o limite, contiver dígitos, números escritos por extenso ou linguagem quantitativa/comparativa como aumento, redução, dobro, metade, maior ou menor. Isso impede que uma frase sem algarismos contradiga relações numéricas calculadas pelo domínio. Falhas e indisponibilidade também mantêm o texto determinístico.

O caminho de geração/persistência da issue #567 não depende de provider e, portanto, continua funcional com `AI_PROVIDER=disabled`.

## Testes mínimos

A cobertura deve preservar:

- valores e percentuais exatos;
- um gasto alto isolado sem falso positivo;
- recorrência consecutiva e interrupção da recorrência;
- exclusão explícita de dados não revisados;
- isolamento por organização, perfil e moeda;
- orçamento com janela parcial do mês sem contar despesas externas ao período;
- saldo negativo e resumo com receitas, despesas, saldo e principais variações estruturadas;
- provider narrativo válido, contraditório com algarismos, contraditório apenas em palavras e indisponível sem alterar evidência;
- payload V2 estrito e projeção pública redigida;
- persistência, reexecução idempotente e substituição de pendência após mudança dos dados;
- renderização web de evidências do resumo, limitações, confiança e navegação sem expor IDs internos.
