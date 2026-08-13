# Matriz de status do MVP

Esta matriz registra o estado observado do SolverFin e separa capacidades concluidas da Fase 2 de lacunas gerais do MVP que pertencem a outros recortes. Contratos detalhados continuam nos documentos donos de cada dominio.

## Legenda

- **Feito:** existe implementacao verificavel no codigo atual.
- **Parcial:** existe parte relevante, mas permanece uma lacuna explicita fora do recorte concluido.
- **Legado:** existe para compatibilidade, historico ou transicao e nao deve orientar novas jornadas.
- **Bloqueado:** depende de decisao, politica ou fluxo anterior.

## Fontes de verdade

- `docs/PRODUCT.md`: escopo, principios e limites do produto.
- `docs/ARCHITECTURE.md`: arquitetura, CI e invariantes tecnicos.
- `docs/RUNBOOK.md`: gate final e reproducao da regressao da Fase 2.
- `docs/product/INTERFACE_INVENTORY.md`: recorte navegavel do baseline.
- `apps/web/src/app-shell/routes.ts`: catalogo canonico de rotas.
- Contratos de dominio/API/IA em `docs/` e `docs/ai/`.

## Baseline da Fase 2 - Automacao e IA aplicada

As dependencias #561, #562, #563, #564, #565, #566, #567 e #568 estao concluidas como `completed`. A issue #569 e o gate de composicao final e nao adiciona funcionalidade nova.

| Capacidade da Fase 2 | Estado | Evidencia/contrato principal |
| --- | --- | --- |
| Payloads estruturados e versionados | Feito | `docs/AI_SUGGESTION_PAYLOADS.md`, schemas de dominio e testes de compatibilidade |
| Provider substituivel e executor seguro | Feito | `docs/ai/providers.md`, `docs/ENVIRONMENT.md`, ADR 0010 |
| Importacao CSV/OFX revisavel | Feito | `docs/IMPORTS.md`, testes de parser/API/PostgreSQL e Inbox |
| Mensagens bancarias | Feito | `docs/BANK_MESSAGE_INBOX.md`, consentimento, sanitizacao e testes de privacidade |
| Categorizacao por regra/aprendizado/IA | Feito | `docs/AUTOMATION_RULES.md`, `docs/ai/category-learning.md` |
| Fila unificada de revisao | Feito | `docs/AI_REVIEW_QUEUE.md`, estados tipados, edicao e decisao transacional |
| Deduplicacao generalizada | Feito | `docs/DETERMINISTIC_DEDUP_RECONCILIATION.md` |
| Conciliacao generalizada | Feito | `docs/DETERMINISTIC_DEDUP_RECONCILIATION.md` |
| Insights financeiros | Feito | `docs/FINANCIAL_INSIGHTS.md`, payload `insight` V2 e testes deterministas |
| Assistente financeiro somente leitura | Feito | `docs/FINANCIAL_ASSISTANT.md`, ADR 0011 e testes de continuidade/privacidade |

### Composicao ponta a ponta

O fluxo esperado da fase e:

1. entrada CSV, OFX ou mensagem autorizada;
2. extracao estruturada;
3. categorizacao por precedencia de regra, aprendizado e IA quando aplicavel;
4. deteccao deterministica de duplicidade ou conciliacao;
5. edicao e decisao pela fila unificada da Inbox;
6. geracao de insight verificavel;
7. consulta somente leitura pelo assistente.

Os fluxos deterministas permanecem operacionais quando a integracao externa esta desabilitada, indisponivel ou retorna timeout conforme os contratos de cada produtor/consumidor. Numeros e fatos do assistente e dos insights permanecem sob calculos deterministas do SolverFin.

### Invariantes transversais da fase

- isolamento por organizacao e perfil financeiro;
- consentimento revalidado nas superficies que usam integracao externa;
- idempotencia, concorrencia, retry, rollback e obsolescencia controlados onde aplicavel;
- nenhum parsing de texto explicativo como fonte de valores financeiros ou vinculos;
- payloads publicos redigidos e sem identificadores de outro tenant/perfil;
- fixtures, seeds, logs, screenshots e artefatos apenas com dados ficticios e minimizados;
- interfaces novas cobertas por teclado, foco, mobile, texto a 200% e reflow nos cenarios visuais dedicados.

## Status geral por area

As linhas `Parcial` abaixo sao lacunas gerais do MVP e nao pendencias implicitas da Fase 2. Qualquer evolucao deve ser tratada por issue propria.

| Area | Dominio/API/persistencia | UI | Testes/documentacao | Observacao |
| --- | --- | --- | --- | --- |
| Contas | Feito | Parcial | Integracao feita; unitarios/docs parciais | Lista, cria, edita e arquiva; sem tela dedicada de detalhe |
| Categorias | Feito | Parcial | Integracao feita; unitarios/docs parciais | Lista, cria, edita, arquiva e restaura; sem tela dedicada de detalhe |
| Lancamentos / Extrato | Feito | Feito no fluxo atual | Integracao, web e visual | Tela ativa para compromissos de conta; exclusao fisica nao faz parte do contrato |
| Recorrencias | Feito | Feito no fluxo atual | Cobertura web/integracao distribuida | Permanecem incorporadas a Extrato e Cartoes; sem rota propria |
| Parcelas | Feito | Feito no fluxo atual | Web, integracao PostgreSQL e visual | Criacao canonica e manutencao conservadora; sem rota propria |
| Cartoes / Faturas | Feito | Feito no fluxo atual | Integracao e cobertura web/visual | Cadastro mestre em `/contas-cartoes`; operacao em `/cartoes` |
| Orcamentos | Feito | Parcial | Parcial | Lista, cria, edita, consulta uso e arquiva; sem tela dedicada de detalhe/uso |
| Contas a pagar/receber | Legado | Legado/fora da jornada ativa | Compatibilidade coberta | Compromissos de conta ficam no Extrato; de cartao, em Cartoes |
| Relatorios | Feito | Feito | Unitarios, web e gate geral | Evolucao por categoria e parcelas consolidadas, somente leitura |
| Perfis financeiros | Feito no recorte inicial | Parcial | Isolamento coberto nos fluxos sensiveis | Evolucoes multiusuario/seletor global sao recorte separado |
| Autenticacao produtiva | Feito no codigo | Feito no contrato atual | ADR 0004 e gates existentes | Ativacao real depende de configuracao do ambiente |
| Configuracoes | Feito no recorte atual | Parcial | Cobertura por secoes existentes | Perfis, regras e aprendizado existem; novas preferencias sao evolucao futura |

## Decisoes de jornada preservadas

### Pagar e receber

Nao existe tela operacional propria. Receitas, despesas, transferencias e compromissos previstos de conta corrente ficam no **Extrato da conta** (`/lancamentos`). Compras, faturas e pagamentos de cartao ficam em **Cartoes de Credito** (`/cartoes`). `PayableReceivable` permanece apenas como compatibilidade tecnica.

### Recorrencias e parcelas

Recorrencias e parcelas aparecem nas listas operacionais existentes. Recorrencias sao criadas e mantidas em Extrato ou Cartoes. Parcelas podem ser criadas pelo fluxo canonico e consultadas em Extrato, Cartoes ou Relatorios conforme o contexto. Nao existe rota operacional independente para esses conceitos.

### Sugestoes e IA

`/api/ai-review-queue` e a fronteira unificada para sugestoes revisaveis. A explicacao e apenas apresentacional. Decisoes dependem de payload tipado, fingerprint, versao e contexto autorizado.

O assistente em `/assistente` e estritamente somente leitura: nao cria, edita, exclui, concilia, paga ou aprova registros financeiros e nao converte moedas automaticamente.

## Operacoes visiveis principais

- `/dashboard`: resumo do perfil ativo.
- `/lancamentos`: movimentacoes, compromissos, recorrencias e parcelas de conta.
- `/cartoes`: compras, faturas, recorrencias e compromissos de cartao.
- `/contas-cartoes`: cadastro mestre de contas e cartoes.
- `/categorias`: manutencao de categorias.
- `/orcamentos`: manutencao e uso de orcamentos no recorte atual.
- `/inbox`: importacoes, mensagens e fila unificada de revisao.
- `/relatorios`: evolucao por categoria e parcelas consolidadas.
- `/assistente`: consultas financeiras somente leitura.
- `/configuracoes`: perfis, regras e aprendizados do recorte atual.

O inventario completo de rotas e restricoes fica em `docs/product/INTERFACE_INVENTORY.md`; a fonte executavel e `apps/web/src/app-shell/routes.ts`.

## Gate final da Fase 2 (#569)

O baseline so e considerado aprovado no SHA final do PR de #569 quando, no mesmo candidato:

- `Validate monorepo` estiver verde;
- `Integration API + PostgreSQL` estiver verde;
- `Chrome visual validation` estiver verde e publicar `statement-visual-evidence-<sha>`;
- os cenarios minimos e adversariais descritos em `docs/RUNBOOK.md` estiverem representados pelas suites canonicas;
- nao houver finding de regressao da Fase 2 sem issue explicita e resolucao;
- a revisao documental nao mantiver capacidade da Fase 2 como `Parcial` sem issue vinculada.

O SHA aprovado e o head do PR com os checks verdes no GitHub e nao e hardcoded neste arquivo, evitando que uma atualizacao documental gere um novo SHA e invalide a propria evidencia.

## Limites fora da Fase 2

Lacunas gerais ainda marcadas como `Parcial` nesta matriz nao sao reclassificadas como trabalho da Fase 2. A Fase 3 permanece reservada para operacao e integracoes, incluindo evolucoes de observabilidade, acessibilidade, performance, troubleshooting para agentes, integracoes SolverIT e exportacoes profissionais/MEI conforme `docs/PRODUCT.md`.