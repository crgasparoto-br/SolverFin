# Insights financeiros verificáveis

## Objetivo

Os insights do SolverFin destacam padrões financeiros usando cálculos determinísticos e evidências auditáveis. Eles não executam ações financeiras, não substituem aconselhamento financeiro e não permitem que um provider altere valores, percentuais, períodos, filtros ou comparações calculados pelo sistema.

A implementação canônica está em `@solverfin/ai` e é materializada como `AiSuggestion.kind = INSIGHT` para revisão na Inbox.

## Ordem de execução

1. O backend lê apenas dados da organização e do perfil financeiro ativos.
2. Os dados são separados por moeda antes de qualquer agregação.
3. O cálculo determinístico produz tipo, período, filtros, evidências, comparação, confiança, limitações e navegação relacionada.
4. O resultado recebe `calculationVersion` e `dataFingerprint` internos para idempotência e rastreabilidade.
5. Apenas insights acionáveis são persistidos como payload `insight` V2. `insufficient_data` não vira sugestão: a varredura o devolve como estado informativo por moeda e a Inbox o apresenta como ausência de base suficiente, sem criar candidato artificial.
6. Narrativa por provider é opcional e não faz parte do caminho necessário para persistir o insight. Se usada, não pode introduzir números nem linguagem quantitativa/comparativa que redefina o cálculo canônico; texto inválido ou provider indisponível preserva a explicação local.
7. A Inbox apresenta o payload público tipado com período, critério determinístico, filtros efetivos redigidos, evidências e limitações, sem reconstruir números a partir de `explanation` nem usar IDs internos como rótulos visíveis.

## Tipos iniciais

- `category_spending_increase`: aumento relevante de despesa por categoria;
- `merchant_spending_increase`: aumento relevante de despesa por merchant normalizado;
- `probable_subscription`: recorrência provável em meses consecutivos com valor estável;
- `negative_balance_risk`: menor saldo da projeção de caixa canônica (#617) abaixo de zero no horizonte de 30 dias, por moeda;
- `budget_exceeded`: realizado da categoria acima do orçamento ativo na mesma moeda e dentro do período exato do orçamento;
- `monthly_summary`: resumo do período atual com receitas, despesas, saldo realizado, comparação de despesas e principais variações por categoria.

`insufficient_data` existe somente como retorno do cálculo para impedir conclusões sem base suficiente. No endpoint da fila ele aparece em `financialInsights.insufficientData[]`, separado de `suggestions[]`.

## Regras determinísticas e limiares

### Aumento de gasto

O limiar padrão é aumento de pelo menos 25%. A categoria ou merchant precisa ter pelo menos dois lançamentos realizados no período atual e dois no período anterior comparável. Um único gasto alto isolado não produz anomalia de aumento.

A evidência inclui total atual, total anterior, diferença, variação percentual e tamanho da amostra atual.

### Recorrência provável

O padrão exige pelo menos três meses consecutivos com o mesmo `merchantKey`. O valor mensal agregado precisa permanecer dentro de tolerância padrão de 20% em relação à média dos meses observados. Uma sequência interrompida não é classificada como recorrência.

`merchantKey` é derivado de forma determinística da descrição persistida quando o modelo de lançamento não possui merchant estruturado próprio. Números, pontuação e diacríticos são normalizados para reduzir variações triviais; essa chave é evidência auxiliar, não identidade externa.

### Risco de saldo negativo

Desde a issue #621, `negative_balance_risk` não possui projeção própria. A única fonte da trajetória financeira é a série canônica de `GET /api/cash-flow-projection` (#617), no horizonte de 30 dias, com o menor saldo derivado pelo contrato de valor livre para gastar (#618) — ver `docs/API_CASH_FLOW_PROJECTION.md`.

Regras:

- o scanner chama a mesma composição usada pelo endpoint (`buildCashFlowProjectionForContext`), dentro da transação da varredura, com `referenceDate` igual à data corrente UTC da varredura;
- o insight é emitido, por moeda, somente quando `minimumProjectedBalanceMinor < 0` em um bloco `available`; blocos `unavailable` não produzem risco nem caem em projeção alternativa;
- o scanner não reconstrói agenda de `Transaction`, `Invoice`, recorrência ou parcela;
- transferência cross-currency (#668) afeta cada moeda somente pelo efeito já presente na respectiva série; não há soma nem conversão entre moedas;
- a evidência publica `menor_saldo_projetado`, `deficit_projetado`, `saldo_fim_horizonte` e `horizonte_dias`, todos copiados da série canônica; a limitação informa a data do menor saldo;
- `sources` recebe um fingerprint da série da moeda (saldo inicial, pontos e efeitos), de modo que mudança da série altera o `dataFingerprint`;
- a navegação é `cash_flow` com `referenceDate` e `horizonDays`, e o deep link abre `/relatorios?view=cash-flow&referenceDate=…&horizonDays=…#cash-flow-<moeda>`, reproduzindo o recorte que justificou o risco.

O resultado continua sendo uma estimativa determinística sobre compromissos já registrados.

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
- `PLANNED` não entra no realizado histórico; compromissos futuros chegam ao risco de saldo apenas pela série canônica da #617;
- `VOIDED` é ignorado.

Essa separação impede que dados ainda não confirmados alterem anomalias, orçamentos ou resumo mensal.

## Multimoeda

Não existe soma entre moedas. Cada execução gera conjuntos independentes por código ISO 4217 de três letras. Transações, contas, orçamento, projeção, evidência e comparação devem compartilhar a mesma moeda do insight.

## Persistência, compatibilidade e idempotência

A versão de cálculo atual é `financial-insights-v3`. A mudança de `v2` para `v3` (#621) acompanha a troca da fonte de `negative_balance_risk` e a persistência de `severity`; pela regra de identidade, pendências `v2` do scanner expiram na primeira varredura e podem ser recriadas como snapshots `v3`.

A identidade lógica usa:

- tipo de insight;
- organização e perfil financeiro;
- período calculado;
- moeda e filtros relevantes;
- versão de cálculo;
- `dataFingerprint` derivado das evidências e fontes autorizadas.

Como as evidências estruturadas do resumo fazem parte do fingerprint, mudança de receita, despesa, saldo ou principal variação invalida o snapshot anterior mesmo quando os demais filtros permanecem iguais.

A varredura usa advisory lock transacional por organização/perfil. Ela administra somente sugestões `INSIGHT` produzidas pelo próprio scanner (`provider = solverfin-rule`). Uma pendência V2 desse produtor com a mesma chave, versão e fingerprint é reutilizada. Quando os dados mudam, a pendência antiga desse mesmo produtor é expirada e uma nova versão pode ser criada. Um fingerprint já resolvido (`APPROVED`, `REJECTED`, `EDITED` ou `EXPIRED`) não é recriado com os mesmos dados.

Insights V1 ou insights emitidos por outro produtor permanecem fora do ciclo de expiração do scanner e continuam legíveis/revisáveis conforme o contrato de payloads. Abrir `GET /api/ai-review-queue` não encerra esses itens.

O refresh da Inbox pode executar a varredura repetidamente sem multiplicar candidatos equivalentes.

## Payload `insight` V2

O payload persistido mantém, além do envelope comum:

- `insightType` e `insightKind`;
- `insightKey` interno;
- `severity` (`info | warning | critical`) atribuída deterministicamente pelo detector (opcional apenas em snapshots anteriores à #621);
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

Esses rótulos são chaves técnicas do contrato e não são exibidos diretamente. A Inbox os traduz para linguagem de produto, como **Receitas**, **Despesas**, **Saldo realizado**, **Despesas no período anterior**, **Variação das despesas** e **Variação em <categoria>**.

A projeção pública da Inbox omite `insightKey`, `dataFingerprint`, provider/model e metadados internos. IDs escopados só são retornados no detalhe autenticado quando necessários para navegação ou controles e não são usados como rótulos visíveis.

## Fila acionável: prioridade, deduplicação e ciclo de vida (#621)

A fila de insights é um único conjunto lógico consumido pelo Dashboard e pela Inbox, publicado por `GET /api/financial-insights`. A ordem de processamento é sempre: **deduplicação por equivalência → ordenação canônica → limite de apresentação**.

### Política de prioridade (`financial-insight-priority-v1`)

A implementação executável fica em `packages/ai/src/insight-priority.ts`.

1. Severidade: `critical > warning > info`, reutilizando o vocabulário de `FinancialInsightSeverity`.
2. Tipo, dentro da mesma severidade: `negative_balance_risk`, `budget_exceeded`, `category_spending_increase`, `merchant_spending_increase`, `probable_subscription`, `monthly_summary`.
3. Empate residual por identidade estável: `currency`, `periodStartOn`, `insightKey` e `dataFingerprint`.

`confidence`, `createdAt`, título e ordem SQL/persistência nunca participam. A tabela de precedência é tipada sobre todos os tipos acionáveis; um novo tipo exige posição explícita e nova versão da política. Snapshots anteriores à #621 sem `severity` usam a severidade mínima que o detector do tipo emite (`negative_balance_risk → critical`, `budget_exceeded → warning`, demais `info`).

### Deduplicação

Dentro do mesmo tipo, snapshots equivalentes (mesmo `insightKind`, `insightKey`, `calculationVersion` e `dataFingerprint`) aparecem uma única vez; a cópia mantida é escolhida pelo identificador persistido, não pela data de criação. Tipos diferentes coexistem mesmo quando compartilham categoria, período, moeda ou evidência — por exemplo, `budget_exceeded` e `category_spending_increase` sobre a mesma categoria. Não existe supressão transversal implícita; uma relação de dominância futura exige contrato próprio versionado.

### Estados da fila

| Estado     | Persistência                                                               | Superfícies                          |
| ---------- | -------------------------------------------------------------------------- | ------------------------------------ |
| `active`   | `PENDING_REVIEW` sem `snoozedUntil` futuro                                 | Dashboard (até 3) e Inbox (completa) |
| `snoozed`  | `PENDING_REVIEW` com `snoozedUntil > agora`                                | `state=snoozed`; fora da fila padrão |
| `resolved` | `RESOLVED`, com `reviewedAt` (= `resolvedAt`) e `reviewedByUserId` do ator | `state=resolved` (histórico)         |

`APPROVED`, `REJECTED`, `EDITED` e `EXPIRED` mantêm o significado anterior e não aparecem na fila acionável.

### Resolver

`RESOLVED` é uma decisão explícita do usuário sobre **um snapshot** (linha + `dataFingerprint`). É terminal (os triggers de payload rejeitam qualquer mudança posterior de status/payload), registra auditoria com o ator autenticado e não cria, altera, concilia nem apaga dado financeiro. Como o scanner não recria fingerprints já resolvidos, o mesmo snapshot não volta; um novo `dataFingerprint` gerado por mudança real de evidência cria um novo insight ativo normalmente. Mudança natural de evidência continua expirando a pendência antiga (`EXPIRED`), nunca a transforma em `RESOLVED`.

### Adiar

O usuário pode adiar um insight ativo por 1, 7 ou 30 dias (`snoozedUntil`). O adiamento pertence à linha/snapshot: enquanto `agora < snoozedUntil`, ele sai do Dashboard, da fila ativa e do filtro padrão “Pendentes” da fila de revisão; ao vencer, volta a `active` se ainda for a pendência válida. Se a evidência mudar antes do prazo, o scanner expira o snapshot adiado e o novo fingerprint aparece imediatamente, sem herdar o adiamento. Não existe adiamento indefinido.

### Limitação conhecida da identidade

A identidade reutiliza o contrato existente: o período faz parte da evidência e, portanto, do `dataFingerprint`. Para tipos cujo período termina na data corrente (aumentos, resumo) ou cujo horizonte é móvel (risco de saldo), a passagem do dia gera um novo snapshot, que pode reaparecer depois de resolvido ou adiado. Alterar essa identidade exige contrato próprio.

## Inbox e decisão

Antes de listar `GET /api/ai-review-queue`, o backend atualiza os insights do perfil ativo. A resposta inclui `financialInsights.insufficientData[]` para moedas sem base realizada suficiente; esse estado é informativo e nunca aparece como `AiSuggestion`.

A Inbox mostra:

- título e resumo;
- período;
- confiança;
- critério determinístico aplicado ao tipo de insight, incluindo os limiares canônicos quando houver;
- filtros efetivos, com moeda e escopo de categoria/estabelecimento quando aplicável, sem exibir UUID de categoria como rótulo;
- evidências verificáveis em linguagem de produto;
- limitações;
- link para a área relacionada (`/lancamentos`, `/orcamentos` ou `/relatorios` no recorte canônico da projeção) quando aplicável;
- um estado compacto de “insights aguardando dados” quando o cálculo retornar `insufficient_data`.

O critério visível é derivado de `insightKind`, que é estruturado e versionado; os filtros visíveis vêm de `proposal.filters`. Quando a categoria é identificada por ID para navegação, a Inbox descreve o escopo semanticamente e mantém o identificador técnico fora do texto apresentado.

Ao abrir `/lancamentos` a partir de um insight com `categoryId` e/ou `merchantKey`, o Extrato aplica esse contexto à lista renderizada, preserva os parâmetros ao trocar conta ou mês e informa que o resumo da conta continua completo. A normalização de merchant no destino segue a mesma regra determinística usada pelo scanner.

Aprovar ou rejeitar um insight apenas registra a decisão auditável. Não cria, altera, concilia, categoriza nem cancela lançamentos.

## Provider opcional

`explainFinancialInsightWithProvider` aceita um provider narrativo opcional. O retorno é rejeitado e substituído pela explicação determinística quando estiver vazio, exceder o limite, contiver dígitos, números escritos por extenso ou linguagem quantitativa/comparativa como aumento, redução, dobro, metade, maior ou menor. Isso impede que uma frase sem algarismos contradiga relações numéricas calculadas pelo domínio. Falhas e indisponibilidade também mantêm o texto determinístico.

O caminho de geração/persistência da issue #567 não depende de provider e, portanto, continua funcional com `AI_PROVIDER=disabled`.

## Testes mínimos

A cobertura deve preservar:

- valores e percentuais exatos;
- fronteiras dos limiares: 25% versus abaixo de 25% no aumento de gasto e 20% versus acima de 20% na tolerância de recorrência;
- controle positivo específico do detector de aumento por merchant, independente da amostra por categoria;
- um gasto alto isolado sem falso positivo;
- recorrência consecutiva e interrupção da recorrência;
- exclusão explícita de dados não revisados;
- isolamento por organização, perfil e moeda;
- orçamento com janela parcial do mês sem contar despesas externas ao período;
- saldo negativo derivado exclusivamente da série canônica da #617, inclusive com transferência cross-currency planejada, e resumo com receitas, despesas, saldo e principais variações estruturadas;
- política de prioridade independente da ordem de persistência e de `confidence`, limite de 3 no Dashboard após deduplicação/ordenação, coexistência entre tipos e ciclo `RESOLVED`/adiamento vinculado ao `dataFingerprint`;
- provider narrativo válido, contraditório com algarismos, contraditório apenas em palavras e indisponível sem alterar evidência;
- payload V2 estrito e projeção pública redigida;
- persistência, reexecução idempotente e substituição de pendência após mudança dos dados;
- preservação de `INSIGHT` V1 pendente de outro produtor ao carregar a fila pelo entrypoint real;
- retorno observável de `insufficient_data` sem criação de sugestão artificial;
- renderização web de critério, filtros, evidências traduzidas, limitações e navegação sem expor IDs internos como texto visível;
- aplicação do contexto de categoria/merchant no destino `/lancamentos` com controles negativos para lançamentos irmãos.
