# Fila de revisão de sugestões

## Objetivo

A Inbox concentra a revisão humana de sugestões produzidas por importação, regras, automações, aprendizado, histórico, sistema ou IA. Nenhuma sugestão incerta produz efeito financeiro sem decisão explícita.

A fila unificada cobre `transaction_extraction`, `categorization`, `deduplication`, `reconciliation` e `insight`. Cada item apresenta tipo, estado, origem, confiança, explicação e alvo em linguagem de produto. Identificadores técnicos podem existir como referências escopadas no payload autenticado para preencher controles da revisão, mas a interface resolve essas referências para nomes e rótulos e não as usa como identificação visível do item.

## Payload estruturado

`AiSuggestion.payload` segue o contrato comum de `docs/AI_SUGGESTION_PAYLOADS.md`: envelope discriminado, versão, origem, alvo, confiança, motivos, auditoria e fingerprint canônico.

`explanation` é somente texto apresentacional. Data, valor, descrição, conta, categoria e vínculos financeiros vêm exclusivamente do payload estruturado. Payload ausente, legado incompatível ou versão não suportada permanece sem efeito automático e retorna erro controlado.

Extrações novas usam `TransactionExtractionSuggestionPayloadV2`; V1 continua legível. Deduplicação, conciliação e categorização dependentes mantêm vínculo explícito com a sugestão de origem e o fingerprint observado.

## Fila unificada na Inbox

A área **Outras sugestões** carrega a fila completa e oferece filtros por:

- `kind`;
- `status`;
- `confidence`;
- `profileId`.

`kind`, `status` e `confidence` são preservados na URL; `profileId` continua sendo o recorte tenant já usado pelas demais telas. A listagem da API aceita `kind`, `status`, `includeLowConfidence` e `profileId`; o filtro visual de confiança é aplicado sobre essa projeção completa.

A interface possui estados explícitos de carregamento, vazio, erro com nova tentativa, indisponibilidade temporária com nova tentativa, baixa confiança e conflito de versão. Falhas transitórias reconhecidas por HTTP `408`, `425`, `429`, `502`, `503` ou `504`, ou por códigos equivalentes de timeout/rate limit/unavailable, usam mensagem e estilo próprios para não se confundirem com erro permanente. O detalhe e a edição usam `<dialog>`, movem foco para o conteúdo editável e devolvem o foco ao acionador quando o diálogo fecha. O layout é fluido em desktop e mobile e não depende de texto técnico longo para orientar a decisão.

## Campos editáveis

A edição nunca muda arbitrariamente o payload inteiro.

- `transaction_extraction`: somente data, tipo, valor, descrição, conta, outra conta de transferência, categoria e campos equivalentes já permitidos pelo contrato de importação/revisão;
- `categorization`: somente `proposedCategoryId`;
- `deduplication`: sem edição de payload na fila;
- `reconciliation`: sem edição de payload na fila;
- `insight`: sem edição de payload na fila.

Campo fora da lista autorizada retorna `AI_REVIEW_EDIT_FIELD_UNSUPPORTED`. Tipos sem campos editáveis retornam `AI_REVIEW_EDIT_NOT_SUPPORTED`.

Uma edição aceita mantém a sugestão pendente, recalcula o fingerprint quando o payload muda e invalida candidaturas dependentes que observavam a versão anterior. Sugestões de importação continuam delegando a mutação ao fluxo canônico de importações, que também revalida lote, contas, categorias, transferências e candidatos determinísticos.

## Efeitos por tipo

A aprovação sempre revalida organização, perfil financeiro, estado, versão e elegibilidade imediatamente antes do efeito.

| Tipo                     | Efeito da aprovação                                                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transaction_extraction` | cria ou vincula o lançamento usando o contrato canônico já existente; importações continuam passando pela detecção determinística e pelas regras de transferência/conciliação |
| `categorization`         | aplica a categoria a uma `transaction_extraction` ainda pendente ou a um `Transaction` elegível; categoria arquivada, de outro perfil ou incompatível com o tipo é rejeitada  |
| `deduplication`          | usa o serviço determinístico existente para resolver a origem como duplicidade sem criar novo lançamento                                                                      |
| `reconciliation`         | usa o serviço determinístico existente para reconciliar o alvo e resolver a origem na mesma transação                                                                         |
| `insight`                | registra reconhecimento/aprovação da sugestão, sem criar nem alterar lançamento financeiro                                                                                    |

Rejeitar encerra a sugestão sem aplicar o efeito proposto. Rejeições e aprovações determinísticas continuam reutilizando os serviços especializados existentes, em vez de duplicar lógica de deduplicação ou conciliação.

## API

```http
GET /api/ai-review-queue
GET /api/ai-review-queue/:suggestionId/payload
POST /api/ai-review-queue/:suggestionId/approve
POST /api/ai-review-queue/:suggestionId/edit
POST /api/ai-review-queue/:suggestionId/reject
```

Decisões e edições podem enviar `expectedFingerprint`. A interface sempre lê a versão atual imediatamente antes da ação e envia esse fingerprint. Se outra aba ou sessão alterar a sugestão antes da gravação, a API retorna `AI_SUGGESTION_PAYLOAD_CONFLICT` ou `AI_SUGGESTION_PAYLOAD_OBSOLETE` e nenhuma parte do efeito é confirmada.

A mesma decisão repetida sobre um item já resolvido retorna o resultado persistido quando a operação é idempotente. Uma decisão oposta ou uma transição incompatível retorna conflito controlado.

A rota de payload retorna a projeção tipada e redigida. Referências internas necessárias aos controles de edição são expostas somente depois do recorte por `organizationId` e `financialProfileId`; provider bruto, prompt, resposta integral, conteúdo de arquivo/mensagem e dados fora do contrato não são retornados.

## Atomicidade, concorrência e obsolescência

As decisões passam por uma fachada transacional comum baseada em `withSharedTransaction`. Serviços de importação, deduplicação e conciliação chamados de dentro dessa fachada reutilizam a mesma conexão/transação. Assim, mudança de estado, efeito financeiro e auditoria confirmam ou fazem rollback juntos.

A sugestão é bloqueada para atualização antes da decisão. Dependências de outra sugestão continuam protegidas pelo fingerprint de origem e pelo trigger de vigência do banco. Origem ausente, lote descartado, sugestão resolvida, alvo inelegível ou fingerprint divergente preserva a consistência e retorna erro controlado.

Quando uma categorização atualiza uma extração pendente, o novo fingerprint da extração expira outras candidaturas de categorização, deduplicação ou conciliação baseadas na versão anterior, exceto a própria decisão que está sendo concluída.

## Categorização inteligente

Sugestões `transaction_extraction` pendentes podem receber candidatura `categorization` pela ordem definida em `docs/ai/category-learning.md`: regra explícita, correção confirmada, histórico, provider autorizado e revisão manual.

A fila não inventa categoria quando a evidência é inválida. Categoria arquivada/incompatível, correções conflitantes, provider desativado, consentimento ausente ou versão de origem obsoleta mantêm a sugestão sem efeito até nova revisão.

## Mensagens bancárias e importações

Mensagens bancárias e importações CSV/OFX produzem extrações estruturadas que entram na mesma fila. O texto bruto da mensagem, o conteúdo bruto do arquivo, prompts e respostas brutas de provider não são persistidos na fila.

A aprovação de extrações importadas continua usando o fluxo de `docs/IMPORTS.md`; a fila unificada não contorna candidatos determinísticos, validação de lote, idempotência ou regras de transferência.

## Auditoria e segurança

Todas as consultas e mutações exigem o mesmo `organizationId` e `financialProfileId`. Aprovação, rejeição e edição registram ator, data, ação, entidade, mudanças redigidas e, quando a requisição possui correlação, o mesmo `correlationId` do request. Mudanças redigidas indicam transição/proposta alterada sem registrar dados financeiros sensíveis.

O endpoint valida UUID antes do primeiro acesso protegido e erros públicos não revelam existência de recurso fora do contexto ativo. Payload resolvido permanece imutável pelo contrato do banco.
