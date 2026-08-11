# Fila de revisão de sugestões

## Objetivo

A Inbox concentra a revisão humana de sugestões produzidas por importação, regras, automações, aprendizado, histórico, sistema ou IA. Nenhuma sugestão incerta produz efeito financeiro sem decisão explícita.

A fila unificada cobre `transaction_extraction`, `categorization`, `deduplication`, `reconciliation` e `insight`. Cada item apresenta tipo, estado, origem, confiança, explicação e alvo em linguagem de produto. Identificadores técnicos podem existir como referências escopadas no payload autenticado para preencher controles da revisão, mas a interface resolve essas referências para nomes e rótulos e não os usa como identificação visível do item.

## Payload estruturado

`AiSuggestion.payload` segue o contrato comum de `docs/AI_SUGGESTION_PAYLOADS.md`: envelope discriminado, versão, origem, alvo, confiança, motivos, auditoria e fingerprint canônico.

`explanation` é somente texto apresentacional. Data, valor, descrição, conta, categoria, evidências e vínculos financeiros vêm exclusivamente do payload estruturado. Payload ausente, legado incompatível ou versão não suportada permanece sem efeito automático e retorna erro controlado.

Extrações novas usam `TransactionExtractionSuggestionPayloadV2`; V1 continua legível. Deduplicação, conciliação e categorização dependentes mantêm vínculo explícito com a sugestão de origem e o fingerprint observado. Insights verificáveis usam `InsightSuggestionPayloadV2`; V1 continua legível para histórico.

## Fila unificada na Inbox

A área **Outras sugestões** carrega a fila completa e oferece filtros por:

- `kind`;
- `status`;
- `confidence`;
- `profileId`.

`kind`, `status` e `confidence` são preservados na URL; `profileId` continua sendo o recorte tenant já usado pelas demais telas. A listagem da API aceita `kind`, `status`, `includeLowConfidence` e `profileId`; o filtro visual de confiança é aplicado sobre essa projeção completa.

Antes de responder `GET /api/ai-review-queue`, o backend executa duas atualizações determinísticas para o perfil ativo:

1. a varredura generalizada de deduplicação/conciliação para `transaction_extraction` pendentes;
2. a geração idempotente de insights financeiros verificáveis descrita em `docs/FINANCIAL_INSIGHTS.md`.

CSV, OFX, mensagens bancárias e extrações assistidas por IA passam pelo mesmo motor de comparação para deduplicação/conciliação; a origem não seleciona um algoritmo diferente. A geração de insight, por sua vez, lê o estado financeiro já persistido do perfil e não depende da origem das extrações.

A interface possui estados explícitos de carregamento, vazio, erro com nova tentativa, indisponibilidade temporária com nova tentativa, baixa confiança e conflito de versão. Falhas transitórias reconhecidas por HTTP `408`, `425`, `429`, `502`, `503` ou `504`, ou por códigos equivalentes de timeout/rate limit/unavailable, usam mensagem e estilo próprios para não se confundirem com erro permanente.

O detalhe e a edição usam `<dialog>`, movem foco para o conteúdo editável e devolvem o foco ao acionador quando o diálogo fecha. O layout é fluido em desktop e mobile e não depende de texto técnico longo para orientar a decisão.

Para `deduplication` e `reconciliation`, o detalhe resolve o `targetTransactionId` escopado por tenant/perfil através da API de lançamentos e apresenta descrição, data e valor do lançamento alvo. O UUID permanece apenas como referência de integração e não é usado como rótulo visível. Motivos e conflitos estruturados são exibidos como evidência de revisão, sem texto bruto de arquivo, mensagem ou provider.

Para `insight` V2, o bloco estruturado apresenta título, resumo, período, confiança, evidências numéricas e limitações. Quando o payload autoriza navegação, a Inbox oferece link para a área financeira relacionada (`/lancamentos`, `/orcamentos` ou `/relatorios`). `insightKey`, `dataFingerprint`, provider/model e IDs técnicos não aparecem como texto visível.

## Campos editáveis

A edição nunca muda arbitrariamente o payload inteiro.

- `transaction_extraction`: somente data, tipo, valor, descrição, conta, outra conta de transferência, categoria e campos equivalentes já permitidos pelo contrato de importação/revisão;
- `categorization`: somente `proposedCategoryId`;
- `deduplication`: sem edição de payload na fila;
- `reconciliation`: sem edição de payload na fila;
- `insight`: sem edição de payload na fila.

Campo fora da lista autorizada retorna `AI_REVIEW_EDIT_FIELD_UNSUPPORTED`. Tipos sem campos editáveis retornam `AI_REVIEW_EDIT_NOT_SUPPORTED`.

Uma edição aceita mantém a sugestão pendente, recalcula o fingerprint quando o payload muda e invalida candidaturas dependentes que observavam a versão anterior. Sugestões de importação continuam delegando a mutação ao fluxo canônico de importações, que também revalida lote, contas, categorias e transferências.

## Efeitos por tipo

A aprovação sempre revalida organização, perfil financeiro, estado, versão e elegibilidade imediatamente antes do efeito.

| Tipo                     | Efeito da aprovação |
| ------------------------ | ------------------- |
| `transaction_extraction` | cria ou vincula o lançamento usando o contrato canônico já existente; importações continuam passando pelas regras de lote, transferência e revisão |
| `categorization`         | aplica a categoria a uma `transaction_extraction` ainda pendente ou a um `Transaction` elegível; categoria arquivada, de outro perfil ou incompatível com o tipo é rejeitada |
| `deduplication`          | resolve a origem como duplicidade e expira candidaturas irmãs, sem criar nem alterar o lançamento comparado |
| `reconciliation`         | revalida o alvo, marca o lançamento como reconciliado, aprova/vincula a origem e expira irmãs na mesma transação |
| `insight`                | registra reconhecimento/aprovação da sugestão, sem criar nem alterar lançamento financeiro |

Rejeitar encerra a sugestão sem aplicar o efeito proposto. Rejeitar uma candidatura determinística não resolve automaticamente a origem; outras opções de revisão continuam disponíveis.

## API

```http
GET /api/ai-review-queue
GET /api/ai-review-queue/:suggestionId/payload
POST /api/ai-review-queue/:suggestionId/approve
POST /api/ai-review-queue/:suggestionId/edit
POST /api/ai-review-queue/:suggestionId/reject
```

Decisões e edições exigem `expectedFingerprint`. A interface sempre lê a versão atual imediatamente antes da ação e envia esse fingerprint. A ausência da precondição retorna `AI_REVIEW_EXPECTED_FINGERPRINT_REQUIRED` com HTTP `428`. Se outra aba, sessão, origem ou lançamento alvo mudar antes da gravação, a API retorna conflito/obsolescência controlada e nenhuma parte do efeito é confirmada.

A mesma decisão repetida sobre um item já resolvido retorna o resultado persistido quando a operação é idempotente. Uma decisão oposta ou transição incompatível retorna conflito controlado.

A rota de payload retorna a projeção tipada e redigida. Referências internas necessárias aos controles de edição/navegação são expostas somente depois do recorte por `organizationId` e `financialProfileId`; provider bruto, prompt, resposta integral, conteúdo de arquivo/mensagem, `dataFingerprint` e dados fora do contrato público não são retornados.

## Deduplicação e conciliação generalizadas

A issue #566 estende a detecção determinística para qualquer `transaction_extraction` estruturada pendente. A comparação usa o mesmo domínio para CSV, OFX, mensagem bancária e extração produzida por IA que siga o contrato canônico.

A candidatura persiste `sourceSuggestionId`, `sourcePayloadFingerprint`, `targetTransactionId`, motivos e conflitos. A identidade tenant-scoped impede duplicação sob varreduras concorrentes. Uma mudança na origem ou no alvo expira a candidatura antiga; se a combinação continuar válida, uma candidatura atual pode ser criada para a nova versão.

Transferências exigem par de contas compatível, moeda, valor e tolerância de data. Descrição semelhante é apenas evidência complementar e nunca autoriza uma transferência com contas divergentes.

## Insights financeiros verificáveis

A issue #567 adiciona geração determinística e persistida de insights em cinco áreas de produto: variação/anomalia de gasto, recorrências, risco de saldo negativo, orçamento excedido e resumo mensal.

Regras principais:

- cálculo e limiares são executados antes de qualquer narrativa opcional;
- apenas `POSTED`/`RECONCILED` entram no realizado; dados pendentes de revisão são excluídos e declarados como limitação;
- moedas nunca são somadas entre si;
- amostra insuficiente não cria item artificial na fila;
- `financial-insights-v2` e `dataFingerprint` formam parte da identidade interna de geração;
- varreduras concorrentes convergem com advisory lock por organização/perfil;
- pendência equivalente é reutilizada; mudança do snapshot expira a pendência antiga e permite nova versão;
- fingerprint já resolvido não é recriado com os mesmos dados;
- provider opcional só pode explicar o resultado e não altera evidências.

Aprovar/rejeitar insight permanece audit-only. Abrir a área financeira relacionada é navegação, não aplicação automática de sugestão.

## Atomicidade, concorrência e obsolescência

As decisões passam pela fachada transacional comum baseada em `withSharedTransaction`. Sugestão, origem, lançamento alvo, expirações, status de lote quando houver e auditoria confirmam ou fazem rollback juntos.

A candidatura, a origem e o alvo relevante são bloqueados antes do efeito. Dependências continuam protegidas pelo fingerprint da origem e pela revalidação da versão do lançamento comparado. Origem ausente, lote descartado, sugestão resolvida, alvo inelegível, alvo alterado ou fingerprint divergente preserva a consistência e retorna erro controlado.

Quando uma categorização atualiza uma extração pendente, o novo fingerprint da extração expira candidaturas de categorização, deduplicação ou conciliação baseadas na versão anterior. Quando uma deduplicação ou conciliação é aprovada, candidaturas determinísticas irmãs ainda pendentes expiram na mesma transação.

Varreduras simultâneas de deduplicação/conciliação usam a unicidade de `AiSuggestion`; varreduras de insights usam advisory lock tenant-scoped e fingerprints de dados. Falha de auditoria ou de qualquer etapa posterior faz rollback do estado persistido na transação correspondente.

## Categorização inteligente

Sugestões `transaction_extraction` pendentes podem receber candidatura `categorization` pela ordem definida em `docs/ai/category-learning.md`: regra explícita, correção confirmada, histórico, provider autorizado e revisão manual.

A fila não inventa categoria quando a evidência é inválida. Categoria arquivada/incompatível, correções conflitantes, provider desativado, consentimento ausente ou versão de origem obsoleta mantêm a sugestão sem efeito até nova revisão.

## Mensagens bancárias e importações

Mensagens bancárias e importações CSV/OFX produzem extrações estruturadas que entram na mesma fila. O texto bruto da mensagem, o conteúdo bruto do arquivo, prompts e respostas brutas de provider não são persistidos na fila.

A aprovação de extrações importadas continua usando o fluxo de `docs/IMPORTS.md`; a fila unificada não contorna validação de lote, idempotência ou regras de transferência. Deduplicação e conciliação, porém, usam o mesmo detector estruturado independentemente da origem da extração.

## Auditoria e segurança

Todas as consultas e mutações exigem o mesmo `organizationId` e `financialProfileId`. Aprovação, rejeição e edição registram ator, data, ação, entidade, mudanças redigidas e, quando a requisição possui correlação, o mesmo `correlationId` do request.

As referências `previousVersionRef` e `nextVersionRef` usam somente `status@fingerprint`. Elas distinguem o estado observado antes da decisão do estado persistido depois dela sem registrar valor, descrição, conta, categoria ou qualquer outro dado financeiro em claro.

Mudanças redigidas continuam indicando transição/proposta alterada sem registrar dados financeiros sensíveis. O endpoint valida UUID antes do primeiro acesso protegido e erros públicos não revelam existência de recurso fora do contexto ativo. Payload resolvido permanece imutável pelo contrato do banco.

## Validação

A cobertura da fila inclui contratos de payload, edição por tipo, versão otimista, replay idempotente, concorrência de decisões, rollback e isolamento. A issue #566 adiciona cenários discriminantes do scanner determinístico generalizado. A issue #567 adiciona payload `insight` V2, isolamento por moeda, exclusão de dados não revisados, persistência/reexecução/substituição idempotente e renderização de evidências/limitações/navegação na Inbox.
