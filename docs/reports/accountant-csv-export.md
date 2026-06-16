# Exportacao CSV para contador e relatorios MEI

A exportacao inicial usa CSV para apoiar revisao contabil, acompanhamento MEI e analise gerencial simples.

## Filtros

- `periodStartOn`: data inicial inclusiva.
- `periodEndOn`: data final inclusiva.
- `financialProfileKind`: opcional; permite restringir a `personal`, `family`, `mei` ou `business`.
- Tenant e perfil financeiro sempre devem vir do contexto autenticado, nunca do payload livre.

## Cabecalhos

| Campo | Descricao |
| --- | --- |
| `periodo_inicio` | Inicio do periodo solicitado. |
| `periodo_fim` | Fim do periodo solicitado. |
| `data_lancamento` | Data do lancamento. |
| `tipo` | `income`, `expense` ou `transfer`. |
| `categoria` | Nome da categoria ou `Sem categoria`. |
| `descricao` | Descricao do lancamento. |
| `valor_centavos` | Valor em centavos; despesas saem negativas. |
| `moeda` | Moeda ISO 4217. |
| `contexto_financeiro` | Perfil financeiro do contexto autenticado. |
| `status` | Status do lancamento. |

## Delimitador

O padrao do MVP e ponto e virgula (`;`) para melhor compatibilidade com planilhas brasileiras. Virgula pode ser usada quando uma integracao futura exigir.

## Periodo sem dados

A exportacao deve retornar CSV valido apenas com cabecalho e quebra de linha final.

## Erros controlados

- Periodo inicial maior que final: `ACCOUNTANT_EXPORT_PERIOD_INVALID`.
- Usuario sem acesso ao tenant/perfil: erro de tenant/autorizacao do dominio.
- Falha inesperada: contrato de erro da API com correlation id, sem payload financeiro no log.

## Limitacoes conhecidas

- Impostos, clientes e anexos entram apenas quando o modelo persistente expuser esses campos.
- PDF e relatorios contabeis ricos ficam para issue futura.
- Regras fiscais definitivas dependem de validacao contabil/produto.
