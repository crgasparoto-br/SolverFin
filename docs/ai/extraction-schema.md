# Schema de extracao de lancamentos

Este documento descreve o contrato estruturado usado para transformar uma resposta de IA em uma sugestao de lancamento financeiro revisavel.

O schema fica em `@solverfin/ai` e deve ser usado antes de qualquer sugestao automatica entrar no fluxo financeiro. Saidas incompletas, invalidas ou com baixa confianca nao devem criar lancamentos diretamente; elas seguem para revisao.

## Campos aceitos

| Campo                  | Obrigatorio                        | Regra                                                                                         |
| ---------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `amount`               | Sim, quando `amountMinor` nao vier | Numero positivo em reais/unidade cheia ou texto localizado, como `1.234,56`.                  |
| `amountMinor`          | Sim, quando `amount` nao vier      | Inteiro positivo em centavos/unidade minoritaria.                                             |
| `currency`             | Sim                                | Codigo de 3 letras. O valor e normalizado para maiusculas, como `BRL`.                        |
| `occurredOn` ou `date` | Sim                                | Data em `YYYY-MM-DD`, data/hora ISO ou `DD/MM/YYYY`. O valor e normalizado para `YYYY-MM-DD`. |
| `type`                 | Sim                                | `income`, `expense`, `transfer` ou `unknown`. O valor e normalizado para minusculas.          |
| `direction`            | Sim para `transfer`                | `inflow` ou `outflow`. Receita infere `inflow`; despesa infere `outflow`.                     |
| `merchant`             | Nao                                | Texto curto do estabelecimento ou contraparte.                                                |
| `accountHint`          | Nao                                | Pista de conta, banco ou carteira.                                                            |
| `cardHint`             | Nao                                | Pista de cartao, como final ou apelido.                                                       |
| `categorySuggestion`   | Nao                                | Categoria sugerida para revisao.                                                              |
| `confidence`           | Sim                                | Numero entre `0` e `1`. Abaixo de `0.7`, a sugestao precisa de revisao.                       |
| `source`               | Sim                                | `bank_message`, `shared_text`, `import` ou `manual_note`.                                     |
| `reasons`              | Sim                                | Lista com pelo menos uma justificativa textual nao vazia.                                     |

Qualquer campo fora da lista e tratado como inesperado. Isso evita que respostas livres do provedor sejam aceitas como contrato publico.

## Normalizacao

- Valores monetarios sao convertidos para `amountMinor`, usando arredondamento para centavos.
- `currency` e convertida para maiusculas.
- Datas validas sao convertidas para `YYYY-MM-DD`.
- Datas impossiveis, como `2026-02-31`, sao rejeitadas.
- Tipos, fontes e direcao sao normalizados para minusculas antes da validacao.
- Receita sem direcao explicita recebe `inflow`; despesa recebe `outflow`.
- Transferencia sem direcao retorna `needs_review` com `EXTRACTION_DIRECTION_REQUIRED` e nao pode ser persistida como sugestao financeira.
- Direcao contraditoria ao tipo e rejeitada com `EXTRACTION_DIRECTION_CONFLICT`.
- Textos opcionais vazios sao ignorados.

## Integracao com mensagens bancarias

A Inbox executa regras deterministicas antes do provider. Ambas as fontes produzem o mesmo `BankMessageParserResult` e passam pela mesma composicao persistente.

Uma regra deterministica encerra o fluxo sem IA somente quando produz `suggestion`. Se ela reconhecer parte da mensagem, mas faltar campo obrigatorio como data, o consumidor pode consultar o provider autorizado para completar a estrutura. Sem provider disponivel, o resultado permanece `incomplete`, com origem deterministica e sem sugestao inventada.

Quando a regra reconhece a mensagem por completo, a origem persistida e `rule` com `ruleId`. Quando a IA completa a extracao, a origem e `provider` com provider e modelo. `accountHint`, `cardHint` e `categorySuggestion` permanecem apenas como motivos mascarados; eles nunca substituem `accountId`, `cardId` ou `categoryId` confiaveis do produto.

O servico aceita `income`, `expense` e `transfer` como sugestao revisavel quando a estrutura e valida. Transferencia exige `direction=inflow|outflow`; sem direcao segura, permanece como diagnostico controlado sem payload financeiro. `unknown`, resposta invalida ou estrutura incompleta tambem nao produzem sugestao financeira.

Conta e categoria opcionais recebidas da interface sao validadas por formato, organizacao, perfil financeiro e estado ativo antes da selecao do provider. A composicao adiciona esses IDs, o hash contextual, o fingerprint e a auditoria depois da validacao da resposta.

## Persistencia da sugestao revisavel

A saida normalizada do provedor nao e persistida diretamente como objeto livre. Quando o fluxo cria uma `AiSuggestion`, ele a converte para o envelope canonico de `docs/AI_SUGGESTION_PAYLOADS.md`.

Para `transaction_extraction`, o payload persistido e uma uniao versionada:

- `contractVersion: 1` identifica o contrato comum;
- `suggestionKind: transaction_extraction` discrimina a especie;
- `payloadVersion: 1` representa receita ou despesa;
- `payloadVersion: 2` inclui transferencia e `direction`;
- `origin`, `target`, `fingerprint`, `reasons` e `audit` registram proveniencia e controle de obsolescencia;
- `sourceRowNumber`, `sourceHash`, `occurredOn`, `kind`, `direction`, `amountMinor`, `currency` e `description` permanecem no nivel raiz do envelope;
- conta, outra conta, categoria e identificador externo sao opcionais e tipados.

O formato plano dos campos especificos preserva compatibilidade com os leitores V1/V2 existentes, enquanto `contractVersion` e `suggestionKind` permitem distinguir o contrato atual de registros legados. Leitores novos devem usar `readAiSuggestionPayload`; adaptadores legados podem ler os campos transacionais somente depois que o tipo esperado foi conhecido.

Registros legados estruturados continuam legiveis. Eles nao sofrem backfill em massa: uma mutacao compativel de sugestao pendente os encapsula no envelope atual. Sugestoes resolvidas permanecem imutaveis.

`explanation` e apenas apresentacional. Valor, data, conta, categoria, tipo, transferencia e vinculos nunca podem ser reconstruidos desse texto para produzir efeito financeiro.

A persistencia e a API rejeitam payload ausente, invalido, com tipo divergente, versao nao suportada ou fingerprint obsoleto. Objetos aninhados aceitam somente as chaves documentadas, impedindo que prompt bruto, mensagem bancaria ou resposta de provedor sejam armazenados dentro do contrato.

## Exemplo valido

```json
{
  "amount": "1.234,56",
  "currency": "brl",
  "date": "16/06/2026",
  "type": "EXPENSE",
  "merchant": "Mercado Demo",
  "categorySuggestion": "Alimentacao",
  "confidence": 0.86,
  "source": "bank_message",
  "reasons": ["Valor e data encontrados em mensagem ficticia."]
}
```

Resultado esperado:

```json
{
  "status": "valid",
  "suggestion": {
    "amountMinor": 123456,
    "currency": "BRL",
    "occurredOn": "2026-06-16",
    "type": "expense",
    "direction": "outflow",
    "merchant": "Mercado Demo",
    "categorySuggestion": "Alimentacao",
    "confidence": 0.86,
    "source": "bank_message",
    "reasons": ["Valor e data encontrados em mensagem ficticia."]
  },
  "problems": []
}
```

## Exemplo de transferencia valida

```json
{
  "amountMinor": 4200,
  "currency": "BRL",
  "occurredOn": "2026-08-05",
  "type": "transfer",
  "direction": "outflow",
  "confidence": 0.91,
  "source": "bank_message",
  "reasons": ["A mensagem informa transferencia enviada."]
}
```

Sem `direction`, o resultado e `needs_review`, inclui `EXTRACTION_DIRECTION_REQUIRED` e permanece sem payload financeiro persistivel.

## Exemplo invalido

```json
{
  "amount": "abc",
  "currency": "BRL",
  "type": "expense",
  "confidence": 0.9,
  "source": "bank_message",
  "reasons": ["valor ilegivel"],
  "unexpected": "field"
}
```

Resultado esperado:

```json
{
  "status": "invalid",
  "problems": [
    { "code": "EXTRACTION_FIELD_UNEXPECTED", "field": "unexpected" },
    { "code": "EXTRACTION_AMOUNT_INVALID", "field": "amount" },
    { "code": "EXTRACTION_DATE_REQUIRED", "field": "occurredOn" }
  ]
}
```

## Baixa confianca

Uma saida estruturalmente valida com `confidence` abaixo de `0.7` retorna `needs_review`. A sugestao normalizada fica disponivel para a tela ou fila de revisao, mas nao deve ser aplicada automaticamente.

## Uso recomendado

1. Envie ao provedor somente dados minimizados e consentidos, conforme `docs/ai/providers.md`.
2. Valide a resposta com `validateTransactionExtraction`.
3. Converta a saida valida para `buildAiSuggestionPayload` antes da persistencia.
4. Aplique automaticamente apenas resultados `valid` quando o fluxo de produto permitir.
5. Envie resultados `needs_review` e `invalid` para uma experiencia de revisao, exibindo os problemas relevantes em linguagem clara.
