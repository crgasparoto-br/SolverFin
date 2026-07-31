# ADR 0004A - Hardening operacional do Amazon Cognito

## Status

Aceito como adendo da ADR 0004.

## Data

2026-07-30

## Contexto

A ADR 0004 escolheu autenticação produtiva delegada e, posteriormente, o Amazon Cognito User Pools em `sa-east-1`. A implementação da issue #551 introduz Authorization Code com PKCE, sessão local persistente em cookie e correlação OIDC compartilhada entre instâncias.

A fronteira de autenticação precisa continuar segura mesmo diante de configuração incorreta, duas autenticações concorrentes, usuário desabilitado, reapresentação de Bearer legado, falha do sink de auditoria ou abandono de callback em estado intermediário.

## Decisão

A API e a aplicação web aplicam os seguintes controles obrigatórios:

- `OIDC_ISSUER_URL` referencia diretamente um User Pool de `sa-east-1`;
- `OIDC_JWKS_URI` é derivado exatamente do issuer confiável;
- autorização, token, logout e recuperação usam um único domínio gerenciado `*.auth.sa-east-1.amazoncognito.com` e paths canônicos;
- `APP_ORIGIN` é convertido para uma origem canônica antes de ser comparado com o header `Origin`;
- `OIDC_REDIRECT_URI` usa a origem canônica e exatamente o path `/api/auth/oidc/callback`;
- configuração pública incompleta ou incoerente impede a inicialização da aplicação web produtiva, sem retornar silenciosamente aos formulários locais;
- Bearer recebido externamente é removido na borda em ambientes não locais;
- somente cookie persistido e validado pode ser convertido em credencial interna transitória para roteadores legados;
- validação, rotação, logout e desabilitação concorrentes são linearizados no banco por atualizações condicionais que revalidam token, revogação, expiração, inatividade e status do usuário;
- a rotação do token e seu evento de auditoria pertencem à mesma transação; falha da auditoria desfaz a rotação e preserva o token anterior;
- o logout usa revogação idempotente e um savepoint para que indisponibilidade da auditoria não preserve a credencial no navegador nem desfaça a revogação;
- o vínculo `externalAuthProvider + externalAuthSubject` é imutável após a associação;
- vinculação por email usa lock, compare-and-set e constraints únicas para garantir uma única identidade vencedora;
- tentativas simultâneas da mesma identidade reutilizam o mesmo usuário sem duplicar organização ou perfil;
- desabilitar um usuário revoga todas as sessões ativas com motivo `user_disabled`;
- eventos de início, callback, sessão, rotação, logout e usuário desabilitado preservam o `correlationId` da requisição sem registrar material sensível;
- tentativas OIDC vencidas são encerradas por limpeza periódica, incluindo callbacks abandonados em `PROCESSING`;
- criação de sessão, consumo da tentativa e auditoria de sucesso são persistidos na mesma transação;
- a ação produtiva de recuperação reinicia o fluxo OIDC controlado pelo backend e delega a recuperação à interface gerenciada do provider, sem publicar uma URL `/forgotPassword` sem contexto do app client.

## Consequências

- Configuração manual não pode apontar para JWKS ou endpoints arbitrários.
- Representações equivalentes de uma origem, como HTTPS com porta padrão ou barra final, resultam na mesma origem canônica.
- Um token Bearer produtivo não é aceito como transporte público, mesmo quando corresponde a uma sessão já carregada em memória.
- Conflitos concorrentes de identidade falham fechados sem substituir vínculo existente.
- Uma requisição privada não pode ser autorizada depois que uma rotação, logout ou desabilitação concorrente vence no banco.
- Falha do registro de rotação não deixa o navegador sem o token antigo e sem o novo; falha do registro de logout não reativa a sessão.
- Usuário desabilitado não mantém sessão tecnicamente ativa no banco e a negação permanece correlacionável.
- O job de limpeza deve executar em cada instância, usando atualizações condicionais idempotentes.

## Validação

Os gates da issue incluem:

- testes unitários dos códigos públicos, cookie, origem canônica, callback exato, `returnTo`, provider confiável, recuperação controlada e bloqueio de Bearer;
- testes PostgreSQL de rotação concorrente, replay, cancelamento, criação idempotente, vínculo conflitante, imutabilidade e revogação por desabilitação;
- testes PostgreSQL discriminantes de validação concorrente com rotação, logout e desabilitação;
- injeção de falha no sink de auditoria para comprovar rollback da rotação e commit idempotente do logout;
- verificação de `correlationId` nos eventos OIDC e de sessão;
- migrations e seed em banco dedicado;
- lint, typecheck, testes e build;
- validação produtiva em Chrome para desktop, tablet, mobile, texto ampliado, teclado, árvore de acessibilidade e estado de cookie indisponível;
- regressões concorrentes do monorepo permanecem obrigatórias, porque a autenticação e a sessão atravessam os mesmos roteadores e transações usados pelos fluxos financeiros.

O encerramento da issue exige CI, integração PostgreSQL e validação visual aprovados no mesmo head, seguidos por auditoria adversarial somente leitura. A auditoria executada no mesmo ciclo produz apenas aprovação interna; a liberação operacional final permanece condicionada a revisão independente.
