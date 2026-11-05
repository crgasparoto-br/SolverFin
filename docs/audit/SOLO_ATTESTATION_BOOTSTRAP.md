# Bootstrap da atestação Ed25519 de operador único — SolverFin

## Objetivo e limite

Preparar a modalidade oficial `single-operator-separate-context` para o SolverFin, sem alegar revisão humana de terceiros. Esta modalidade publica exclusivamente o check `Verify solo audit attestation (exact SHA)` e **não** substitui `Verify independent audit (exact SHA)`.

Fonte normativa: [crgasparoto-br/skill, branch develop](https://github.com/crgasparoto-br/skill/tree/develop), especialmente `auditar-issue/references/external-audit-contract.md`, `docs/SECURITY.md` e `docs/WEB_INDEPENDENT_AUDIT.md`.

## Estado de implantação

- Os arquivos do controlador, a cadeia de validação, os esquemas e a lista `TRUSTED_PATHS` foram copiados da skill oficial, sem reduzir requisitos.
- **O fluxo ainda não está operacional.** O código oficial exige os checks de CI do repositório `skill` (`Structure and tests`, `Offline authorization tests`, `collect / Require certified semantic handoff (exact SHA)`), enquanto o SolverFin usa outras verificações, inclusive `Delivery V2 gate`. É necessário criar e testar um adaptador de evidências **sem dispensar checks** ou aceitar fontes não autenticadas.
- A execução também exige os arquivos confiáveis nas bases protegidas `develop` e `main`; a implantação não pode declarar aprovação enquanto a árvore de origem não for publicada e validada nas duas bases.
- **Não incluir o check nas rulesets** enquanto a comprovação do escopo por PR, da proteção de branches e dos cenários adversariais não estiver concluída.

## Configuração externa — somente após a aprovação técnica

1. Gere o par de chaves Ed25519 em ambiente separado e protegido com `auditar-issue/scripts/generate_auditor_keypair.py`; nunca publique a chave privada.
2. Gere o registro público com `auditar-issue/scripts/build_trusted_auditor_entry.py`, escopo **exato** `crgasparoto-br/SolverFin`.
3. Configure em **Settings → Secrets and variables → Actions → Variables**:
   - `SOLVERIT_SOLO_AUDIT_ENABLED=true`
   - `SOLVERIT_SOLO_AUDIT_OPERATOR_ID` (ID numérico autenticado do GitHub)
   - `SOLVERIT_SOLO_AUDIT_KEY_ID` (ID da chave pública)
   - `SOLVERIT_TRUSTED_AUDITORS_JSON` (registro JSON público)
4. Realize a auditoria em contexto de execução realmente separado. Use identificador autêntico emitido pela plataforma; não invente um ID de conversa.
5. Monte o `external-audit.json` v3 vinculando PR, issue, hash do corpo da issue, base, HEAD e merge preview atuais, com `assurance_mode=single-operator-separate-context`, `independent=false` e `same_conversation=false`. Assine-o com o utilitário oficial e valide-o contra o registro.
6. Publique um único comentário na PR contendo exclusivamente `SOLVERIT_EXTERNAL_AUDIT_JSON:` seguido de uma quebra de linha e do JSON assinado.
7. Confirme a execução confiável de Actions, o check exact-SHA, os testes negativos, a rastreabilidade do recibo e a proteção real da branch.

## Condições de aceite antes do uso

- Adaptador de CI autenticado do SolverFin validado em HEAD exato e em falhas/reenfileiramentos.
- Proteção de `develop` e `main` confirmada por leitura confiável; ramo de execução protegido.
- Eventos de comentário, alterações de issue, mudanças de HEAD/base e revogação exercitados.
- PRs compartilhando HEAD rejeitadas; reconsulta imediatamente antes do sucesso.
- Nenhuma alteração automática de ruleset, nenhuma assinatura falsa e nenhum merge sem aviso.

A importação dos arquivos por si só não equivale à aprovação técnica nem à aprovação externa.
