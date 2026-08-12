# Assistente financeiro conversacional

**Issue:** #568  
**Status:** implementado no candidato da Fase 2.

## Objetivo

O Assistente financeiro do SolverFin responde perguntas sobre os dados do perfil financeiro ativo sem executar operacoes financeiras. O recurso e somente leitura: pode consultar, explicar e indicar navegacao, mas nao cria, edita, exclui, concilia, paga, aprova ou rejeita registros.

A rota web canonica e `/assistente`. A API usa o prefixo `/api/financial-assistant`.

## Perguntas suportadas

O classificador atual cobre:

- receitas e despesas por periodo; quando a pergunta solicita uma categoria especifica, ela precisa ser reconhecida no perfil ou o assistente pede clarificacao em vez de retirar o filtro silenciosamente;
- saldo calculado e saldo projetado;
- faturas, parcelas e compromissos planejados no periodo;
- recorrencias registradas e assinaturas provaveis;
- resumo mensal;
- disponibilidade estimada para hoje, apenas quando existe base deterministica suficiente.

Perguntas fora desse escopo recebem fallback explicito. Periodo ausente, moeda ambigua, categoria solicitada nao resolvida ou outro contexto insuficiente produz estado `AWAITING_CLARIFICATION`, sem inventar dados nem substituir o filtro pedido por um agregado mais amplo.

## Regra de calculo

Valores financeiros sao calculados no backend antes de qualquer chamada externa. As consultas filtram obrigatoriamente por `organizationId`, `financialProfileId` e moeda.

- realizados: `Transaction` com estado `POSTED` ou `RECONCILED`;
- saldo/projecao de caixa: contas ativas e somente transacoes vinculadas a conta (`accountId is not null`), evitando contabilizar compra de cartao como saida de caixa antes do pagamento;
- compromissos futuros: lancamentos planejados, parcelas planejadas e faturas em aberto no horizonte;
- faturas com `paymentTransactionId` nao sao descontadas de novo na disponibilidade;
- assinaturas provaveis: detector deterministico `financial-insights-v2`, com recorrencias registradas exibidas separadamente;
- moedas nunca sao convertidas automaticamente.

A disponibilidade de hoje e limitada a zero e inclui premissas/limitacoes. Se nao houver conta ativa ou base suficiente, o sistema informa que nao pode estimar.

## Provider de IA

O provider e opcional e so pode acrescentar narrativa qualitativa. Os numeros e fatos continuam sendo a evidencia deterministica do SolverFin.

Antes de cada tentativa externa:

1. o backend reautentica a requisicao;
2. revalida o tenant/perfil ativo;
3. consulta o consentimento persistido para processamento por IA;
4. envia apenas pergunta mascarada, intent, periodo/moeda/filtros minimizados e metricas agregadas;
5. nunca envia IDs de tenant/perfil nem base financeira bruta.

Ausencia, revogacao ou falha ao revalidar o consentimento impede somente a chamada externa. Quando existe evidencia deterministica suficiente, a resposta local continua disponivel e informa que a narrativa por IA nao foi usada. Narrativa que introduz numero, quantidade ou comparacao quantitativa e descartada. Timeout, indisponibilidade, rate limit ou erro do provider tambem preservam a resposta deterministica e adicionam uma limitacao segura.

## Persistencia conversacional

A migration `20260812030000_financial_assistant_conversation` cria:

- `FinancialAssistantConversation`: contexto ativo, estado, versao, moeda, pendencia de esclarecimento e expiracao;
- `FinancialAssistantTurn`: pergunta normalizada, intent, filtros resolvidos, evidencia estruturada, resposta segura e estado da tentativa.

Nao sao persistidos prompt bruto nem resposta bruta do provider.

Estados de conversa:

- `ACTIVE`;
- `PROCESSING`;
- `AWAITING_CLARIFICATION`;
- `ANSWERED`;
- `FAILED`;
- `CANCELLED`;
- `EXPIRED`.

Turnos usam os mesmos estados aplicaveis, exceto `ACTIVE`.

## Idempotencia e concorrencia

Cada mensagem exige uma chave de idempotencia. A combinacao conversa/chave e unica no PostgreSQL.

- repetir a mesma pergunta com a mesma chave reutiliza o turno existente e nao chama o provider de novo;
- reutilizar a chave para outra pergunta retorna conflito;
- uma mensagem concorrente diferente enquanto a conversa esta `PROCESSING` retorna conflito;
- locks transacionais e versao impedem resposta tardia de sobrescrever cancelamento, expiracao ou troca de contexto.

O estado `PROCESSING` possui lease de dois minutos. Depois de restart/processo interrompido, a leitura seguinte recupera o turno como `FAILED`, preservando historico e permitindo nova tentativa com nova chave.

## Cancelamento, limpeza e troca de contexto

`Cancelar` e `Limpar` sao transicoes logicas; nao existe exclusao fisica de historico financeiro/conversacional nessa entrega.

- cancelar marca conversa e turno em processamento como `CANCELLED`;
- limpar cancela o contexto e a UI remove a conversa da sessao visivel;
- novo contexto encerra o anterior antes de criar/reutilizar outro;
- abrir o assistente em outro perfil da mesma organizacao expira contextos abertos incompatíveis;
- mudanca de moeda de uma conversa ja vinculada expira o contexto antes de misturar valores.

## TTL

`FINANCIAL_ASSISTANT_TTL_MINUTES` controla a expiracao do contexto, com padrao `120` minutos e faixa valida de `5` a `1440`.

A expiracao e fail-closed: contexto expirado nao aceita nova mensagem e turnos ainda em processamento sao marcados `EXPIRED`.

## Contrato publico

A resposta da API exposta ao browser inclui somente:

- ID opaco da conversa;
- estado, moeda e expiracao;
- sequencia e estado de cada turno;
- pergunta normalizada e intent;
- filtros publicos (`currency`, periodo e nome de categoria, quando houver);
- resposta segura com periodo, filtros, premissas, fontes funcionais, limitacoes e confianca.

A projecao publica nao inclui IDs de organizacao/perfil/usuario, ID interno do turno, chave de idempotencia, evidencia persistida, failure code interno ou IDs de categoria.

## Interface e acessibilidade

A pagina `/assistente` usa o shell autenticado e o contrato SSR oficial. Ela possui:

- historico com `role="log"` e regiao de status `aria-live`;
- composer com label visivel, textarea e botao nativo;
- controles de cancelar, limpar e iniciar novo contexto;
- prompts de exemplo acionaveis por teclado;
- foco devolvido ao campo de pergunta depois das acoes;
- resposta com periodo, filtros e confianca, mais disclosure de premissas, fontes e limitacoes;
- layout responsivo em uma coluna no mobile e sem dependencia de hover;
- controles nativos que permanecem utilizaveis sob pressao de reflow equivalente a zoom de 200%, sem usar pinch/page scale como substituto do teste de layout.

## Testes esperados

- `@solverfin/ai`: resposta deterministica, falta de evidencia, ausencia de dados, consentimento, revogacao tardia, provider qualitativo, rejeicao quantitativa e fallback de falha;
- API/PostgreSQL: idempotencia, conflito de chave, concorrencia, cancelamento versus resposta tardia, recovery de `PROCESSING`, TTL, isolamento e troca de perfil;
- API unitario: categoria solicitada nao resolvida nao pode virar agregado geral e pergunta acima do limite nao pode ser truncada silenciosamente;
- Web: estados normal/erro/vazio, fronteira publica, elementos acessiveis e regras responsivas;
- validacao visual dedicada: `scripts/statement-visual/issue-568-financial-assistant.mjs` cobre teclado, foco, mobile, erro e acoes; `scripts/statement-visual/issue-568-financial-assistant-zoom-200-reflow.mjs` cobre o reflow equivalente a zoom de 200% e reprova clipping horizontal contra o viewport de layout;
- build SSR: rota `/assistente` registrada em `solverFinShellRoutes` e `solverFinSsrStyleContracts`.

## Limites

- O assistente nao executa mutacoes financeiras.
- Nao faz conversao cambial automatica.
- Nao oferece recomendacao de investimento, credito, fiscal, juridica ou contabil.
- Dados ainda nao registrados podem alterar qualquer projecao.
- Assinatura provavel e inferencia e nao confirmacao de contrato.
