# Pacote GitHub - SolverFin

Este pacote contem o backlog inicial de issues/subissues e artefatos de documentacao para iniciar o SolverFin com implementacao orientada por IA.

## Arquivos
- `issues.md`: visao geral dos epicos e subissues.
- `issues.json`: manifest estruturado das issues.
- `issue-bodies/`: corpo completo de cada issue.
- `create-github-issues.sh`: script para criar labels, issues e comentarios de relacionamento no GitHub.
- `docs/ai/AGENTS.md.draft`: rascunho para virar `AGENTS.md` na raiz do repo.
- `docs/ai/copilot-instructions.md.draft`: rascunho para virar `.github/copilot-instructions.md`.
- `.github/ISSUE_TEMPLATE/ai_task.yml`: template de issue para tarefas de IA.
- `.github/pull_request_template.md`: template de PR.

## Como executar
```bash
unzip solverfin-github-package.zip
cd solverfin-github-package
chmod +x create-github-issues.sh
./create-github-issues.sh crgasparoto-br/SolverFin
```

O script cria issues e adiciona comentarios nos epicos com as issues filhas. Para transformar em sub-issues nativas do GitHub, abra cada epic e use **Create sub-issue > Add existing issue**.
