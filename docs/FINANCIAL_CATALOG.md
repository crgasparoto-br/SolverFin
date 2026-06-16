# Cadastros financeiros

Este documento registra o contrato inicial das telas de contas, cartoes e categorias do SolverFin Web.

A implementacao atual fica em `apps/web/src/financial-catalog/` e segue a estrategia das issues anteriores de frontend: contratos TypeScript, validacoes puras, CSS base e mocks isolados, sem escolher framework web nem consumir APIs inexistentes.

## Objetivo

Permitir que as proximas telas de lancamentos, dashboard e relatorios tenham uma base comum para listar, criar, editar, arquivar e reativar contas, cartoes e categorias dentro do tenant/perfil financeiro ativo.

## Estrutura criada

- `types.ts`: contratos de contas, cartoes, categorias, formularios, estados e view model.
- `validation.ts`: validacoes de campos obrigatorios, tipos, dias de cartao, cor, ultimos digitos, mascaramento e filtro por contexto.
- `mock-data.ts`: dataset ficticio e isolado para desenvolvimento.
- `examples.ts`: exemplos de estados, validacoes e consistencia dos mocks.
- `styles.ts`: CSS base para resumo, listas, formularios, feedback e responsividade.
- `index.ts`: export publico do modulo.

## Dados e isolamento

O dataset mockado usa apenas valores ficticios. Ele inclui propositalmente uma conta de outro tenant/perfil para validar que o view model filtra pelo contexto ativo antes de expor dados.

Contexto ativo do mock:

| Campo             | Valor                   |
| ----------------- | ----------------------- |
| Tenant            | `tenant-demo`           |
| Perfil financeiro | `profile-personal-demo` |

Valores esperados do exemplo pronto:

| Item       | Quantidade |
| ---------- | ---------: |
| Contas     |          2 |
| Cartoes    |          2 |
| Categorias |          3 |

A conta de outro contexto nao deve aparecer no view model.

## Validacoes cobertas

Contas:

- nome obrigatorio;
- tipo obrigatorio;
- saldo inicial inteiro em centavos quando informado;
- cor opcional em hexadecimal.

Cartoes:

- apelido obrigatorio;
- tipo obrigatorio;
- fechamento e vencimento entre 1 e 31 quando informados;
- apenas ultimos 4 digitos quando informado;
- exibicao mascarada dos ultimos digitos.

Categorias:

- nome obrigatorio;
- tipo obrigatorio;
- cor opcional em hexadecimal;
- categorias de sistema nao podem ser arquivadas.

## Estados da tela

`buildFinancialCatalogViewModel` suporta:

- `loading`: cadastros em carregamento;
- `error`: falha controlada no carregamento;
- `empty`: nenhum cadastro no contexto ativo;
- `ready`: dados prontos para renderizacao;
- `success`: feedback de alteracao salva.

## Decisoes deste corte

- Arquivar/reativar e a acao preferida; remocao definitiva fica fora do MVP inicial sem regra de seguranca.
- Cartoes armazenam e exibem somente apelido, emissor e ultimos quatro digitos mascarados no contrato de UI.
- O modulo nao implementa API real nem persistencia; ele prepara os contratos para quando a camada backend/frontend executavel existir.

## Fora deste corte

- Implementacao concreta em React, Vue, Svelte ou outro framework.
- Consumo de APIs reais.
- Persistencia de formularios.
- Importacao de categorias.
- Remocao definitiva.
- Validacao visual em navegador por screenshot.

## Validacao esperada

Enquanto nao houver app executavel, a validacao automatica esperada para este corte e:

- `format:check`;
- `lint`;
- `typecheck`;
- testes placeholders existentes;
- `build`.

Quando o app web tiver runtime, esta documentacao deve ser revisitada para incluir screenshots mobile/desktop, testes de formulario e validacao integrada com APIs reais.
