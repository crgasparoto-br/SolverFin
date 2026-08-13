# ADR 0011 - Assistente financeiro conversacional somente leitura

- Status: Aceito
- Data: 2026-08-12
- Issue: #568

## Contexto

O SolverFin precisa responder perguntas financeiras usando dados reais do perfil ativo sem permitir que uma resposta generativa altere o ledger, misture tenants ou transforme o provider em fonte de verdade quantitativa. O fluxo tambem precisa sobreviver a restart, retry, concorrencia, cancelamento, troca de perfil e revogacao de consentimento.

## Decisao

Adotar um assistente com tres camadas independentes:

1. **estado conversacional duravel no PostgreSQL**, escopado por organizacao, perfil e usuario, com versao, idempotencia, estados terminais e TTL;
2. **evidencia financeira deterministica**, calculada no backend a partir de consultas tenant-scoped e separada por moeda;
3. **provider opcional de apresentacao controlada**, executado somente depois do calculo, com consentimento revalidado, payload minimizado e saida restrita às diretivas fechadas `DIRECT` ou `CONTEXTUAL`.

O provider nao pode introduzir fatos, numeros, diagnosticos, recomendacoes nem texto financeiro livre. Qualquer saida diferente de `DIRECT` ou `CONTEXTUAL` e descartada integralmente; a resposta publica continua sendo composta pelo backend a partir da evidencia deterministica.

O assistente e estritamente somente leitura. Cancelar, limpar e expirar sao transicoes do proprio estado conversacional; nenhuma dessas acoes altera registros financeiros.

## Persistencia

`FinancialAssistantConversation` e `FinancialAssistantTurn` armazenam apenas o minimo necessario para continuidade, idempotencia e auditoria operacional da conversa: pergunta normalizada, intent, filtros, evidencia estruturada e resposta segura.

Prompt bruto e resposta bruta do provider nao sao persistidos.

## Concorrencia

Uma conversa permite um turno `PROCESSING` por vez. O registro da conversa e bloqueado com `FOR UPDATE`, a chave de idempotencia possui unicidade no banco e a versao da conversa impede uma finalizacao antiga de sobrescrever cancelamento/expiracao.

A criacao/leitura do contexto usa advisory lock por organizacao/usuario para serializar troca de perfil e garantir um contexto aberto compatível.

## Privacidade e autorizacao

Toda consulta financeira inclui organizacao/perfil e moeda. O outbound nao recebe IDs de tenant, base bruta nem IDs internos. Antes de cada tentativa, `runAiTask` usa um resolvedor autoritativo que reautentica e reconfirma tenant/perfil e consentimento.

A API publica redige evidencia persistida, IDs internos, chave de idempotencia e failure codes.

## Consequencias

### Positivas

- valores continuam verificaveis e independentes do modelo;
- restart/retry nao perde o contexto;
- concorrencia e duplicacao possuem comportamento deterministico;
- provider pode ser desligado sem inutilizar as consultas suportadas;
- fronteira somente leitura fica explicita em API e UI.

### Custos

- duas novas tabelas e politica de expiracao precisam ser mantidas;
- novas intencoes exigem calculador deterministico antes de qualquer diretiva de apresentacao externa;
- perguntas em multiplas moedas exigem esclarecimento ou suporte explicito, nunca conversao implicita.

## Alternativas rejeitadas

- **Guardar conversa apenas em memoria:** falha em restart e multipla instancia.
- **Enviar consultas SQL/dados brutos ao provider:** amplia exposicao e torna o modelo parte do calculo financeiro.
- **Permitir que a IA calcule valores:** reduz verificabilidade e pode inventar fatos.
- **Usar a mesma conversa entre perfis/moedas:** viola isolamento e facilita mistura de contexto.
