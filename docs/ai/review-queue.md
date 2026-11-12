# Fila de revisao de sugestoes da IA

A fila de revisao centraliza sugestoes pendentes antes que elas virem lancamentos financeiros definitivos. Ela existe para manter controle humano, rastreabilidade e explicabilidade nas automacoes do SolverFin.

## O que cada item deve exibir

Cada item de revisao deve apresentar:

- origem da sugestao (`ai`, `rule`, `import` ou `automation`);
- confianca numerica;
- explicacao curta do motivo da sugestao;
- resumo mascarado para exibicao segura;
- dados propostos do lancamento, como tipo, valor, data, conta e categoria;
- sinalizacao de baixa confianca quando a confianca ficar abaixo de `0.7`.

Dados sensiveis devem ser mascarados antes de chegar na UI. A fila trabalha com `maskedSummary` para evitar que logs, fixtures e telas de diagnostico exibam dados brutos.

## Estados suportados

- `pending_review`: sugestao ainda precisa de decisao do usuario.
- `approved`: sugestao foi aprovada e convertida em lancamento.
- `edited`: usuario ajustou a proposta antes de aprovar ou descartar.
- `rejected`: sugestao foi recusada.
- `expired`: sugestao nao deve mais aparecer como pendente.

A listagem padrao retorna apenas `pending_review` do tenant/contexto ativo e oculta baixa confianca. Chamadas de API podem usar uma opcao explicita para incluir baixa confianca em telas dedicadas de revisao cuidadosa.

## Decisoes do usuario

### Aprovar

A aprovacao cria um lancamento com `source: "ai_suggestion"`, vincula `aiSuggestionId` ao lancamento criado e marca a sugestao como `approved`. A decisao gera auditoria da sugestao e o lancamento mantem auditoria de criacao com campos redigidos.

### Rejeitar

A rejeicao marca a sugestao como `rejected`, registra quem decidiu, quando decidiu e um motivo seguro. O historico preserva diagnostico sem armazenar payload sensivel em texto livre.

### Ajustar

O ajuste marca a sugestao como `edited`, devolve um item com a proposta alterada e registra auditoria redigida por campo (`changed`, `added` ou `removed`). A aprovacao posterior deve usar a proposta ajustada.

## Isolamento

Todas as operacoes passam pelo contexto ativo de tenant e perfil financeiro. Sugestoes de outro contexto nao aparecem na listagem e nao podem ser aprovadas, rejeitadas ou ajustadas.

## Testes

Os testes usam apenas merchants, contas e resumos ficticios. Eles cobrem:

- listagem com origem, confianca, explicacao e resumo mascarado;
- aprovacao criando lancamento auditado;
- rejeicao auditada;
- ajuste auditado;
- bloqueio de acesso entre tenants/contextos.
