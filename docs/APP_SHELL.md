# Shell da aplicacao web/PWA

Este documento registra o contrato inicial do shell de navegacao do SolverFin Web.

A implementacao atual fica em `apps/web/src/app-shell/` e segue a mesma estrategia do design system inicial: contratos TypeScript e CSS base, sem escolher React, Vue, Svelte, roteador ou autenticacao real antes de uma ADR ou issue especifica.

## Objetivo

Criar a moldura comum das telas financeiras para que as proximas issues de frontend usem a mesma navegacao, os mesmos estados protegidos e a mesma organizacao responsiva.

## Estrutura criada

- `routes.ts`: mapa de rotas principais do MVP e requisitos de acesso.
- `access.ts`: avaliacao de acesso para loading, login obrigatorio, perfil financeiro ausente, erro e rota pronta.
- `navigation.ts`: grupos de navegacao e modelo de cabecalho/contexto.
- `styles.ts`: CSS base do shell com sidebar desktop, header, area principal, estado central e barra mobile.
- `examples.ts`: exemplos de estados com dados ficticios.
- `index.ts`: export publico do modulo.

## Rotas principais

| Rota                 | Label         | Grupo     | Autenticacao | Perfil financeiro |
| -------------------- | ------------- | --------- | ------------ | ----------------- |
| `/app`               | Resumo        | Rotina    | Sim          | Sim               |
| `/app/lancamentos`   | Lancamentos   | Rotina    | Sim          | Sim               |
| `/app/contas`        | Contas        | Organizar | Sim          | Sim               |
| `/app/cartoes`       | Cartoes       | Organizar | Sim          | Sim               |
| `/app/categorias`    | Categorias    | Organizar | Sim          | Sim               |
| `/app/orcamentos`    | Orcamentos    | Rotina    | Sim          | Sim               |
| `/app/relatorios`    | Relatorios    | Rotina    | Sim          | Sim               |
| `/app/revisao`       | Revisao       | Revisar   | Sim          | Sim               |
| `/app/configuracoes` | Configuracoes | Ajustes   | Sim          | Nao               |
| `/entrar`            | Entrar        | Publico   | Nao          | Nao               |

Todas as rotas privadas estao marcadas como `placeholder` porque ainda nao existe aplicacao web executavel nem conteudo completo de tela.

## Estados de acesso

`evaluateShellRouteAccess` retorna:

- `loading`: contexto inicial em carregamento;
- `redirect`: usuario nao autenticado tentando acessar rota privada;
- `missing-profile`: usuario autenticado sem perfil financeiro ativo em rota que exige contexto;
- `error`: falha ao carregar dados iniciais;
- `ready`: rota liberada para renderizar conteudo.

Os textos dos estados sao voltados ao usuario final e evitam detalhes de backend ou arquitetura.

## Navegacao responsiva

Desktop:

- sidebar fixa com grupos `Rotina`, `Organizar`, `Revisar` e `Ajustes`;
- header com rota atual, usuario e perfil financeiro ativo;
- area principal para o conteudo da tela.

Mobile:

- sidebar fica oculta;
- header fica mais compacto;
- barra inferior destaca rotas de uso frequente: resumo, lancamentos e revisao;
- conteudo ganha espaco inferior para nao ficar encoberto pela barra mobile.

## Fora deste corte

- Implementacao concreta em framework web.
- Roteador real.
- Provedor de autenticacao.
- Tela de login executavel.
- Seletor real de tenant/perfil financeiro.
- Testes visuais em navegador.
- Evidencia visual por screenshot.

Esses itens dependem da aplicacao web executavel e devem ser tratados nas proximas issues de frontend/bootstrap.

## Validacao esperada

Enquanto nao houver app executavel, a validacao automatica esperada para este corte e:

- `format:check`;
- `lint`;
- `typecheck`;
- testes placeholders existentes;
- `build`.

Quando o app web tiver framework e runtime, esta documentacao deve ser revisitada para incluir validacao visual mobile/desktop e testes de rota protegida.
