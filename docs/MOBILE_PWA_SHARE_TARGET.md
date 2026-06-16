# Mobile, PWA e compartilhamento

Este documento registra o escopo MVP da experiencia mobile-first do SolverFin enquanto o app web ainda esta em bootstrap TypeScript e antes de existir um frontend renderizavel completo.

## Decisoes implementadas

- O PWA usa `display: standalone`, `start_url` em `/app?source=pwa`, escopo `/` e icones de 192px, 512px e 512px maskable.
- O manifest declara Web Share Target em `/app/inbox/compartilhar`, via `POST` e `application/x-www-form-urlencoded`.
- A navegacao mobile mantem como rotas primarias: Resumo, Lancamentos, Revisao e Configuracoes.
- O modelo de readiness mobile valida viewport mobile, barra inferior, rotas principais e estados loading, vazio, erro e pronto.
- O fluxo equivalente de compartilhamento cria um item de inbox recebido a partir de texto compartilhado ou colado.

## Contrato do item recebido

Um texto compartilhado vira um item processavel quando existe contexto autenticado:

- `organizationId`
- `financialProfileId`
- `userId`
- `source`, com `web_share_target` ou `manual_paste`
- `status: received`
- `receivedAt`
- `rawText`
- `maskedPreview`
- `duplicateKey`

Payload vazio, usuario sem autenticacao e texto acima de 4.000 caracteres retornam erro controlado.

## Privacidade e dados ficticios

O preview mascara padroes comuns de cartao, documento e valores em reais antes de exibicao curta. O `rawText` permanece no contrato para processamento posterior pela inbox, mas nao deve ser logado sem mascaramento e consentimento aplicavel.

Todos os exemplos e testes usam dados ficticios.

## Validacao mobile registrada

Como ainda nao ha frontend renderizavel nem dev server real em `apps/web`, a validacao visual em dispositivo/browser fica marcada como nao aplicavel nesta PR. A cobertura possivel neste estado do repositorio e automatizada por contrato:

- manifest instalavel e com share target;
- rotas primarias acessiveis no modelo mobile;
- estados vazio e erro exigindo texto/acao clara;
- criacao de item de inbox para texto compartilhado;
- rejeicao de payload vazio e usuario nao autenticado;
- mascaramento de preview.

Quando a stack visual estiver pronta, esta validacao deve ser complementada com screenshots em pelo menos um viewport mobile e um desktop.

## Limitacoes conhecidas do MVP

- Offline completo e sincronizacao local permanecem fora do escopo.
- Suporte real a Web Share Target depende do navegador, sistema operacional e instalacao do PWA.
- Anexos e comprovantes com imagem devem entrar em fluxo futuro de OCR/anexos.
- A persistencia definitiva do item de inbox depende do backend/handler da inbox.
