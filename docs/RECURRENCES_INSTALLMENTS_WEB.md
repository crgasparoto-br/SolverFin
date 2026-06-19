# Recorrencias e parcelas no MVP web

## Objetivo

A rota `/recorrencias` torna recorrencias e parcelas visiveis na experiencia navegavel do MVP. Ela evita tratar compromissos previsiveis como lancamentos manuais simples e usa o contrato existente da API de recorrencias.

## Capacidades expostas

- Listar recorrencias do perfil financeiro ativo via `GET /api/recurrences?status=all`.
- Criar recorrencia com descricao, frequencia, valor, data inicial, data final opcional, conta e categoria.
- Editar recorrencias pelo contrato `PATCH /api/recurrences/:recurrenceId`.
- Pausar, retomar e cancelar recorrencias conforme status atual.
- Gerar parcelas via `POST /api/recurrences/:recurrenceId/generate-installments`.
- Exibir na tela as parcelas retornadas pela geracao, com sequencia, vencimento, valor e status.

## Estados de interface

A tela diferencia recorrencias ativas, pausadas e canceladas no resumo inicial. Estados vazios, erro de carregamento, sucesso e falha de acao usam mensagens voltadas ao usuario final.

## Tenant e perfil financeiro

A web continua usando o proxy autenticado do servidor SSR. As chamadas seguem a sessao atual e preservam isolamento por organizacao e perfil financeiro no backend.

## Limite conhecido

O backend ja persiste parcelas geradas, mas ainda nao expoe uma rota de leitura dedicada para listar parcelas historicas de uma recorrencia. Por isso, nesta entrega a web mostra as parcelas retornadas imediatamente pela acao de geracao. Uma evolucao natural e adicionar `GET /api/recurrences/:recurrenceId/installments` para reabrir a tela e consultar parcelas ja geradas anteriormente.
