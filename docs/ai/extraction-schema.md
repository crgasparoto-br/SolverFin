# Schema de extracao de lancamentos

Este documento descreve o contrato estruturado usado para transformar uma resposta de IA em uma sugestao de lancamento financeiro revisavel.

O schema fica em `@solverfin/ai` e deve ser usado antes de qualquer sugestao automatica entrar no fluxo financeiro. Saidas incompletas, invalidas ou com baixa confianca nao devem criar lancamentos diretamente; elas seguem para revisao.

## Campos aceitos

| Campo | Obrigatorio | Regra |
| --- | --- | --- |
| `amount` | Sim, quando `amountMinor` nao vier | Numero positivo em reais/unidade cheia ou texto localizado, como `1.234,56`. |
| `amountMinor` | Sim, quando `amount` nao vier | Inteiro positivo em centavos/unidade minoritaria. |
| `currency` | Sim | Codigo de 3 letras. O valor e normalizado para maiusculas, como `BRL`. |
| `occurredOn` ou `date` | Sim | Data em `YYYY-MM-DD`, data/hora ISO ou `DD/MM/YYYY`. O valor e normalizado para `YYYY-MM-DD`. |
| `type` | Sim | `income`, `expense`, `transfer` ou `unknown`. O valor e normalizado para minusculas. |
| `merchant` | Nao | Texto curto do estabelecimento ou contraparte. |
| `accountHint` | Nao | Pista de conta, banco ou carteira. |
| `cardHint` | Nao | Pista de cartao, como final ou apelido. |
| `categorySuggestion` | Nao | Categoria sugerida para revisao. |
| `confidence` | Sim | Numero entre `0` e `1`. Abaixo de `0.7`, a sugestao precisa de revisao. |
| `source` | Sim | `bank_message`, `shared_text`, `import` ou `manual_note`. |
| `reasons` | Sim | Lista com pelo menos uma justificativa textual nao vazia. |

Qualquer campo fora da lista e tratado como inesperado. Isso evita que respostas livres do provedor sejam aceitas como contrato publico.

## Normalizacao

- Valores monetarios sao convertidos para `amountMinor`, usando arredondamento para centavos.
- `currency` e convertida para maiusculas.
- Datas validas sao convertidas para `YYYY-MM-DD`.
- Datas impossiveis, como `2026-02-31`, sao rejeitadas.
- Tipos e fontes sao normalizados para minusculas antes da validacao.
- Textos opcionais vazios sao ignorados.

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
    "merchant": "Mercado Demo",
    "categorySuggestion": "Alimentacao",
    "confidence": 0.86,
    "source": "bank_message",
    "reasons": ["Valor e data encontrados em mensagem ficticia."]
  },
  "problems": []
}
```

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

```json
{
  "status": "needs_review",
  "suggestion": {
    "amountMinor": 2500,
    "currency": "BRL",
    "occurredOn": "2026-06-16",
    "type": "expense",
    "confidence": 0.42,
    "source": "shared_text",
    "reasons": ["Texto incompleto, mas contem valor e data."]
  },
  "problems": [{ "code": "EXTRACTION_LOW_CONFIDENCE", "field": "confidence" }]
}
```

## Uso recomendado

1. Envie ao provedor somente dados minimizados e consentidos, conforme `docs/ai/providers.md`.
2. Valide a resposta com `validateTransactionExtraction`.
3. Aplique automaticamente apenas resultados `valid` quando o fluxo de produto permitir.
4. Envie resultados `needs_review` e `invalid` para uma experiencia de revisao, exibindo os problemas relevantes em linguagem clara.
