# Inventario de agregacao multi-moedas

Este documento registra o recorte executado pela issue #595 para aplicar a ADR 0013 aos servicos financeiros que calculam ou expÃµem totais. A regra comum e simples: sem conversao cambial explicita, valores de moedas diferentes permanecem separados.

## Contrato comum

- A moeda e obtida do registro financeiro ou de filtro financeiro explicito, nunca de formatter de interface.
- Agregacoes multi-moedas usam `currencyBlocks` quando o contrato retorna um conjunto de totais por moeda.
- `currencyBlocks` e ordenado pelo codigo ISO 4217.
- Contratos que ja retornam itens independentes com `currency` podem preservar a forma, desde que nunca somem moedas diferentes.
- Compatibilidade escalar so e permitida quando existe exatamente uma moeda conhecida e os valores sao copiados do bloco dessa moeda.
- Sem dados nao se inventa BRL nem um total monetario sintetico.
- Conversao, taxa de cambio e moeda de referencia permanecem fora deste recorte.

## Inventario

| Area                          | Contrato observado                                                                   | Estado apos #595                                                                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------ | --------------------------------¶»§q«^