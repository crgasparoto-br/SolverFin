# Matriz de auditoria — Issue #479

Escopo auditado: branch `feat/479-account-cdi-modal`, PR #481, em comparação com `main`.

## Evidências funcionais

- A configuração de remuneração pelo CDI é aberta por ação contextual em **Contas e Cartões** e permanece separada do formulário cadastral da conta.
- O modal usa exclusivamente `PUT /api/account-remuneration/configurations/:accountId` e envia somente o contrato de remuneração.
- Contas arquivadas ou fora de BRL não podem ativar CDI; contas elegíveis exibem ação e resumo compacto da configuração ativa.
- Falhas no carregamento de configurações ou categorias degradam somente as ações de CDI e oferecem nova tentativa.
- A desativação com `{ enabled: false }` preserva percentual, data inicial e categoria no banco.
- Ativação do CDI e alteração de moeda/status são serializadas no PostgreSQL, impedindo estado ativo em conta inelegível sob concorrência.
- Reenvio idempotente do saldo inicial é permitido após movimentações; mudança real continua bloqueada.
- `/remuneracao-contas` e `/app/remuneracao-contas` redirecionam para `/contas-cartoes` para usuários autenticados e respeitam autenticação para usuários sem sessão.
- `/admin/indices-financeiros` permanece separado.

## Evidências de interface e acessibilidade

- O diálogo nasce com nome acessível completo: `Remuneração pelo CDI — <conta>`.
- O título visual redundante é ocultado de tecnologias assistivas com `aria-hidden`.
- O foco entra no primeiro campo ao abrir e retorna à ação da conta ao fechar, cancelar ou usar Escape.
- Erros da API mantêm o diálogo aberto, preservam os valores digitados e atualizam uma região `aria-live`.
- O layout do formulário e das ações se adapta à largura móvel.

## Cobertura automatizada

- Testes de domínio para saldo inicial omitido, idêntico, inválido e alterado.
- Integração com PostgreSQL para preservação na desativação, bloqueios de moeda/arquivamento e concorrência.
- Teste executável do diálogo para abertura, foco, payload, erro, sucesso, cancelamento, Escape e retorno de foco.
- Testes de carregamento degradado, rotas legadas, navegação e shell.
- Gates do repositório: formatação, lint, typecheck, migrations, seed, testes, build, integração API e validação visual em Chrome.
