# ADR 0014 - Arquitetura incremental de interface por componentes e view-models

- Status: Aceito
- Data: 2026-08-16

## Contexto

O SolverFin Web evoluiu rapidamente sobre SSR em Node `http`, renderers TypeScript e uma cadeia crescente de pos-processadores por rota. Esse desenho preservou entrega incremental, acessibilidade e cobertura visual, mas passou a impor custo elevado para manter layout, hierarquia de informacao, responsividade e consistencia entre telas.

A decisao nao e trocar de framework neste momento. O problema a resolver e a dependencia de renderers extensos e transformacoes por string/regex sobre HTML ja renderizado como mecanismo normal de composicao de interface.

## Decisao

A interface do SolverFin evoluira de forma incremental para composicao estruturada baseada em:

1. tokens compartilhados e design system operacional;
2. primitivas executaveis de UI e layout;
3. view-models/presenters que preparem dados e estados para a tela;
4. componentes financeiros que recebam contratos explicitos, incluindo moeda;
5. arquetipos de tela reutilizaveis;
6. testes de fluxo, acessibilidade e visualizacao sobre o comportamento final;
7. migracao rota a rota, preservando SSR e os gates existentes durante a transicao.

Nenhum framework frontend e escolhido por este ADR.

## Regras arquiteturais

- Novas features nao devem introduzir pos-processamento de HTML por regex/string como padrao de composicao.
- Pos-processadores atuais sao considerados mecanismo legado de transicao e permanecem cobertos ate a rota migrar.
- Uma migracao deve remover os pos-processadores que se tornarem desnecessarios no mesmo recorte ou registrar explicitamente a pendencia restante.
- A camada de apresentacao nao calcula saldo, fatura, orcamento, cambio ou outras regras financeiras; recebe um view-model derivado de contratos deterministas.
- Estados de loading, vazio, erro, sucesso, indisponibilidade e permissao devem ser modelados de forma explicita.
- Tokens e primitivas devem centralizar espacamento, tipografia, raio, elevacao, densidade, breakpoints, foco e estados semanticos.
- Componentes devem preservar labels acessiveis, teclado, foco, contraste, reflow e zoom.
- O contrato SSR atual nao e removido antes de existir cobertura equivalente para a composicao migrada.
- Nao deve existir big-bang de reescrita do frontend.

## Arquetipos iniciais

A fundacao deve suportar pelo menos:

- cockpit/dashboard;
- listagem/extrato;
- master-detail;
- cadastro/configuracao;
- analise/relatorio;
- revisao/inbox.

## Telas-piloto

A ordem preferencial de validacao da arquitetura e:

1. Dashboard;
2. Extrato;
3. Cartoes de Credito/Faturas;
4. Relatorios;
5. demais superficies.

Dashboard, Extrato e Cartoes representam classes diferentes de composicao e devem revelar se os componentes e arquetipos sao suficientemente gerais antes da migracao ampla.

## Consequencias

### Positivas

- consistencia visual deixa de depender de ajustes repetidos por rota;
- melhoria de um componente passa a beneficiar varias telas;
- layout e responsividade ficam mais previsiveis;
- testes deixam de depender excessivamente de transformacoes textuais intermediarias;
- uma futura decisao de framework pode ser tomada sobre boundaries melhores.

### Custos

- durante a migracao existirao componentes novos e mecanismos legados em paralelo;
- o contrato SSR e os testes visuais precisarao ser adaptados por etapas;
- migracoes devem evitar refactors globais e manter cada rota operacional.

## Alternativas consideradas

### Manter apenas ajustes locais

Rejeitada como estrategia principal porque amplia a fragmentacao visual e a dependencia de pos-processadores.

### Reescrever todo o frontend em um framework agora

Rejeitada por criar risco de big-bang, regressao funcional e substituicao simultanea de arquitetura, runtime e interface sem necessidade comprovada.

### Componentizar gradualmente sem trocar o runtime

Aceita. Resolve o principal acoplamento agora e preserva a possibilidade de escolher framework futuramente por ADR separada.

## Validacao minima

Cada migracao de rota deve, conforme o risco:

- provar estado normal e estados alternativos relevantes;
- cobrir desktop e mobile quando a composicao mudar;
- cobrir teclado/foco e reflow/zoom quando aplicavel;
- manter ou substituir conscientemente o contrato SSR correspondente;
- demonstrar que nao depende de novo pos-processamento textual do HTML final;
- preservar links, filtros, mutacoes e contratos financeiros da rota.

## Referencias

- `docs/EVOLUTION_STRATEGY.md`
- `docs/DESIGN_SYSTEM.md`
- `docs/APP_SHELL.md`
- `docs/ARCHITECTURE.md`
- `docs/product/INTERFACE_INVENTORY.md`
