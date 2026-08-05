# Regras automáticas configuráveis

## Objetivo

Regras automáticas classificam ou enriquecem sugestões pendentes antes de acionar IA. Elas são determinísticas, configuráveis por perfil financeiro e produzem explicação para revisão humana, sem confirmar efeito financeiro irreversível.

## Condições e ações

Condições suportadas: descrição, estabelecimento, valor igual/mínimo/máximo, conta, cartão e tipo da movimentação. Textos são comparados sem diferenciar caixa e acentos. Regras sem condição não são aplicadas.

Ações suportadas: categoria, conta, cartão, etiquetas e status compatível. Maior `priority` vence; em empate, vence a regra criada antes. Regras posteriores ainda podem preencher campos não definidos pelas anteriores.

## Fonte dos dados

A aplicação percorre sugestões `transaction_extraction` pendentes e lê exclusivamente o payload estruturado. Valor, data, descrição, conta e categoria nunca são reconstruídos de `explanation`. Sugestão sem payload compatível é ignorada e não gera nova proposta.

Cada aplicação cria uma sugestão `categorization` com payload V1 conforme `docs/AI_SUGGESTION_PAYLOADS.md`, incluindo:

- alvo e sugestão de origem explícitos;
- fingerprint da origem;
- categoria, conta, cartão ou status propostos;
- categoria anterior quando disponível;
- ID da regra prioritária vencedora em `origin.ruleId`, quando disponível;
- motivos de todas as regras aplicadas em `reasons`;
- `provider: solverfin-automation` e `model: automation-rules-v1`.

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

`Configurações` mantém as seções `/configuracoes?section=profiles` e `/configuracoes?section=rules`. A lista mostra nome, status, prioridade, condições, ações e explicação. Referências desconhecidas usam `Não reconhecido`, sem expor ID técnico.

Falha ao listar regras mostra estado de erro. Contas e categorias são dependências independentes do formulário. Valores aceitam ponto ou vírgula com no máximo duas casas e são enviados em unidades minoritárias.

## Testes

A cobertura deve provar match, não-match, prioridade, regra inativa, isolamento por tenant, produção de payload categorizado e ausência de parsing da explicação. Testes de contrato validam fingerprint, campos permitidos e privacidade da projeção pública.
