# Qualidade visual de logos de instituições

## Objetivo

Manter a renderização de instituições financeiras nítida, estável e segura nas telas de contas, cartões e Admin global.

## Fontes permitidas

A renderização web aceita apenas fontes controladas pelo SolverFin:

- assets locais versionados em `/images/institutions/`;
- assets enviados e publicados pelo backend em `/assets/institutions/`, quando o fluxo R2 estiver persistido por ambiente.

URLs externas genéricas de serviços de logo não devem ser usadas em runtime.

## Fallback obrigatório

Todo logo com imagem precisa continuar renderizando o fallback por iniciais no HTML. Quando a imagem falhar no browser, o fallback deve aparecer sem quebrar o layout.

Bancos sem logo aprovado continuam usando apenas o badge por iniciais.

## Acessibilidade

- Imagens devem ter `alt` descritivo, no padrão `Logo <instituição>`.
- Badges por iniciais devem ter `role="img"` e `aria-label` com o nome da instituição.
- O ícone de instituição nas contas não deve ficar dentro de um contêiner `aria-hidden`, porque a marca ajuda a identificar a conta.

## Layout

- O slot visual padrão é 44x44.
- Imagens usam `object-fit: contain` para evitar corte/distorção.
- O fundo branco interno é preservado para reduzir conflito visual entre marcas e tema.
- O nome de arquivo local deve usar kebab-case, por exemplo `porto-bank.svg`.

## Segurança

- SVG local só deve entrar quando a origem for controlada e revisada.
- SVG enviado por upload continua bloqueado no fluxo R2 atual.
- Testes validam existência, tipo permitido, ausência de script em SVG local e ausência de dependência de domínios externos de logo.
