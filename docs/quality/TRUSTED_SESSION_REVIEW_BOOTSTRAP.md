# Etapa A — bootstrap de produtores de evidência da revisão por sessão

**Alvo:** `crgasparoto-br/SolverFin`, branch `develop`, issue #762 e PR candidata #763.

Esta etapa instala **apenas código de leitura e validação** antes de instalar os workflows que o executam sob uma base protegida. Nenhum workflow, required check, configuração de secrets, ruleset ou política de aprovação é ativado por esta PR. A inclusão dos arquivos na branch protegida exige revisão regular e autorização de integração; código nesta PR ainda é candidato, não fonte confiável.

Os módulos de coleta e prova foram inicialmente copiados da PR #763. Após as auditorias da PR #770, `session_review_packet_handoff.py` passou a exigir os cinco artefatos obrigatórios do perfil `critical` e apenas os especializados aplicáveis. Em remediações anteriores, `audit_remediation` e `audit_source_result` são obrigatórios; `audit_escape_closure` e `learning_closure` são obrigatórios somente para `systemic-remediation` ou `mixed-remediation`, conforme a Skill oficial. `evidence-provenance.json` continua condicional. Todos os itens declarados seguem sujeitos a hash, formato, caminho e vínculo de identidade. O parser de evidências JUnit valida a hierarquia `testsuites`/`testsuite`/`testcase`, rejeita falhas ocultas em metadados ou wrappers e impede contagem de casos fora do contêiner correto (A-006); testes adversariais exercitam parser, produtor e consumidor ZIP. A Etapa B deve sincronizar essa correção com a PR #763 e comprovar novamente a identidade dos blobs antes de instalar executores em fontes protegidas. A-008 corrige o bypass de DTD/entidades XML em JUnit UTF-16: a rejeicao agora ocorre na declaracao DTD do parser XML, independentemente da codificacao de bytes, sem bloquear XML legitimo UTF-16 e entidades predefinidas. Controles negativos exercitam parser, produtor e consumidor ZIP para DTD interna, externa e elementos declarados, e positivos preservam UTF-8/UTF-16 sem DTD. A-007 exige que `disabled` seja zero ou ausente e que atributos `status` declarados em suites ou casos indiquem execução bem-sucedida; falhas, ignorados, valores desconhecidos e contradições são rejeitados nos três consumidores. A instalação da Etapa A permite que uma Etapa B posterior introduza ou habilite os workflows sem depender do próprio código candidato para executar sua certificação. Até que as duas etapas sejam integradas e os mesmos bytes confiáveis estejam em `develop` **e** `main`, os gates `Verify certified handoff provenance` e `Session review evidence (exact SHA)` devem **falhar fechados**. Esta PR não busca alterar esse comportamento.

Arquivos instalados:

- `scripts/session_review_certificate.py` — certificado com validador oficial pinado.
- `scripts/session_review_evidence.py` — prova JUnit/autenticação CI do mesmo PR/base/HEAD.
- `scripts/prepare_session_review_packet.py`, `scripts/session_review_packet_handoff.py`, `scripts/session_review_specification.py` — coletores e verificação de artefatos imutáveis.
- `tests/test_session_review_packet.py`, `tests/test_session_review_trusted_producers.py` — testes positivos e negativos de certificados, artefatos e revogação de evidências. Testes que examinam YAML dos workflows continuam na PR #763, onde esses YAMLs existem.

**Após aprovação e merge autorizado desta etapa**: revisar compatibilidade de bytes de `scripts/session_review.py` com a versão já presente na `develop`; preparar bootstrap B dos workflows, instalar fontes idênticas em `main`, recertificar o handoff `critical` da PR #763 para a nova base e executar ensaios reais. Não ativar `mode=enabled`, alterar rulesets ou declarar aprovação independente antes disso.

Comandos locais (sem GitHub token):

```sh
python -m pytest -q tests/test_session_review_packet.py tests/test_session_review_trusted_producers.py
python -m compileall -q scripts/session_review_certificate.py scripts/session_review_evidence.py scripts/session_review_packet_handoff.py scripts/prepare_session_review_packet.py scripts/session_review_specification.py
```
