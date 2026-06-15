#!/usr/bin/env bash
set -euo pipefail
REPO="${1:-crgasparoto-br/SolverFin}"
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BODY_DIR="$BASE_DIR/issue-bodies"
echo "Repositorio alvo: $REPO"
command -v gh >/dev/null 2>&1 || { echo "Erro: instale GitHub CLI (gh) antes de executar." >&2; exit 1; }
gh repo view "$REPO" >/dev/null

create_label() {
  local name="$1" color="$2" desc="$3"
  gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" >/dev/null 2>&1 || gh label edit "$name" --repo "$REPO" --color "$color" --description "$desc" >/dev/null 2>&1 || true
}

create_label "epic" "5319e7" "Agrupador de trabalho grande"
create_label "documentation" "0075ca" "Documentacao"
create_label "ai-ready" "7057ff" "Preparado para implementacao por IA"
create_label "architecture" "1d76db" "Arquitetura"
create_label "devops" "0e8a16" "DevOps e automacao"
create_label "data" "fbca04" "Dados e persistencia"
create_label "backend" "2ea44f" "Backend"
create_label "frontend" "c5def5" "Frontend"
create_label "mobile" "bfdadc" "Mobile/PWA"
create_label "ai" "a2eeef" "Inteligencia artificial"
create_label "security" "d73a4a" "Seguranca e LGPD"
create_label "integration" "f9d0c4" "Integracoes"
create_label "testing" "fef2c0" "Testes e qualidade"
create_label "product" "d4c5f9" "Produto"
create_label "mvp" "0052cc" "Escopo MVP"
create_label "phase:0" "ededed" "Fase 0 - Fundacao"
create_label "phase:1" "bfe5bf" "Fase 1 - MVP core"
create_label "phase:2" "c2e0c6" "Fase 2 - Automacao/IA"
create_label "phase:3" "bfd4f2" "Fase 3 - Operacao/integracoes"

declare -A ISSUE_NUMBERS
create_issue() {
  local key="$1" title="$2" labels="$3" body_file="$4"
  echo "Criando $key - $title"
  local url
  url=$(gh issue create --repo "$REPO" --title "$title" --body-file "$BODY_DIR/$body_file" --label "$labels")
  local number="${url##*/}"
  ISSUE_NUMBERS[$key]="$number"
  echo "$key #$number $url"
}

create_issue "E01" "[EPIC] Fundacao documental e operacao por IA" "epic,documentation,ai-ready,phase:0" "001-e01-epic-fundacao-documental-e-operacao-por-ia.md"
create_issue "E02" "[EPIC] Bootstrap tecnico do repositorio" "epic,devops,architecture,phase:0" "002-e02-epic-bootstrap-tecnico-do-repositorio.md"
create_issue "E03" "[EPIC] Dominio financeiro e persistencia" "epic,data,backend,mvp,phase:1" "003-e03-epic-dominio-financeiro-e-persistencia.md"
create_issue "E04" "[EPIC] Identidade, acesso e multi-tenant" "epic,security,backend,mvp,phase:1" "004-e04-epic-identidade-acesso-e-multi-tenant.md"
create_issue "E05" "[EPIC] Backend core financeiro MVP" "epic,backend,mvp,phase:1" "005-e05-epic-backend-core-financeiro-mvp.md"
create_issue "E06" "[EPIC] Frontend web/PWA MVP" "epic,frontend,mvp,phase:1" "006-e06-epic-frontend-web-pwa-mvp.md"
create_issue "E07" "[EPIC] Importacao, automacao e conciliacao" "epic,integration,ai-ready,phase:2" "007-e07-epic-importacao-automacao-e-conciliacao.md"
create_issue "E08" "[EPIC] IA financeira aplicada" "epic,ai,ai-ready,phase:2" "008-e08-epic-ia-financeira-aplicada.md"
create_issue "E09" "[EPIC] Experiencia mobile e captura de mensagens" "epic,mobile,integration,phase:2" "009-e09-epic-experiencia-mobile-e-captura-de-mensagens.md"
create_issue "E10" "[EPIC] Seguranca, LGPD e privacidade financeira" "epic,security,documentation,phase:1" "010-e10-epic-seguranca-lgpd-e-privacidade-financeira.md"
create_issue "E11" "[EPIC] Qualidade, observabilidade e operacao" "epic,testing,devops,phase:3" "011-e11-epic-qualidade-observabilidade-e-operacao.md"
create_issue "E12" "[EPIC] Integracoes SolverIT e plano profissional/MEI" "epic,integration,mvp,phase:3" "012-e12-epic-integracoes-solverit-e-plano-profissional-mei.md"

create_issue "D01" "Criar README principal orientado a produto e IA" "documentation,ai-ready,phase:0" "013-d01-criar-readme-principal-orientado-a-produto-e-ia.md"
create_issue "D02" "Criar docs/PRODUCT.md com visao, personas e escopo MVP" "documentation,product,ai-ready,phase:0" "014-d02-criar-docs-product-md-com-visao-personas-e-escopo-mvp.md"
create_issue "D03" "Criar docs/ARCHITECTURE.md e decisao inicial de stack" "documentation,architecture,ai-ready,phase:0" "015-d03-criar-docs-architecture-md-e-decisao-inicial-de-stack.md"
create_issue "D04" "Criar AGENTS.md com regras globais para agentes de IA" "documentation,ai-ready,phase:0" "016-d04-criar-agents-md-com-regras-globais-para-agentes-de-ia.md"
create_issue "D05" "Criar .github/copilot-instructions.md" "documentation,ai-ready,phase:0" "017-d05-criar-github-copilot-instructions-md.md"
create_issue "D06" "Criar templates de issue e pull request para tarefas de IA" "documentation,ai-ready,devops,phase:0" "018-d06-criar-templates-de-issue-e-pull-request-para-tarefas-de-ia.md"
create_issue "D07" "Criar estrutura de ADRs e ADR-0001" "documentation,architecture,phase:0" "019-d07-criar-estrutura-de-adrs-e-adr-0001.md"
create_issue "B01" "Inicializar monorepo e estrutura de pastas" "devops,architecture,phase:0" "020-b01-inicializar-monorepo-e-estrutura-de-pastas.md"
create_issue "B02" "Configurar TypeScript, lint, formatacao e convencoes" "devops,testing,phase:0" "021-b02-configurar-typescript-lint-formatacao-e-convencoes.md"
create_issue "B03" "Configurar Docker Compose para desenvolvimento local" "devops,backend,phase:0" "022-b03-configurar-docker-compose-para-desenvolvimento-local.md"
create_issue "B04" "Configurar CI inicial no GitHub Actions" "devops,testing,phase:0" "023-b04-configurar-ci-inicial-no-github-actions.md"
create_issue "B05" "Configurar gerenciamento seguro de ambientes e secrets" "devops,security,phase:0" "024-b05-configurar-gerenciamento-seguro-de-ambientes-e-secrets.md"
create_issue "F01" "Modelar entidades financeiras principais" "data,backend,mvp,phase:1" "025-f01-modelar-entidades-financeiras-principais.md"
create_issue "F02" "Implementar schema Prisma e migrations iniciais" "data,backend,mvp,phase:1" "026-f02-implementar-schema-prisma-e-migrations-iniciais.md"
create_issue "F03" "Criar seed de categorias e dados de exemplo seguros" "data,backend,mvp,phase:1" "027-f03-criar-seed-de-categorias-e-dados-de-exemplo-seguros.md"
create_issue "F04" "Implementar auditoria de alteracoes financeiras" "security,data,backend,phase:1" "028-f04-implementar-auditoria-de-alteracoes-financeiras.md"
create_issue "A01" "Implementar autenticacao inicial" "backend,security,mvp,phase:1" "029-a01-implementar-autenticacao-inicial.md"
create_issue "A02" "Implementar organizacoes, perfis financeiros e tenant" "backend,security,mvp,phase:1" "030-a02-implementar-organizacoes-perfis-financeiros-e-tenant.md"
create_issue "A03" "Aplicar isolamento de dados e autorizacao por tenant" "backend,security,testing,phase:1" "031-a03-aplicar-isolamento-de-dados-e-autorizacao-por-tenant.md"
create_issue "C01" "Implementar API de contas financeiras" "backend,mvp,phase:1" "032-c01-implementar-api-de-contas-financeiras.md"
create_issue "C02" "Implementar API de categorias e subcategorias" "backend,mvp,phase:1" "033-c02-implementar-api-de-categorias-e-subcategorias.md"
create_issue "C03" "Implementar API de lancamentos financeiros" "backend,mvp,phase:1" "034-c03-implementar-api-de-lancamentos-financeiros.md"
create_issue "C04" "Implementar recorrencias e parcelamentos" "backend,mvp,phase:1" "035-c04-implementar-recorrencias-e-parcelamentos.md"
create_issue "C05" "Implementar cartoes de credito e faturas" "backend,mvp,phase:1" "036-c05-implementar-cartoes-de-credito-e-faturas.md"
create_issue "C06" "Implementar orcamentos, metas e alertas basicos" "backend,mvp,phase:1" "037-c06-implementar-orcamentos-metas-e-alertas-basicos.md"
create_issue "C07" "Implementar contas a pagar e a receber" "backend,mvp,phase:1" "038-c07-implementar-contas-a-pagar-e-a-receber.md"
create_issue "W01" "Criar design system inicial e componentes base" "frontend,mvp,phase:1" "039-w01-criar-design-system-inicial-e-componentes-base.md"
create_issue "W02" "Implementar shell da aplicacao e navegacao" "frontend,mvp,phase:1" "040-w02-implementar-shell-da-aplicacao-e-navegacao.md"
create_issue "W03" "Implementar dashboard financeiro inicial" "frontend,mvp,phase:1" "041-w03-implementar-dashboard-financeiro-inicial.md"
create_issue "W04" "Implementar telas de contas, cartoes e categorias" "frontend,mvp,phase:1" "042-w04-implementar-telas-de-contas-cartoes-e-categorias.md"
create_issue "W05" "Implementar telas de lancamentos e filtros" "frontend,mvp,phase:1" "043-w05-implementar-telas-de-lancamentos-e-filtros.md"
create_issue "W06" "Implementar relatorios iniciais e orcamento mensal" "frontend,mvp,phase:1" "044-w06-implementar-relatorios-iniciais-e-orcamento-mensal.md"
create_issue "I01" "Implementar importacao CSV e OFX inicial" "integration,backend,mvp,phase:2" "045-i01-implementar-importacao-csv-e-ofx-inicial.md"
create_issue "I02" "Implementar inbox de mensagens bancarias coladas ou compartilhadas" "integration,ai-ready,phase:2" "046-i02-implementar-inbox-de-mensagens-bancarias-coladas-ou-compartilhadas.md"
create_issue "I03" "Implementar motor de deduplicacao de transacoes" "integration,backend,ai-ready,phase:2" "047-i03-implementar-motor-de-deduplicacao-de-transacoes.md"
create_issue "I04" "Implementar conciliacao entre previsto, importado e realizado" "integration,backend,phase:2" "048-i04-implementar-conciliacao-entre-previsto-importado-e-realizado.md"
create_issue "I05" "Implementar regras automaticas configuraveis" "integration,backend,ai-ready,phase:2" "049-i05-implementar-regras-automaticas-configuraveis.md"
create_issue "I06" "Criar estudo tecnico de Open Finance via parceiro" "integration,documentation,phase:2" "050-i06-criar-estudo-tecnico-de-open-finance-via-parceiro.md"
create_issue "AI01" "Criar abstracao de provedores de IA e politicas de uso" "ai,backend,security,phase:2" "051-ai01-criar-abstracao-de-provedores-de-ia-e-politicas-de-uso.md"
create_issue "AI02" "Definir schemas estruturados para extracao de lancamentos" "ai,backend,ai-ready,phase:2" "052-ai02-definir-schemas-estruturados-para-extracao-de-lancamentos.md"
create_issue "AI03" "Implementar parser de mensagens bancarias com IA e fallback por regras" "ai,integration,phase:2" "053-ai03-implementar-parser-de-mensagens-bancarias-com-ia-e-fallback-por-regras.md"
create_issue "AI04" "Implementar categorizacao inteligente e aprendizado por correcao" "ai,backend,phase:2" "054-ai04-implementar-categorizacao-inteligente-e-aprendizado-por-correcao.md"
create_issue "AI05" "Implementar fila de revisao de sugestoes da IA" "ai,frontend,backend,phase:2" "055-ai05-implementar-fila-de-revisao-de-sugestoes-da-ia.md"
create_issue "AI06" "Implementar assistente financeiro de perguntas e respostas" "ai,frontend,backend,phase:3" "056-ai06-implementar-assistente-financeiro-de-perguntas-e-respostas.md"
create_issue "AI07" "Implementar insights, anomalias e resumo mensal" "ai,backend,frontend,phase:3" "057-ai07-implementar-insights-anomalias-e-resumo-mensal.md"
create_issue "M01" "Garantir experiencia PWA mobile-first" "mobile,frontend,phase:2" "058-m01-garantir-experiencia-pwa-mobile-first.md"
create_issue "M02" "Implementar Web Share Target ou fluxo equivalente de compartilhamento" "mobile,integration,phase:2" "059-m02-implementar-web-share-target-ou-fluxo-equivalente-de-compartilhamento.md"
create_issue "M03" "Prototipar captura Android de notificacoes bancarias com consentimento" "mobile,integration,security,phase:3" "060-m03-prototipar-captura-android-de-notificacoes-bancarias-com-consentimento.md"
create_issue "S01" "Implementar modelo de consentimento e preferencias de privacidade" "security,backend,frontend,phase:1" "061-s01-implementar-modelo-de-consentimento-e-preferencias-de-privacidade.md"
create_issue "S02" "Aplicar mascaramento de dados financeiros sensiveis" "security,frontend,backend,phase:1" "062-s02-aplicar-mascaramento-de-dados-financeiros-sensiveis.md"
create_issue "S03" "Criar politica de retencao, exportacao e exclusao de dados" "security,documentation,phase:1" "063-s03-criar-politica-de-retencao-exportacao-e-exclusao-de-dados.md"
create_issue "S04" "Implementar exclusao logica e trilha de auditoria segura" "security,backend,data,phase:1" "064-s04-implementar-exclusao-logica-e-trilha-de-auditoria-segura.md"
create_issue "Q01" "Configurar estrategia de testes unitarios, integracao e e2e" "testing,devops,phase:3" "065-q01-configurar-estrategia-de-testes-unitarios-integracao-e-e2e.md"
create_issue "Q02" "Implementar observabilidade basica e tratamento de erros" "devops,backend,frontend,phase:3" "066-q02-implementar-observabilidade-basica-e-tratamento-de-erros.md"
create_issue "Q03" "Implementar checks de acessibilidade e performance inicial" "frontend,testing,phase:3" "067-q03-implementar-checks-de-acessibilidade-e-performance-inicial.md"
create_issue "Q04" "Criar playbook de troubleshooting para agentes de IA" "documentation,ai-ready,devops,phase:3" "068-q04-criar-playbook-de-troubleshooting-para-agentes-de-ia.md"
create_issue "G01" "Definir contrato de integracao com Agenda Profissional" "integration,documentation,phase:3" "069-g01-definir-contrato-de-integracao-com-agenda-profissional.md"
create_issue "G02" "Definir contrato de integracao com Limite MEI" "integration,documentation,phase:3" "070-g02-definir-contrato-de-integracao-com-limite-mei.md"
create_issue "G03" "Implementar exportacao para contador e relatorios MEI" "backend,frontend,integration,phase:3" "071-g03-implementar-exportacao-para-contador-e-relatorios-mei.md"

echo "Criando comentarios de relacionamento parent/child..."
cat > /tmp/E01_children.md <<EOF
## Subissues criadas

Para transformar estes itens em sub-issues nativas do GitHub: abra a issue pai, use **Create sub-issue > Add existing issue** e selecione cada issue abaixo.

- [ ] #${ISSUE_NUMBERS[D01]} - Criar README principal orientado a produto e IA
- [ ] #${ISSUE_NUMBERS[D02]} - Criar docs/PRODUCT.md com visao, personas e escopo MVP
- [ ] #${ISSUE_NUMBERS[D03]} - Criar docs/ARCHITECTURE.md e decisao inicial de stack
- [ ] #${ISSUE_NUMBERS[D04]} - Criar AGENTS.md com regras globais para agentes de IA
- [ ] #${ISSUE_NUMBERS[D05]} - Criar .github/copilot-instructions.md
- [ ] #${ISSUE_NUMBERS[D06]} - Criar templates de issue e pull request para tarefas de IA
- [ ] #${ISSUE_NUMBERS[D07]} - Criar estrutura de ADRs e ADR-0001
EOF
gh issue comment "${ISSUE_NUMBERS[E01]}" --repo "$REPO" --body-file /tmp/E01_children.md >/dev/null
cat > /tmp/E02_children.md <<EOF
## Subissues criadas

Para transformar estes itens em sub-issues nativas do GitHub: abra a issue pai, use **Create sub-issue > Add existing issue** e selecione cada issue abaixo.

- [ ] #${ISSUE_NUMBERS[B01]} - Inicializar monorepo e estrutura de pastas
- [ ] #${ISSUE_NUMBERS[B02]} - Configurar TypeScript, lint, formatacao e convencoes
- [ ] #${ISSUE_NUMBERS[B03]} - Configurar Docker Compose para desenvolvimento local
- [ ] #${ISSUE_NUMBERS[B04]} - Configurar CI inicial no GitHub Actions
- [ ] #${ISSUE_NUMBERS[B05]} - Configurar gerenciamento seguro de ambientes e secrets
EOF
gh issue comment "${ISSUE_NUMBERS[E02]}" --repo "$REPO" --body-file /tmp/E02_children.md >/dev/null
cat > /tmp/E03_children.md <<EOF
## Subissues criadas

Para transformar estes itens em sub-issues nativas do GitHub: abra a issue pai, use **Create sub-issue > Add existing issue** e selecione cada issue abaixo.

- [ ] #${ISSUE_NUMBERS[F01]} - Modelar entidades financeiras principais
- [ ] #${ISSUE_NUMBERS[F02]} - Implementar schema Prisma e migrations iniciais
- [ ] #${ISSUE_NUMBERS[F03]} - Criar seed de categorias e dados de exemplo seguros
- [ ] #${ISSUE_NUMBERS[F04]} - Implementar auditoria de alteracoes financeiras
EOF
gh issue comment "${ISSUE_NUMBERS[E03]}" --repo "$REPO" --body-file /tmp/E03_children.md >/dev/null
cat > /tmp/E04_children.md <<EOF
## Subissues criadas

Para transformar estes itens em sub-issues nativas do GitHub: abra a issue pai, use **Create sub-issue > Add existing issue** e selecione cada issue abaixo.

- [ ] #${ISSUE_NUMBERS[A01]} - Implementar autenticacao inicial
- [ ] #${ISSUE_NUMBERS[A02]} - Implementar organizacoes, perfis financeiros e tenant
- [ ] #${ISSUE_NUMBERS[A03]} - Aplicar isolamento de dados e autorizacao por tenant
EOF
gh issue comment "${ISSUE_NUMBERS[E04]}" --repo "$REPO" --body-file /tmp/E04_children.md >/dev/null
cat > /tmp/E05_children.md <<EOF
## Subissues criadas

Para transformar estes itens em sub-issues nativas do GitHub: abra a issue pai, use **Create sub-issue > Add existing issue** e selecione cada issue abaixo.

- [ ] #${ISSUE_NUMBERS[C01]} - Implementar API de contas financeiras
- [ ] #${ISSUE_NUMBERS[C02]} - Implementar API de categorias e subcategorias
- [ ] #${ISSUE_NUMBERS[C03]} - Implementar API de lancamentos financeiros
- [ ] #${ISSUE_NUMBERS[C04]} - Implementar recorrencias e parcelamentos
- [ ] #${ISSUE_NUMBERS[C05]} - Implementar cartoes de credito e faturas
- [ ] #${ISSUE_NUMBERS[C06]} - Implementar orcamentos, metas e alertas basicos
- [ ] #${ISSUE_NUMBERS[C07]} - Implementar contas a pagar e a receber
EOF
gh issue comment "${ISSUE_NUMBERS[E05]}" --repo "$REPO" --body-file /tmp/E05_children.md >/dev/null
cat > /tmp/E06_children.md <<EOF
## Subissues criadas

Para transformar estes itens em sub-issues nativas do GitHub: abra a issue pai, use **Create sub-issue > Add existing issue** e selecione cada issue abaixo.

- [ ] #${ISSUE_NUMBERS[W01]} - Criar design system inicial e componentes base
- [ ] #${ISSUE_NUMBERS[W02]} - Implementar shell da aplicacao e navegacao
- [ ] #${ISSUE_NUMBERS[W03]} - Implementar dashboard financeiro inicial
- [ ] #${ISSUE_NUMBERS[W04]} - Implementar telas de contas, cartoes e categorias
- [ ] #${ISSUE_NUMBERS[W05]} - Implementar telas de lancamentos e filtros
- [ ] #${ISSUE_NUMBERS[W06]} - Implementar relatorios iniciais e orcamento mensal
EOF
gh issue comment "${ISSUE_NUMBERS[E06]}" --repo "$REPO" --body-file /tmp/E06_children.md >/dev/null
cat > /tmp/E07_children.md <<EOF
## Subissues criadas

Para transformar estes itens em sub-issues nativas do GitHub: abra a issue pai, use **Create sub-issue > Add existing issue** e selecione cada issue abaixo.

- [ ] #${ISSUE_NUMBERS[I01]} - Implementar importacao CSV e OFX inicial
- [ ] #${ISSUE_NUMBERS[I02]} - Implementar inbox de mensagens bancarias coladas ou compartilhadas
- [ ] #${ISSUE_NUMBERS[I03]} - Implementar motor de deduplicacao de transacoes
- [ ] #${ISSUE_NUMBERS[I04]} - Implementar conciliacao entre previsto, importado e realizado
- [ ] #${ISSUE_NUMBERS[I05]} - Implementar regras automaticas configuraveis
- [ ] #${ISSUE_NUMBERS[I06]} - Criar estudo tecnico de Open Finance via parceiro
EOF
gh issue comment "${ISSUE_NUMBERS[E07]}" --repo "$REPO" --body-file /tmp/E07_children.md >/dev/null
cat > /tmp/E08_children.md <<EOF
## Subissues criadas

Para transformar estes itens em sub-issues nativas do GitHub: abra a issue pai, use **Create sub-issue > Add existing issue** e selecione cada issue abaixo.

- [ ] #${ISSUE_NUMBERS[AI01]} - Criar abstracao de provedores de IA e politicas de uso
- [ ] #${ISSUE_NUMBERS[AI02]} - Definir schemas estruturados para extracao de lancamentos
- [ ] #${ISSUE_NUMBERS[AI03]} - Implementar parser de mensagens bancarias com IA e fallback por regras
- [ ] #${ISSUE_NUMBERS[AI04]} - Implementar categorizacao inteligente e aprendizado por correcao
- [ ] #${ISSUE_NUMBERS[AI05]} - Implementar fila de revisao de sugestoes da IA
- [ ] #${ISSUE_NUMBERS[AI06]} - Implementar assistente financeiro de perguntas e respostas
- [ ] #${ISSUE_NUMBERS[AI07]} - Implementar insights, anomalias e resumo mensal
EOF
gh issue comment "${ISSUE_NUMBERS[E08]}" --repo "$REPO" --body-file /tmp/E08_children.md >/dev/null
cat > /tmp/E09_children.md <<EOF
## Subissues criadas

Para transformar estes itens em sub-issues nativas do GitHub: abra a issue pai, use **Create sub-issue > Add existing issue** e selecione cada issue abaixo.

- [ ] #${ISSUE_NUMBERS[M01]} - Garantir experiencia PWA mobile-first
- [ ] #${ISSUE_NUMBERS[M02]} - Implementar Web Share Target ou fluxo equivalente de compartilhamento
- [ ] #${ISSUE_NUMBERS[M03]} - Prototipar captura Android de notificacoes bancarias com consentimento
EOF
gh issue comment "${ISSUE_NUMBERS[E09]}" --repo "$REPO" --body-file /tmp/E09_children.md >/dev/null
cat > /tmp/E10_children.md <<EOF
## Subissues criadas

Para transformar estes itens em sub-issues nativas do GitHub: abra a issue pai, use **Create sub-issue > Add existing issue** e selecione cada issue abaixo.

- [ ] #${ISSUE_NUMBERS[S01]} - Implementar modelo de consentimento e preferencias de privacidade
- [ ] #${ISSUE_NUMBERS[S02]} - Aplicar mascaramento de dados financeiros sensiveis
- [ ] #${ISSUE_NUMBERS[S03]} - Criar politica de retencao, exportacao e exclusao de dados
- [ ] #${ISSUE_NUMBERS[S04]} - Implementar exclusao logica e trilha de auditoria segura
EOF
gh issue comment "${ISSUE_NUMBERS[E10]}" --repo "$REPO" --body-file /tmp/E10_children.md >/dev/null
cat > /tmp/E11_children.md <<EOF
## Subissues criadas

Para transformar estes itens em sub-issues nativas do GitHub: abra a issue pai, use **Create sub-issue > Add existing issue** e selecione cada issue abaixo.

- [ ] #${ISSUE_NUMBERS[Q01]} - Configurar estrategia de testes unitarios, integracao e e2e
- [ ] #${ISSUE_NUMBERS[Q02]} - Implementar observabilidade basica e tratamento de erros
- [ ] #${ISSUE_NUMBERS[Q03]} - Implementar checks de acessibilidade e performance inicial
- [ ] #${ISSUE_NUMBERS[Q04]} - Criar playbook de troubleshooting para agentes de IA
EOF
gh issue comment "${ISSUE_NUMBERS[E11]}" --repo "$REPO" --body-file /tmp/E11_children.md >/dev/null
cat > /tmp/E12_children.md <<EOF
## Subissues criadas

Para transformar estes itens em sub-issues nativas do GitHub: abra a issue pai, use **Create sub-issue > Add existing issue** e selecione cada issue abaixo.

- [ ] #${ISSUE_NUMBERS[G01]} - Definir contrato de integracao com Agenda Profissional
- [ ] #${ISSUE_NUMBERS[G02]} - Definir contrato de integracao com Limite MEI
- [ ] #${ISSUE_NUMBERS[G03]} - Implementar exportacao para contador e relatorios MEI
EOF
gh issue comment "${ISSUE_NUMBERS[E12]}" --repo "$REPO" --body-file /tmp/E12_children.md >/dev/null

echo "Concluido. Veja as issues em: https://github.com/$REPO/issues"
