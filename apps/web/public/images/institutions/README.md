Logos de instituicoes financeiras usados no cadastro de contas e cartoes.

Regra de manutencao:
- use apenas arquivos locais versionados neste diretorio;
- nao aponte o renderizador para URLs externas ou servicos de descoberta de logo;
- adicione somente assets obtidos de fonte oficial da instituicao;
- cubra cada novo arquivo em `apps/web/src/dev-server.test.ts` com validacao de existencia e assinatura.

Essa regra evita que a tela mostre HTML, fallback de CDN, favicon errado ou logo de terceiros quando uma conta e criada.
