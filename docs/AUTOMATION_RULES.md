# Regras automáticas configuráveis

## Objetivo

Regras automáticas classificam ou enriquecem sugestões pendentes antes de aprendizado, histórico ou IA. Elas são determinísticas, configuráveis por perfil financeiro e produzem explicação para revisão humana, sem confirmar efeito financeiro irreversível.

## Condições e ações

Condições suportadas: descrição, estabelecimento, valor igual/mínimo/máximo, conta, cartão e tipo da movimentação. Textos são comparados sem diferenciar caixa e acentos. Regras sem condição não são aplicadas.

Ações suportadas: categoria, conta, cartão, etiquetas e status compatível. Maior `priority` vence; em empate, vence a regra criada antes. Regras posteriores ainda podem preencher campos não definidos pelas anteriores.

## Precedência com categorização inteligente

Uma regra explícita que produz uma categoria elegível tem prioridade máxima. Regras que alteram somente conta, cartão, etiquetas ou status continuam pertencendo ao motor geral de automação, mas não encerram a resolução de categoria: esses enriquecimentos permanecem na candidatura enquanto a categoria ainda pode vir, nessa ordem, de correções confirmadas do perfil, histórico categorizado ou provider de IA. Nenhuma dessas fontes posteriores pode sobrescrever uma categoria válida produzida por regra.

A categoria proposta por regra é revalidada no momento da categorização contra `organizationId`, `financialProfileId`, tipo do lançamento e estado ativo. Categoria arquivada, incompatível ou pertencente a outro perfil não é aplicada nem substituída silenciosamente por aprendizado/IA; a candidatura cai em revisão manual para nova escolha.

A implementação completa da precedência, aprendizado reversível, idempotência e fallback de revisão está documentada em `docs/ai/category-learning.md`.

## Fonte dos dados

A aplicação percorre sugestões `transaction_extraction` pendentes e lê exclusivamente o payload estruturado. Valor, data, descrição, conta e categoria nunca são reconstruídos de `explanation`. Sugestão sem payload compatível é ignorada e não gera nova proposta.

Cada aplicação cria uma sugestão `categorization` com payload V1 conforme `docs/AI_SUGGESTION_PAYLOADS.md`, incluindo:

- alvo e sugestão de origem explícitos;
- fingerprint da origem;
- categoria, conta, cartão ou status propostos;
- categoria anterior quando disponível;
- ID da regra prioritária vencedora em `origin.ruleId`, quando disponível;
- motivos de todas as regras aplicadas em `reasons`;
- `provider: solverfin-automation` para decisões originadas por regra.

O contrato V1 registra um único `ruleId` de origem. As demais regras que contribuíram para campos ainda vazios permanecem auditáveis pelos motivos estruturados, sem alegar persistência de vários IDs no mesmo payload.

A explicação permanece apenas apresentacional.

## Persistência e API

A tabela `AutomationRule` isola regras por `organizationId` e `financialProfileId`.

```http
GET /api/automation-rules?status=all
POST /api/automation-rules
PATCH /api/automation-rules/:ruleId
POST /api/automation-rules/:ruleId/archive
POST /api/automation-rules/apply
```

Exemplo de criação:

```json
{
  "name": "Mercado vira Alimentação",
  "priority": 100,
  "descriptionIncludes": "mercado",
  "kind": "expense",
  "actionCategoryId": "CATEGORY_ID",
  "explanation": "Compras com mercado costumam ser alimentação."
}
```

## UI e falhas

`Configurações` mantém as seções `/configuracoes?section=profiles` e `/configuracoes?section=rules`. A lista mostra nome, status, prioridade, condições, ações e explicação. A mesma seção exibe os aprendizados por correção, permite ignorar/reverter sinais e executar a categorização das sugestões pendentes. Referências desconhecidas usam `Não reconhecido`, sem expor ID técnico.

Falha ao listar regras mostra estado de erro. Contas e categorias são dependências independentes do formulário. Valores aceitam ponto ou vírgula com no máximo duas casas e são enviados em unidades minoritárias.

## Testes

A cobertura deve provar match, não-match, prioridade, regra inativa, isolamento por tenant, produção de payload categorizado, precedência sobre aprendizado/histórico/IA, categoria de regra arquivada/fora do perfil e continuidade da categorização quando a regra não produz categoria. Testes de contrato validam fingerprint, campos permitidos e privacidade da projeção pública.
