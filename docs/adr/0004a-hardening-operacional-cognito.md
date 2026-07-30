# ADR 0004A - Hardening operacional do Amazon Cognito

## Status

Aceito como adendo da ADR 0004.

## Data

2026-07-30

## Contexto

A ADR 0004 escolheu autenticação produtiva delegada e, posteriormente, o Amazon Cognito User Pools em `sa-east-1`. A implementação da issue #551 introduz Authorization Code com PKCE, sessão local persistente em cookie e correlação OIDC compartilhada entre instâncias.

A fronteira de autenticação precisa continuar segura mesmo diante de configuração incorreta, duas autenticações concorrentes, usuário desabilitado, reapresentação de Bearer legado ou abandono de callback em estado intermediário.

## Decisão

A API aplica os seguintes controles obrigatórios:

- `OIDC_ISSUER_URL` referencia diretamente um User Pool de `sa-east-1`;
- `OIDC_JWKS_URI` é derivado exatamente do issuer confiável;
- autorização, token, logout e recuperação usam um único domínio gerenciado `*.auth.sa-east-1.amazoncognito.com` e paths canônicos;
- o redirect usa exatamente a origem de `APP_ORIGIN`;
- configuração incoerente impede a inicialização produtiva e o início do fluxo OIDC;
- Bearer recebido externamente é removido na borda em ambientes não locais;
- somente cookie persistido e validado pode ser convertido em credencial interna transitória para roteadores legados;
- o vínculo `externalAuthProvider + externalAuthSubject` é imutável após a associação;
- vinculação por email usa lock, compare-and-set e constraints únicas para garantir uma única identidade vencedora;
- tentativas simultâneas da mesma identidade reutilizam o mesmo usuário sem duplicar organização ou perfil;
- desabilitar um usuário revoga todas as sessões ativas com motivo `user_disabled`;
- tentativas OIDC vencidas são encerradas por limpeza periódica, incluindo callbacks abandonados em `PROCESSING`;
- criação de sessão, consumo da tentativa e auditoria de sucesso são persistidos na mesma transação.

## Consequências

- Configuração manual não pode apontar para JWKS ou endpoints arbitrários.
- Um token Bearer produtivo não é aceito como transporte público, mesmo quando corresponde a uma sessão já carregada em memória.
- Conflitos concorrentes de identidade falham fechados sem substituir vínculo existente.
- Usuário desabilitado não mantém sessão tecnicamente ativa no banco.
- O job de limpeza deve executar em cada instância, usando atualizações condicionais idempotentes.

## Validação

Os gates da issue incluem:

- testes unitários dos códigos públicos, cookie, origem, `returnTo`, provider confiável e bloqueio de Bearer;
- testes PostgreSQL de rotação concorrente, replay, cancelamento, criação idempotente, vínculo conflitante, imutabilidade e revogação por desabilitação;
- migrations e seed em banco dedicado;
- lint, typecheck, testes, build e validação visual em Chrome;
- regressões concorrentes do monorepo permanecem obrigatórias, porque a autenticação e a sessão atravessam os mesmos roteadores e transações usados pelos fluxos financeiros.

A validação final da issue #551 foi executada no head `5011041fbef3b4651d4b42b3af6c1af09f264dc9`. O CI agregado, a integração PostgreSQL e a validação visual em Chrome concluíram com sucesso antes da auditoria adversarial interna. Qualquer alteração posterior exige novo congelamento de identidade e nova execução dos gates.
