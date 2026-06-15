# SolverFin

SolverFin e o controle financeiro inteligente da SolverIT para pessoas, familias, MEIs, profissionais autonomos e pequenos negocios.

O produto combina organizacao financeira, importacao de dados, regras deterministicas e IA explicavel para reduzir lancamentos manuais, apoiar conciliacao e transformar informacoes financeiras em decisoes claras. A automacao deve sempre preservar revisao humana, privacidade, LGPD, rastreabilidade e separacao entre contextos pessoais, profissionais e empresariais.

## Status do repositorio

Este repositorio esta na fase de fundacao documental e bootstrap. Ainda nao ha aplicacao executavel, API, banco ou comandos tecnicos obrigatorios definidos.

A primeira etapa e alinhar produto, arquitetura, decisoes, regras para agentes de IA e templates de trabalho antes de iniciar a implementacao tecnica.

## Documentos principais

Leia estes documentos antes de implementar qualquer issue:

- `docs/PRODUCT.md`: visao de produto, personas, escopo MVP e limites.
- `docs/ARCHITECTURE.md`: arquitetura inicial, stack-alvo e regras tecnicas.
- `docs/BRAND.md`: identidade visual, tom e direcao de interface.
- `docs/adr/README.md`: processo de ADRs.
- `docs/adr/0001-stack-inicial.md`: decisao inicial de stack e arquitetura.
- `AGENTS.md`: regras globais para agentes de IA.
- `.github/copilot-instructions.md`: instrucoes especificas para Copilot e agentes GitHub.

## Como trabalhar nas issues

1. Leia a issue e confirme objetivo, escopo, fora de escopo e criterios de aceite.
2. Consulte os documentos centrais e ADRs relacionados.
3. Localize arquivos existentes antes de criar novos.
4. Implemente uma mudanca pequena, rastreavel e coerente com a issue.
5. Atualize documentacao quando alterar produto, arquitetura, contrato, modelo de dados, fluxo ou decisao relevante.
6. Execute as validacoes disponiveis no repositorio e registre o resultado na PR.

## Validacao atual

Como ainda nao existe stack tecnica instalada, a validacao nesta fase e documental:

- revisar links internos entre README, PRODUCT, ARCHITECTURE, AGENTS, Copilot e ADRs;
- confirmar que os documentos nao se contradizem;
- garantir que templates de issue e PR pedem contexto, escopo, validacao, riscos e dados de privacidade;
- evitar exemplos com dados financeiros reais ou sensiveis.

Quando o bootstrap tecnico for implementado, esta secao deve ser atualizada com comandos reais de instalacao, lint, typecheck, testes, build, banco e CI.

## Estrutura inicial

```text
.
|-- AGENTS.md
|-- README.md
|-- docs/
|   |-- ARCHITECTURE.md
|   |-- BRAND.md
|   |-- PRODUCT.md
|   `-- adr/
|       |-- README.md
|       `-- 0001-stack-inicial.md
|-- .github/
|   |-- copilot-instructions.md
|   |-- ISSUE_TEMPLATE/
|   |   `-- ai_task.yml
|   `-- pull_request_template.md
|-- issues.md
|-- issues.json
`-- issue-bodies/
```

## Privacidade e seguranca

SolverFin lida com dados financeiros. Nunca inclua dados reais de clientes, numeros completos de cartao ou conta, tokens, chaves, mensagens bancarias sensiveis, prints com dados privados ou fixtures que permitam identificar uma pessoa.

Exemplos devem ser ficticios, minimizados e seguros por padrao.

## Backlog inicial

O backlog planejado esta em `issues.md`, `issues.json` e `issue-bodies/`. Esses arquivos registram epicos e tarefas iniciais para orientar a evolucao do produto.
