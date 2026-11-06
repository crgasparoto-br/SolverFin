# Atestação Ed25519 de operador único — SolverFin

## Garantia e limites

Este é o modo oficial `single-operator-separate-context` (schema v3), com `independent=false` e `same_conversation=false`. Ele atesta criptograficamente um parecer revisado em um contexto separado, **não** uma auditoria humana independente de terceiro. O check se chama `Verify solo audit attestation (exact SHA)`; ele não substitui `Verify independent audit (exact SHA)`, aprovação humana ou o `Delivery V2 gate`.

A implementação M1 é optativa, não modifica rulesets, contagem de aprovações ou required checks. Check Runs do GitHub pertencem ao commit e não exclusivamente à PR: não tornar este check obrigatório sem a prova M2 de isolamento entre PRs, read-back das proteções e casos adversariais de HEAD compartilhado.

## Fonte confiável

- Catálogo normativo: [crgasparoto-br/skill](https://github.com/crgasparoto-br/skill/tree/develop). Os módulos oficiais foram integrados ao SolverFin pela PR #766 e têm identidade autenticada contra a base protegida; a execução não baixa nem executa código da PR candidata.
- Workflow: `.github/workflows/solo-audit-attestation.yml` em base protegida e na branch default `main`.
- Controlador canônico: `scripts/verify_solo_audit_attestation.py` e módulos `scripts/solo_audit_*.py`, conforme o inventário `TRUSTED_PATHS` em `scripts/solo_audit_source.py`. A execução compara todos os bytes com a base imutável da PR e usa `github.workflow_sha`, nunca o HEAD candidato. Não manter adaptador ou workflow concorrente.
- Assinatura, schema v3, registro público de chaves, comentário único/imutável, identidade PR/issue, hash do corpo da issue, HEAD/base/preview, permissão do autor e resolução de eventos são validados pelo código oficial fixado da Skill.
- O adaptador do SolverFin exige os jobs autenticados `Repository CI / Delivery V2 gate`, `Repository CI / Repository CI gate` e, para a base `develop`, `Delivery audit workspace / export`. Cada job precisa estar associado ao workflow esperado, Check Suite, Check Run, PR, base e HEAD exatos; conferir `head_repository` e `job.head_sha`. A definição de cada workflow deve corresponder à base protegida: uma definição alterada pela PR falha fechada. O job `export` é transporte de evidências, **não** certificado semântico.
- Antes de publicar sucesso, relê comentários, permissão, configuração de chave, check exato, issue/PR, preview, HEAD único e identidade da fonte protegida.

## Bootstrap único

1. A PR #766 já integrou o código na `develop` protegida. Falta publicá-lo na default `main` protegida, com aviso prévio e sem flexibilizar as proteções. Enquanto os bytes confiáveis não estiverem instalados e autenticados em ambas, **não há atestação válida**.
2. Conferir proteção das bases e testar ausência de comentário, alteração/exclusão do comentário, assinatura errada, base/HEAD divergente, usuário não autorizado e duas PRs no mesmo HEAD.
3. Em sua **máquina local segura** (não no repositório, em Actions ou na conversa de implementação), obter a Skill no commit fixado e gerar chaves com senha local obtida por canal seguro:

   ```bash
   python auditar-issue/scripts/generate_auditor_keypair.py \
     --private-out /local-seguro/auditor-private.pem \
     --public-out /local-publico/auditor-public.pem \
     --password-env AUDITOR_KEY_PASSWORD
   ```

   O ambiente `AUDITOR_KEY_PASSWORD` deve estar definido sem imprimir senha em shell, log ou histórico. **Nunca compartilhe a chave privada com ChatGPT nem a versione.**

4. Preparar o registro público — somente ele deve ser publicado como variável de Actions:

   ```bash
   python auditar-issue/scripts/build_trusted_auditor_entry.py \
     --public-key /local-publico/auditor-public.pem \
     --key-id solverfin-solo-2026 \
     --name "Operador SolverFin" \
     --repository crgasparoto-br/SolverFin \
     --registry \
     --out /local-seguro/trusted-auditors.json
   ```

5. Em **SolverFin → Settings → Secrets and variables → Actions → Variables**, estabelecer fora da branch candidata:

   | Variável                          | Valor                                                                                          |
   | --------------------------------- | ---------------------------------------------------------------------------------------------- |
   | `SOLVERIT_SOLO_AUDIT_OPERATOR_ID` | ID numérico real da conta GitHub autorizada                                                    |
   | `SOLVERIT_SOLO_AUDIT_KEY_ID`      | `solverfin-solo-2026` (ou o identificador escolhido)                                           |
   | `SOLVERIT_TRUSTED_AUDITORS_JSON`  | JSON público integral do registro, com escopo literal `crgasparoto-br/SolverFin`; sem wildcard |
   | `SOLVERIT_SOLO_AUDIT_ENABLED`     | Literal `true` **somente após** o bootstrap validado                                           |

Sem opt-in, o job não executa e não emite aprovação. Alterar variáveis **não** dispara uma nova execução de Actions.

## Importar uma auditoria (exemplo: issue #692 / PR #761)

1. Confirmar a issue canônica na descrição da PR, o SHA atual da base, do HEAD e do merge preview, e o `Delivery V2 gate` concluído com sucesso para o alvo exato. Um novo commit ou alteração de base exige nova validação.
2. Abrir uma **conversa ou execução de auditoria realmente separada** da implementação, usando identificadores reais fornecidos pela plataforma. Revisar o pacote neutro (fontes, diff, testes, evidências brutas; não aceitar narrativas/conclusões do implementador como prova).
3. Usar a Skill oficial `auditar-issue/scripts/init_external_audit_report.py` com `--assurance-mode single-operator-separate-context`, `--pull-request`, `--operator-github-id`, `--issue-body-sha256`, `--issue`, `--base-ref`, SHA exatos, `--orchestration-cycle`, contexto real de implementação e auditoria, prova/issuer e origem verificável.
4. Completar evidências reais, os três campos `*_after`, `verdict=approved` e arrays `findings=[]`, `recommendations=[]`, `limitations=[]`. **Não assinar aprovação com achados ou limitações.**
5. Assinar e validar **localmente**:

   ```bash
   python auditar-issue/scripts/sign_external_audit_report.py \
     external-audit.json \
     --private-key /local-seguro/auditor-private.pem \
     --key-id solverfin-solo-2026 \
     --password-env AUDITOR_KEY_PASSWORD

   python auditar-issue/scripts/validate_external_audit_report.py \
     external-audit.json \
     --trusted-auditors /local-seguro/trusted-auditors.json \
     --exact-repository-only
   ```

6. Publicar **um único comentário** na PR cujo corpo inteiro seja:

   ```text
   SOLVERIT_EXTERNAL_AUDIT_JSON:
   { ... JSON v3 completo e assinado ... }
   ```

   Não usar cercas Markdown no comentário real, nem acrescentar título ou narrativa. Limites de 48 KiB no comentário e 32 KiB no registro público. A própria PR deve continuar aberta e fora do estado draft.

7. Verificar a nova execução de Actions e o check `Verify solo audit attestation (exact SHA)`. A conclusão positiva **não libera merge/release por si só**.

## Revogação e segurança operacional

- Para revogar: **com o opt-in ainda ligado**, excluir o comentário ativo e observar o check de falha para o SHA; só então desabilitar o opt-in ou retirar a chave. Mudar variáveis silenciosamente não anula check anteriormente verde.
- Comentário editado é inválido; produzir nova assinatura e novo comentário. Uma única atestação ativa por PR; sem marcador, chave, prova ou autoridade, recusar.
- Rejeitar PRs abertas compartilhando o HEAD: status do GitHub é commit-scoped. Um check aprovado nunca deve ser reaproveitado como prova de revisão humana independente.
- Não adicionar esta modalidade aos required checks antes da fase M2, com workflow confiável por PR, leitura verificada da proteção de `develop` e `main` e cenários adversariais.

## Testes

```bash
python -m unittest discover -s tests -p 'test_solverfin_solo_audit_bootstrap.py' -v
```

Referências normativas: `auditar-issue/references/external-audit-contract.md` e `docs/WEB_INDEPENDENT_AUDIT.md` no repositório `skill`.

## Conciliação das PRs #765 e #766

A PR #766 incorporou o workflow e o controlador canônicos de atestação. A PR #765 **não** instala outro controlador: mantém este runbook e migra os ataques adicionais de proveniência para `tests/test_solverfin_solo_audit_bootstrap.py`, junto à validação do job na implementação canônica. Os arquivos experimentais `scripts/audit/verify_solo_attestation.py` e `scripts/audit/test_verify_solo_attestation.py` não permanecem no resultado integrado, evitando dois validadores e dois caminhos de aprovação.

Uma CI verde demonstra apenas testes do candidato. Ativação, assinatura com chave do operador, read-back da proteção das branches, origem confiável na `main`, tratamento de PRs com HEAD compartilhado e aprovação externa real continuam exigindo evidências próprias, sem alteração automática de rulesets.
