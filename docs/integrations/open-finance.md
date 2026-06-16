# Estudo tecnico: Open Finance via parceiro

**Issue:** #50
**Data:** 2026-06-16
**Status:** estudo para decisao futura, sem implementacao de integracao real.

## Resumo executivo

Open Finance pode reduzir lancamentos manuais e melhorar conciliacao, mas nao deve entrar no MVP sem uma ADR especifica, contrato de parceiro, modelo de consentimento aprovado e desenho operacional de falhas.

Recomendacao inicial: **adiar integracao bancaria direta no MVP e manter CSV/OFX, inbox de mensagens, deduplicacao, conciliacao e regras automaticas como caminho principal**. Em paralelo, preparar uma ADR futura para piloto controlado com parceiro/agregador, limitado a leitura de dados, usuarios de teste, dados minimizados e revogacao clara.

## Fatos conhecidos

- Open Finance Brasil e uma iniciativa do Banco Central do Brasil para compartilhamento padronizado de dados e servicos financeiros mediante autorizacao do cliente.
- O compartilhamento ocorre pelo app ou site das instituicoes participantes, com padroes de seguranca definidos pelo ecossistema.
- O cliente pode cancelar a autorizacao de compartilhamento quando quiser.
- O ecossistema possui conceito formal de consentimento e estados de permissao.
- Participantes do Open Finance seguem regras do Banco Central e do Conselho Monetario Nacional.
- A LGPD regula tratamento de dados pessoais por pessoas naturais, empresas e instituicoes publicas ou privadas, incluindo meios digitais.

Fontes consultadas:

- Banco Central do Brasil - Open Finance: https://www.bcb.gov.br/estabilidadefinanceira/openfinance
- Banco Central do Brasil - instituicoes participantes: https://www.bcb.gov.br/estabilidadefinanceira/openfinance_participantes
- Open Finance Brasil - perguntas frequentes: https://openfinancebrasil.org.br/perguntas-frequentes/
- Open Finance Brasil - area do desenvolvedor, consentimento: https://openfinancebrasil.atlassian.net/wiki/spaces/OF/pages/219480491
- Lei Geral de Protecao de Dados Pessoais, Lei 13.709/2018: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm

## Suposicoes do estudo

- SolverFin nao sera participante direto do Open Finance no curto prazo.
- O caminho inicial mais realista e usar um parceiro/agregador com APIs, sandbox, painel de consentimento e contrato comercial.
- O MVP deve priorizar importacao revisavel e automacoes deterministicas antes de uma integracao bancaria direta.
- Dados financeiros importados por Open Finance devem ser tratados como sensiveis, mesmo quando nao forem classificados como dado sensivel pela LGPD.
- Qualquer decisao de parceiro exige revisao juridica, comercial e de seguranca antes de producao.

## Alternativas conceituais

### 1. Sem Open Finance no MVP

Manter apenas CSV/OFX, inbox de mensagens, regras, deduplicacao e conciliacao.

Vantagens:

- Menor custo e menor risco regulatorio.
- Menos dependencia operacional externa.
- Mais rapido para validar valor do produto.
- Mantem usuario em revisao humana antes de efeitos financeiros.

Desvantagens:

- Mais friccao para obter dados.
- Menor atualizacao automatica de saldos e transacoes.
- Menor diferencial frente a produtos com agregacao bancaria.

### 2. Parceiro/agregador em piloto restrito

Usar um parceiro autorizado ou integrado ao ecossistema para acesso de leitura, com usuarios de teste e escopo limitado.

Vantagens:

- Reduz complexidade de participacao direta.
- Permite validar cobertura bancaria, qualidade dos dados e custo por usuario.
- Pode acelerar importacao recorrente sem construir toda a infraestrutura regulatoria.

Desvantagens:

- Dependencia comercial e tecnica do parceiro.
- Custos variaveis por consentimento, conta, usuario ou chamada.
- Risco de lock-in no modelo de dados do parceiro.
- Necessidade de suporte para indisponibilidade, dados atrasados e revogacao.

### 3. Participacao direta futura

Buscar participacao direta no ecossistema Open Finance.

Vantagens:

- Maior controle tecnico e menor dependencia de intermediario.
- Potencial melhor governanca sobre dados e experiencia.

Desvantagens:

- Alto custo regulatorio, operacional e de seguranca.
- Exige maturidade de produto, compliance, monitoramento e suporte.
- Nao e proporcional ao MVP atual.

## Fluxo de consentimento esperado

1. Usuario escolhe conectar uma instituicao financeira no SolverFin.
2. SolverFin mostra finalidade, tipos de dados, prazo, riscos e alternativa manual.
3. Usuario e redirecionado para o fluxo do parceiro/instituicao autorizadora.
4. Usuario autentica e autoriza o compartilhamento no ambiente da instituicao.
5. Parceiro retorna status do consentimento e identificador tecnico.
6. SolverFin registra metadados minimos: tenant, perfil financeiro, instituicao, escopo, validade, status, horario e correlation id.
7. Dados financeiros sao importados e enviados para revisao/deduplicacao/conciliacao, nao para criacao irreversivel sem regra aprovada.
8. Usuario pode revogar consentimento pelo SolverFin quando suportado e tambem pela instituicao participante.
9. Revogacao bloqueia novas coletas e agenda descarte/retencao conforme politica aprovada.
10. Renovacao deve ocorrer antes do vencimento, com aviso claro e sem renovar silenciosamente.

## Arquitetura de alto nivel proposta

```text
Web/PWA
  -> Configuracao de conexao bancaria
  -> Tela de consentimentos e revogacao

API backend
  -> OpenFinanceConnectionService
  -> ConsentService
  -> PartnerClient
  -> Importacao/Deduplicacao/Conciliacao
  -> Auditoria segura

Parceiro Open Finance
  -> OAuth/consentimento
  -> APIs de contas, saldos e transacoes

PostgreSQL
  -> metadados de conexao e consentimento
  -> snapshots/importacoes normalizadas
  -> auditoria e eventos de falha
```

Boundaries recomendados:

- `PartnerClient` deve ser substituivel por mock nos testes.
- Dados brutos retornados pelo parceiro devem ser minimizados antes de persistir.
- Tokens e credenciais nunca devem ser expostos ao dominio financeiro puro.
- Regras de negocio de importacao, deduplicacao e conciliacao devem continuar no dominio.
- Eventos de consentimento, revogacao e falha devem ter auditoria sem payload financeiro bruto.

## Dados e privacidade

Tratamento minimo recomendado:

- Guardar apenas escopos, validade, instituicao, status e identificadores tecnicos necessarios.
- Evitar persistir payload bruto do parceiro quando uma representacao normalizada bastar.
- Mascarar conta, agencia, documentos e identificadores em logs e UI quando valor completo nao for indispensavel.
- Separar dados por organizacao e perfil financeiro.
- Nao misturar contexto pessoal, familia, MEI e negocio sem acao explicita do usuario.
- Exigir consentimento especifico para conexao bancaria e explicar alternativa manual.
- Registrar revogacao e interromper coletas futuras imediatamente.

## Custos e operacao

Custos a validar com parceiros:

- setup comercial e mensalidade minima;
- custo por consentimento ativo;
- custo por instituicao conectada;
- custo por chamada ou volume de dados;
- limites de sandbox e producao;
- SLA, suporte e tempo de resposta em incidentes;
- custo de auditoria, seguranca e revisao juridica.

Operacao necessaria antes de producao:

- monitoramento de chamadas ao parceiro;
- fila de retry com backoff;
- reconciliacao de dados incompletos ou atrasados;
- alerta para consentimento expirando;
- playbook para parceiro indisponivel;
- dashboard de falhas sem dados financeiros brutos.

## Tratamento de falhas

| Cenario | Tratamento recomendado |
| --- | --- |
| Usuario revoga consentimento | Marcar conexao como revogada, parar novas coletas, manter historico normalizado conforme politica de retencao. |
| Consentimento expira | Avisar usuario, impedir coletas novas e oferecer renovacao clara. |
| Parceiro indisponivel | Registrar evento seguro, manter fluxo manual e tentar novamente com backoff. |
| Dados incompletos ou atrasados | Importar como pendente de revisao e sinalizar baixa confianca. |
| Duplicidade com importacao manual | Usar motor de deduplicacao antes de sugerir novos lancamentos. |
| Instituicao sem cobertura | Oferecer CSV/OFX ou inbox como alternativa. |
| Conta pessoal e MEI no mesmo usuario | Exigir escolha explicita do perfil financeiro de destino. |

## Criterios para adotar no MVP

Adotar somente se todos forem verdadeiros:

- Existe parceiro com cobertura bancaria relevante para o publico-alvo inicial.
- Custo por usuario cabe no modelo comercial previsto.
- Fluxo de consentimento, renovacao e revogacao e claro e testavel.
- Contrato permite uso dos dados para organizacao financeira pessoal/MEI conforme finalidade exibida.
- Solucao passa por revisao juridica, privacidade e seguranca.
- Existe ADR aprovada definindo parceiro, escopo, dados persistidos, retencao e operacao.
- MVP ja possui importacao, deduplicacao, conciliacao e fila de revisao estaveis.

## Criterios para adiar

Adiar se qualquer item for verdadeiro:

- Ainda nao ha clareza sobre parceiro, custo ou cobertura.
- Produto ainda nao validou valor com importacao manual/CSV/OFX/inbox.
- Nao existe modelo de consentimento e revogacao no produto.
- Nao ha observabilidade e suporte suficientes para falhas de integracao.
- Integracao exigiria persistir payload financeiro bruto sem politica aprovada.

## Criterios para descartar

Descartar para o MVP se:

- Custo comercial inviabilizar usuarios iniciais.
- Parceiros disponiveis nao cobrirem bancos relevantes do publico-alvo.
- Risco regulatorio/juridico for maior que o beneficio no horizonte do MVP.
- A experiencia manual com CSV/OFX/inbox resolver o problema com menor risco.

## Perguntas abertas

- Open Finance deve entrar na fase 2 ou permanecer como fase 3 apos validacao do MVP?
- Qual parceiro atende melhor LGPD, custo, cobertura bancaria e suporte no Brasil?
- Quais dados exatamente serao necessarios: saldos, transacoes, contas, cartoes ou todos?
- Qual prazo de retencao deve ser aplicado a dados importados via parceiro?
- Como tratar renovacao de consentimento em perfis familiares ou negocio compartilhado?
- Quem responde por suporte quando a instituicao participante retorna dados incompletos?
- Qual ADR deve aprovar alteracao de modelo para conexoes e consentimentos?

## Decisao recomendada

Para o estado atual do SolverFin, a decisao recomendada e **nao implementar Open Finance direto no MVP**. O produto deve consolidar importacao CSV/OFX, inbox de mensagens, regras automaticas, deduplicacao e conciliacao revisavel.

A proxima acao recomendada e abrir uma ADR futura quando houver:

- candidato de parceiro com proposta comercial;
- requisitos de consentimento e privacidade aprovados;
- desenho de persistencia e retencao;
- plano de operacao e suporte;
- evidencia de que usuarios precisam de conexao bancaria recorrente alem das importacoes atuais.
