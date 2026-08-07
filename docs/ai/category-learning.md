# Categorização inteligente e aprendizado por correção

A categorização inteligente usa o mesmo contrato estruturado de sugestões para CSV, OFX, mensagens bancárias coladas/compartilhadas e qualquer outra origem que já produza `transaction_extraction`. Nenhuma origem é interpretada por texto de `explanation`.

## Precedência

A decisão segue uma ordem única e explícita:

1. regras determinísticas/configuradas pelo usuário;
2. correções confirmadas do mesmo perfil financeiro;
3. histórico categorizado do mesmo perfil;
4. provider de IA autorizado e configurado;
5. revisão manual quando não existe evidência segura.

Uma regra explícita nunca é sobrescrita por aprendizado, histórico ou IA. A IA recebe somente campos allowlisted e minimizados e precisa devolver uma categoria já existente; categoria ausente, arquivada, incompatível ou de baixa confiança degrada para revisão.

Quando a IA é necessária, a lista de categorias elegíveis é enviada com tokens opacos locais (`c1`, `c2`, ...), acompanhados somente pelos nomes necessários para classificação. UUIDs internos de categoria não são enviados ao provider. O token retornado é validado e convertido novamente para o `categoryId` real dentro do backend.

## Payload `categorization`

Cada execução cria uma sugestão `categorization` V1 revisável com:

- `sourceSuggestionId` apontando para a `transaction_extraction` de origem;
- `audit.sourceFingerprint` preservando o fingerprint observado da origem;
- `proposedCategoryId`, conta, cartão ou status somente quando houver decisão válida;
- origem estruturada, confiança e motivos;
- fingerprint canônico do payload.

A versão da decisão considera regras, aprendizados, categorias e histórico relevante. A combinação de perfil, sugestão de origem e versão da decisão é idempotente no banco. Quando a base muda, uma nova decisão pode substituir a candidatura pendente anterior sem alterar lançamentos históricos.

## Aprendizado por correção

Uma correção confirmada cria ou reforça `CategoryLearningEntry`, sempre limitada a `organizationId` e `financialProfileId`. O sinal guarda merchant/descrição normalizada, tipo do lançamento, categoria, confiança, quantidade de correções, timestamps e a proveniência mais recente (`lastSourceSuggestionId` + `lastSourceFingerprint`). A referência de origem também é protegida pelo mesmo contexto de organização e perfil.

Correções feitas em CSV/OFX e no fluxo **Corrigir e aprovar** da Inbox são persistidas na mesma transação da alteração/decisão que as originou. A categoria é revalidada como ativa, compatível com o tipo e pertencente ao perfil dentro da transação.

Correções concorrentes para o mesmo padrão e categoria convergem por lock transacional para um único aprendizado, atualizando a contagem e a proveniência em vez de criar linhas duplicadas.

O aprendizado não reescreve lançamentos antigos. Ele afeta apenas sugestões futuras.

## Conflitos e categorias indisponíveis

Correções conflitantes para o mesmo padrão são preservadas. O sistema não escolhe silenciosamente um vencedor: retorna `needs_review`, sem `categoryId`, reduz a confiança e pede nova decisão humana.

Categorias arquivadas ou incompatíveis deixam de ser elegíveis mesmo que exista aprendizado ou resposta antiga do provider apontando para elas.

## Ignorar e reverter

O usuário pode listar os aprendizados em **Configurações > Regras** e usar **Ignorar** ou **Reverter**. Ambos mantêm o histórico auditável, mas removem o sinal das próximas sugestões. A ação **Aplicar categorização** processa sugestões pendentes e as envia para revisão; não cria efeito financeiro automático.

Endpoints:

```http
GET  /api/category-learning?status=all
POST /api/category-learning/apply
POST /api/category-learning/corrections
POST /api/category-learning/:entryId/ignore
POST /api/category-learning/:entryId/revert
```

## Privacidade, auditoria e falhas

O aprendizado nunca cruza organização ou perfil. Eventos de auditoria registram contexto, identificador do aprendizado, ação, identificador da sugestão de origem e fingerprint quando disponíveis, sem armazenar descrição financeira no evento.

Provider desativado, consentimento ausente/revogado, resposta inválida ou categoria não elegível não interrompem a fila: é criada uma candidatura de revisão manual sem categoria inventada. Uma tentativa do executor continua correspondendo a no máximo uma chamada outbound.
