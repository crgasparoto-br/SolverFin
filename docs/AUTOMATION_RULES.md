# Regras automaticas configuraveis

Este documento descreve o motor deterministico de regras automaticas e o primeiro fluxo operacional persistido do SolverFin.

## Objetivo

Regras automaticas classificam ou enriquecem sugestoes, importacoes e lancamentos pendentes antes de acionar IA. Elas sao previsiveis, configuraveis por contexto financeiro e retornam uma explicacao do motivo da aplicacao.

No fluxo operacional atual, regras aplicadas geram **sugestoes revisaveis**. Elas nao confirmam lancamentos finais nem executam efeitos financeiros irreversiveis sem revisao humana.

## Condicoes suportadas

Uma regra pode combinar uma ou mais condicoes:

- descricao contem um trecho de texto;
- merchant contem um trecho de texto;
- valor igual, minimo ou maximo;
- conta financeira;
- cartao;
- tipo da movimentacao, como receita, despesa ou transferencia.

Textos sao comparados de forma case-insensitive e sem acentos para tolerar variacoes simples, por exemplo `mercado`, `Mercado` e `mercadó`.

Regras sem nenhuma condicao nao sao aplicadas. Isso evita automacoes amplas demais por engano.

Valores permanecem persistidos e transportados pela API em unidades minoritarias inteiras. Na interface, eles sao exibidos e digitados como valores decimais com duas casas, sem simbolo de moeda. Por exemplo, `1050` na API e apresentado como `10,50`.

## Acoes suportadas

Uma regra pode preencher campos do alvo:

- categoria;
- conta financeira;
- cartao;
- tags;
- status compatível com o alvo.

A regra nao confirma uma automacao irreversivel sozinha. O resultado continua retornando o alvo enriquecido e as explicacoes para revisao ou fluxo superior.

## Prioridade e conflitos

Quando mais de uma regra combina com o mesmo alvo, regras com maior `priority` sao aplicadas primeiro. Se duas regras tentam preencher o mesmo campo, vence a primeira regra pela ordem de prioridade.

Em caso de empate, a regra criada primeiro vence. Regras de menor prioridade ainda podem preencher outros campos que nao foram preenchidos por regras anteriores.

A interface explica esse contrato como: **numeros maiores sao aplicados primeiro; em empate, vence a regra criada antes**.

## Ativacao e isolamento

Somente regras com status `active` sao consideradas. Regras `inactive` permanecem cadastradas, mas nao alteram o alvo.

Todas as regras e alvos passam pelo mesmo isolamento de tenant usado no restante do dominio. Uma regra de outro contexto financeiro e ignorada, e um alvo de outro contexto e tratado como recurso inexistente.

## Persistencia e API

A tabela `AutomationRule` persiste regras por `organizationId` e `financialProfileId`.

Endpoints operacionais:

```http
GET /api/automation-rules?status=all
POST /api/automation-rules
PATCH /api/automation-rules/:ruleId
POST /api/automation-rules/:ruleId/archive
POST /api/automation-rules/apply
```

Exemplo minimo de criacao:

```json
{
  "name": "Mercado vira Alimentacao",
  "priority": 100,
  "descriptionIncludes": "mercado",
  "kind": "expense",
  "actionCategoryId": "CATEGORY_ID",
  "explanation": "Compras com mercado costumam ser alimentacao."
}
```

A aplicacao das regras percorre sugestoes pendentes de `transaction_extraction` com dados suficientes, aplica as regras ativas do perfil e cria uma sugestao `categorization` com:

- `provider: solverfin-automation`;
- `model: automation-rules-v1`;
- `status: pending_review`.

## UI

A rota `Configurações` possui duas secoes SSR acessiveis por links GET reais:

- `/configuracoes?section=profiles` para perfis financeiros;
- `/configuracoes?section=rules` para regras automaticas.

Ausencia de `section` ou valor desconhecido abre perfis financeiros. A URL da secao atual permanece apos criar, editar, arquivar, inativar ou aplicar regras porque a tela recarrega o endereco corrente.

Na secao de regras, a lista apresenta nome, status, prioridade, condicoes, acoes sugeridas e explicacao em blocos legiveis. Codigos conhecidos sao traduzidos para portugues; valores desconhecidos aparecem como `Nao reconhecido`, sem expor o codigo bruto.

Os campos `Valor minimo` e `Valor maximo` aceitam inteiros ou decimais com ponto ou virgula, com no maximo duas casas. Antes do envio, a interface converte o valor para `amountMinMinor` ou `amountMaxMinor`. Entrada invalida bloqueia o envio, preserva o texto digitado e mostra erro junto ao campo.

Contas e categorias sao dependencias independentes do formulario. Se apenas uma consulta falhar, somente o seletor correspondente fica desabilitado, com aviso e acao para tentar novamente; o outro seletor continua disponivel. Falha ao listar regras mostra estado de erro, nao estado vazio, e desabilita `Aplicar regras` ate uma nova carga bem-sucedida.

`Inbox` mostra a fila de revisao, incluindo extracao, deduplicacao, conciliacao e sugestoes geradas por regras automaticas.

## Explicabilidade

Cada regra aplicada retorna:

- id da regra;
- nome;
- prioridade;
- campos preenchidos;
- motivo da aplicacao.

Quando a regra possui `explanation`, esse texto e retornado. Caso contrario, o dominio gera uma explicacao padrao com o nome da regra, descricao do alvo e campos preenchidos.

## Cobertura de testes existente

A suite de dominio cobre:

- match com explicacao;
- nao-match sem alteracao;
- conflito resolvido por prioridade;
- regra desativada;
- isolamento por tenant.

A suite web cobre a resolucao SSR das secoes, conversao decimal para unidade minoritaria, leitura estruturada das regras, fallback para codigos desconhecidos e falhas independentes de listagem, contas e categorias.

## Limites conhecidos

- A aplicacao persistida inicial cobre sugestoes pendentes de extracao de transacao derivadas de CSV com dados suficientes na explicacao segura.
- Sugestoes `categorization` geradas por regras ainda registram revisao sem efeito financeiro especifico ate existir payload estruturado dedicado.
- OFX, aprendizado por historico e provider real de IA continuam fora deste fluxo inicial.
