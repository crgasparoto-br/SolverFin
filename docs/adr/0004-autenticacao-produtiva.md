# ADR 0004 - Autenticacao produtiva definitiva

## Status

Aceito

## Data

2026-06-18

## Contexto

O SolverFin possui uma autenticacao inicial para o MVP local: usuario demo fixo,
hash SHA-256 simples, sessoes em memoria e contrato puro para login, logout e
rotas privadas. Essa camada viabiliza desenvolvimento e testes, mas nao atende
requisitos de producao para um produto financeiro com dados sensiveis.

Autenticacao produtiva precisa tratar identidade, credenciais, sessao,
revogacao, auditoria, separacao de ambientes, LGPD, isolamento por tenant e
integracao com usuario, organizacao e perfil financeiro. Manter credenciais,
MFA, recuperacao de conta e protecoes contra abuso dentro de um modulo proprio
neste momento aumentaria o risco operacional e desviaria o produto do seu nucleo
financeiro.

## Decisao

O SolverFin adotara autenticacao produtiva baseada em provider gerenciado de
identidade, compativel com OIDC/OAuth2, com credenciais delegadas ao provider.

A aplicacao nao deve armazenar senha produtiva nem hash de senha produtivo. O
provider gerenciado sera responsavel por:

- cadastro/autenticacao primaria de usuarios reais;
- armazenamento e verificacao de credenciais;
- politicas de senha quando senha existir;
- MFA, passkeys ou autenticadores fortes quando habilitados;
- recuperacao de conta e confirmacao de email;
- protecoes contra brute force, credential stuffing e abuso;
- emissao de tokens/assertions verificaveis pela API.

O SolverFin mantera em banco proprio apenas o que e necessario para operar o
produto:

- usuario local vinculado ao `subject` externo do provider;
- organizacoes e perfis financeiros;
- preferencias e estado operacional do usuario;
- sessoes de aplicacao persistentes, revogaveis e auditaveis;
- eventos de seguranca relevantes para auditoria.

A API deve trocar a identidade validada do provider por uma sessao propria de
aplicacao. Essa sessao deve ser armazenada de forma persistente, com token
opaco, expiracao, renovacao controlada, revogacao explicita e invalidacao por
logout. Tokens de sessao devem ser tratados como segredo e nao devem aparecer em
logs, erros, fixtures ou documentacao.

O MVP demo permanece permitido apenas para desenvolvimento local, testes
automatizados e demonstracoes nao produtivas explicitamente autorizadas. Em
ambientes produtivos, preview publico ou staging com dados reais, a autenticacao
demo deve falhar cedo salvo opt-in temporario e documentado para demonstracao
sem dados reais.

## Requisitos minimos da implementacao produtiva

A implementacao derivada desta ADR deve cobrir:

- validacao de issuer, audience, assinatura, expiracao e estado de tokens do
  provider;
- mapeamento idempotente entre usuario externo e `User` local;
- criacao ou selecao segura de organizacao e perfil financeiro apos primeiro
  login;
- sessao persistente com timeout absoluto e timeout por inatividade;
- renovacao de sessao sem reusar tokens vencidos;
- revogacao por logout, troca de senha, desabilitacao de usuario ou evento de
  seguranca do provider quando disponivel;
- auditoria de login, logout, falha relevante, revogacao, troca de provider ou
  alteracao de tenant/perfil ativo;
- erros genericos para credenciais invalidas ou falhas de autenticacao;
- separacao clara entre ambientes local, preview, staging e producao;
- testes de contrato, tenant e falhas de autenticacao.

## Politica de sessoes

A sessao de aplicacao deve ter:

- token opaco gerado com entropia forte;
- armazenamento persistente em tabela propria;
- hash do token persistido, nao o token bruto;
- `createdAt`, `lastSeenAt`, `expiresAt`, `revokedAt` e motivo de revogacao;
- timeout por inatividade configuravel;
- timeout absoluto configuravel;
- logout invalidando a sessao ativa;
- capacidade de revogar todas as sessoes de um usuario.

A UI deve manter o token em cookie `HttpOnly`, `Secure` em producao e com
politica `SameSite` adequada ao fluxo escolhido. Qualquer uso futuro de refresh
token do provider deve ficar restrito ao backend ou a um componente seguro
aprovado, nunca exposto em logs ou storage inseguro do navegador.

## Integracao com tenant

A identidade externa nao substitui o tenant financeiro. Depois de validar o
usuario, a API deve resolver o `TenantContext` a partir dos registros locais de
organizacao e perfil financeiro.

Quando houver um unico perfil ativo, ele pode ser usado como contexto inicial.
Quando houver multiplos perfis ativos, o cliente deve enviar o perfil desejado
explicitamente ou usar preferencia persistida segura. Usuario sem perfil ativo
deve receber fluxo controlado para criar ou selecionar perfil, conforme
`docs/TENANT.md`.

## Auditoria e LGPD

Eventos de seguranca devem ser auditaveis sem expor segredos ou dados sensiveis.
A auditoria deve registrar metadados seguros, como usuario, organizacao, data,
acao, resultado, origem tecnica minimizada e correlacao de request quando
existir.

Nao devem ser registrados:

- senhas;
- tokens brutos;
- codigos de recuperacao;
- respostas completas do provider;
- dados pessoais alem do minimo operacional necessario.

Retencao, exportacao e descarte desses eventos devem seguir a politica de
privacidade e retencao definida para o produto.

## Consequencias

- O modulo demo atual continua valido para desenvolvimento local e testes, mas
  nao e caminho produtivo.
- A tabela `User` local permanece como espelho operacional da identidade externa,
  nao como fonte primaria de credenciais produtivas.
- O projeto passa a depender de um provider externo de identidade em producao.
- A escolha concreta do fornecedor pode ocorrer na issue de implementacao, desde
  que ele cumpra este contrato e seja documentado.
- A API precisara de endpoints novos ou adaptados para callback/troca de token,
  sessao, logout e sincronizacao de usuario.
- Sessoes em memoria devem ser substituidas por sessoes persistentes antes de
  uso produtivo.
- O ambiente produtivo deve exigir variaveis de configuracao do provider e deve
  falhar cedo se elas estiverem ausentes.

## Alternativas consideradas

### Manter auth demo sem bloqueio de ambiente

Rejeitada. O risco de uso silencioso em ambiente incorreto e alto para um
produto financeiro.

### Evoluir modulo proprio com senha produtiva

Rejeitada para esta fase. Embora seja tecnicamente possivel usar hashing forte,
rate limit, MFA, recuperacao e auditoria proprios, isso cria uma superficie de
seguranca grande para uma equipe ainda focada no MVP financeiro. O custo de
operacao, resposta a abuso e conformidade nao compensa nesta etapa.

### Provider gerenciado com credenciais delegadas

Aceita. Reduz a responsabilidade direta do SolverFin sobre senhas, MFA e
recuperacao de conta, preservando no produto apenas o mapeamento operacional de
usuario, tenant, perfis financeiros e sessoes de aplicacao.

### Provider gerenciado sem sessao propria de aplicacao

Rejeitada. Depender exclusivamente da sessao do provider dificultaria auditoria,
revogacao local, tenant ativo e controle operacional especifico do produto.

## Issues derivadas

A implementacao desta ADR deve ser feita em issues tecnicas separadas, cobrindo
no minimo:

- integrar provider OIDC/OAuth2 produtivo;
- criar sessoes persistentes e revogaveis;
- registrar auditoria de eventos de seguranca;
- atualizar UI de login/callback/logout;
- adicionar variaveis e validacoes de ambiente produtivo;
- cobrir testes de contrato, tenant e falhas de autenticacao.

## Referencias

- OWASP Authentication Cheat Sheet.
- OWASP Session Management Cheat Sheet.
- NIST SP 800-63B Digital Identity Guidelines: Authentication and Lifecycle
  Management.
