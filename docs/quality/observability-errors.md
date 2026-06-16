# Observabilidade e contrato de erro

## Contrato de erro de API

Erros controlados devem retornar:

```json
{
  "error": {
    "code": "TENANT_ACCESS_DENIED",
    "message": "Acesso negado ao contexto financeiro.",
    "correlationId": "corr-demo-123"
  }
}
```

Regras:

- `code` deve ser estavel para diagnostico.
- `message` deve ser segura para usuario final.
- `correlationId` deve vir de `x-correlation-id` quando valido ou ser gerado pela API.
- Stack trace, payload financeiro, tokens e identificadores completos nao entram na resposta.

## Logging seguro

Logs operacionais devem conter correlation id, codigo, rota e status. Nao devem conter numero completo de conta/cartao, documentos, mensagens bancarias brutas, tokens ou corpo completo de requisicao.

Eventos recomendados:

- `info`: inicio/fim de operacoes esperadas.
- `warn`: validacao, acesso negado, recurso ausente e provider externo indisponivel com fallback.
- `error`: falha inesperada sem detalhes sensiveis.

## Frontend

Falhas de renderizacao ou carregamento devem mostrar acao clara, como tentar novamente ou revisar filtros. Mensagens visiveis devem evitar termos tecnicos e explicar o que a pessoa pode fazer.

## Testes

- `apps/api/src/errors.test.ts` cobre formato de erro, correlation id e logs sem payload sensivel.
- Mudancas futuras em endpoints devem reutilizar o contrato antes de criar formatos novos.
