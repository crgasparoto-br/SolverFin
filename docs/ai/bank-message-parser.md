# Parser de mensagens bancarias

O parser de mensagens bancarias transforma textos colados ou compartilhados em sugestoes revisaveis de lancamento financeiro. Ele nao cria lancamentos definitivos sozinho.

## Fluxo

1. Normaliza o texto recebido, removendo espacos repetidos e quebras excessivas.
2. Mascara numeros longos antes de expor texto em resultado, UI ou logs.
3. Tenta regras deterministicas para formatos simples.
4. Quando nenhuma regra reconhece a mensagem, usa provider de IA somente se `context`, `policy` e `provider` forem informados e a politica permitir.
5. Valida toda saida de regra ou IA com `validateTransactionExtraction`.
6. Retorna `suggested` apenas para sugestoes validas; casos ambiguos, invalidos, bloqueados ou de baixa confianca retornam `needs_review`.

## Regras iniciais

| Regra              | Exemplo ficticio suportado                         | Tipo gerado |
| ------------------ | -------------------------------------------------- | ----------- |
| `card_purchase_v1` | Compra aprovada no cartao em estabelecimento com R$ | `expense`   |
| `pix_received_v1` | Pix recebido de uma contraparte com R$              | `income`    |
| `pix_sent_v1`     | Pix enviado ou transferencia enviada com R$         | `expense`   |

As regras exigem valor em reais e data reconhecivel para gerar sugestao automatica. Se a mensagem tiver valor, mas nao tiver data clara, o parser retorna `needs_review` com problema de data obrigatoria.

## Resultado revisavel

Uma sugestao inclui:

- valor normalizado em `amountMinor`;
- moeda normalizada;
- data em `YYYY-MM-DD`;
- tipo do lancamento;
- estabelecimento, conta ou cartao quando identificados;
- `confidence`;
- `sourceKind`, como `rule` ou `ai`;
- `ruleId` ou `providerId`/`model`;
- `explanation` e `reasons`;
- `maskedText`.

## IA e consentimento

A IA e chamada apenas quando o fallback por regra nao encontra um caso simples e quando a chamada recebe provider, contexto e politica. A politica existente em `@solverfin/ai` continua sendo a camada de consentimento, tamanho maximo, sanitizacao e logs seguros.

Se a IA estiver bloqueada por consentimento, indisponivel ou devolver saida invalida, o resultado volta como `needs_review` e nao carrega lancamento automatico.

## Fixtures

Os testes usam somente mensagens ficticias, cobrindo:

- compra no cartao;
- pix recebido;
- mensagem com valor sem data clara;
- provider mock com saida valida;
- provider bloqueado por consentimento;
- provider com saida invalida.
