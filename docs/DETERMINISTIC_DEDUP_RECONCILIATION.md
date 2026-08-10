# Deduplicação e conciliação determinística

## Objetivo

A varredura determinística compara sugestões estruturadas de lançamento pendentes com lançamentos existentes do mesmo perfil e produz candidaturas explicáveis. Ela nunca decide sozinha.

O motor é independente da origem: CSV, OFX, mensagem bancária colada/compartilhada e extração assistida por IA entram pela mesma representação `transaction_extraction`. O arquivo bruto, o texto bruto da mensagem, prompt e resposta integral de provider não participam da comparação nem são persistidos por este fluxo.

O endpoint especializado de importação continua compatível:

```http
POST /api/import-batches/:importBatchId/detect-duplicates
```

A Inbox também executa a varredura generalizada antes de projetar a fila unificada:

```http
GET /api/ai-review-queue
```

A operação cria ou reutiliza sugestões `deduplication` e `reconciliation` vinculadas por payload estruturado à sugestão de origem e ao lançamento alvo. Varreduras concorrentes convergem pela identidade tenant-scoped composta por tipo, origem, versão estruturada e alvo.

## Contrato versionado do payload

Novas candidaturas persistem o envelope canônico descrito em `docs/AI_SUGGESTION_PAYLOADS.md`, com `contractVersion: 1`, `payloadVersion: 1` e `suggestionKind` igual a `deduplication` ou `reconciliation`.

Os campos específicos permanecem no nível raiz do envelope:

- `sourceSuggestionId`: sugestão `transaction_extraction` que originou a candidatura;
- `sourcePayloadFingerprint`: fingerprint observado da sugestão estruturada de origem;
- `targetTransactionId`: lançamento candidato do mesmo perfil financeiro;
- `conflicts`: conflitos estruturados encontrados na comparação.

`origin`, `target`, `reasons` e `audit` registram proveniência e contexto mínimo sem depender de `explanation`. O fingerprint canônico muda quando alvo, proposta ou fonte revisada muda. Antes de produzir efeito, a aprovação compara `sourcePayloadFingerprint` com a fonte atual e revalida o lançamento alvo.

A identidade ativa da candidatura reutiliza o fingerprint efetivamente persistido na origem junto do tipo e do alvo, preservando compatibilidade com os fluxos legados. Quando origem, evidências ou versão do alvo tornam uma candidatura obsoleta, a expiração rotaciona apenas a chave de persistência histórica dessa candidatura, liberando a identidade ativa para uma nova candidatura sem apagar o histórico. Candidaturas rejeitadas não têm a chave rotacionada, de modo que a rejeição continue impedindo recriação silenciosa para a mesma versão de origem e alvo.

Payloads legados `DeterministicReviewPayloadV1` continuam legíveis. Eles não sofrem backfill amplo; uma mutação compatível de sugestão pendente os encapsula no contrato atual. Sugestões já resolvidas permanecem legíveis e imutáveis.

A projeção pública omite auditoria interna, provedor/modelo e identificadores escopados quando a rota não autoriza explicitamente sua inclusão. A fila autenticada pode receber referências tenant-scoped necessárias ao controle de revisão, mas a UI resolve essas referências para rótulos e não exibe IDs técnicos como identidade do item.

## Regras de comparação

A pontuação reutiliza o domínio determinístico existente e considera:

- valor e moeda;
- proximidade de data;
- conta;
- identificador externo, quando houver;
- similaridade de descrição como evidência complementar.

A conciliação também explicita conflitos de tipo, valor, data, conta, conta de destino e categoria. Descrição isolada nunca é suficiente para liberar uma transferência.

### Transferências

Candidatos de transferência exigem o mesmo par de contas, aceitando ambas as orientações para localizar a outra ponta, além de tipo, valor, moeda e tolerância temporal. A direção estruturada da extração define qual conta é origem e qual é destino.

Na aprovação, a identidade financeira permanece conservadora. A candidatura é revalidada contra a versão atual do alvo antes de qualquer mutação; uma alteração concorrente invalida a decisão em vez de aceitar evidência antiga.

## Ciclo de vigência

Uma candidatura pendente expira quando qualquer evidência material que a sustentava deixa de ser vigente, incluindo:

- edição da sugestão `transaction_extraction` de origem;
- origem aprovada, rejeitada, expirada ou removida;
- lote/mensagem associado fora do estado de revisão;
- lançamento alvo alterado, removido ou inelegível;
- outra candidatura aprovada que resolva a mesma origem.

A varredura compara fingerprint da origem, versão do alvo, motivos e conflitos antes de reutilizar uma candidatura. Candidaturas antigas não podem ser aprovadas silenciosamente depois de uma mudança relevante.

## Revisão

Os endpoints especializados permanecem compatíveis:

```http
GET /api/review-suggestions
POST /api/review-suggestions/:suggestionId/approve
POST /api/review-suggestions/:suggestionId/reject
```

A Inbox usa a fila unificada para todas as origens:

```http
GET /api/ai-review-queue
GET /api/ai-review-queue/:suggestionId/payload
POST /api/ai-review-queue/:suggestionId/approve
POST /api/ai-review-queue/:suggestionId/reject
```

Decisões públicas exigem `expectedFingerprint`. A mesma decisão repetida converge para o resultado já persistido; decisão oposta, origem resolvida ou versão obsoleta retorna conflito controlado sem efeito parcial.

Aprovar duplicidade:

- marca a candidatura como aprovada;
- rejeita a sugestão estruturada de origem como duplicada;
- expira candidaturas irmãs ainda pendentes;
- não cria, atualiza, concilia nem remove o lançamento alvo.

Aprovar conciliação:

- marca a candidatura como aprovada;
- revalida origem, fingerprint, tenant/perfil, lote quando houver e lançamento alvo;
- marca o lançamento alvo como reconciliado;
- aprova a sugestão de origem e vincula seu `targetEntityId` ao lançamento;
- expira candidaturas irmãs;
- atualiza o status do lote associado quando houver.

Rejeitar candidatura encerra somente aquela candidatura e mantém a origem pendente para correção, aprovação como novo lançamento ou outra decisão.

`deduplication` e `reconciliation` não possuem campos editáveis na fila. Qualquer tentativa de alterar seu payload pelo endpoint geral retorna erro controlado.

## Atomicidade, concorrência e auditoria

A decisão usa `withSharedTransaction`. Candidatura, origem, lançamento alvo, expirações, status do lote e auditoria confirmam ou fazem rollback juntos.

A gravação bloqueia a candidatura, a origem e, quando necessário, o alvo antes do efeito. A constraint única tenant-scoped impede duplicação em varreduras simultâneas. Em falha de auditoria ou qualquer outra etapa, nenhuma alteração financeira ou de revisão é confirmada parcialmente.

Auditoria registra ator, ação, entidades, correlação e referências redigidas de versão. Valor, descrição, conta, conteúdo de arquivo/mensagem e demais dados financeiros não são copiados para a trilha de decisão.

## Garantias

- isolamento por organização e perfil financeiro;
- vínculo explícito entre candidatura, origem e alvo, sem inferência por texto;
- mesma regra determinística para CSV, OFX, mensagem bancária e IA;
- idempotência e segurança sob varreduras concorrentes;
- `expectedFingerprint` para decisão otimista;
- revalidação do alvo imediatamente antes do efeito;
- origem descartada ou resolvida não produz efeito;
- duplicidade aprovada não altera lançamento financeiro;
- conciliação confirma alvo, origem, irmãs e auditoria atomicamente;
- nenhum CSV/OFX ou texto bruto de mensagem é necessário ou persistido;
- payloads aninhados continuam sob o contrato estrito de domínio e PostgreSQL.

## Validação

A cobertura da issue #566 inclui origens CSV, OFX, mensagem bancária e IA sobre o mesmo scanner, repetição/concorrência da varredura, isolamento por perfil, edição da origem, mudança do alvo, aprovação de duplicidade e conciliação, regra rígida de transferência e rollback transacional.
