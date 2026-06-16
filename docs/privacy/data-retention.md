# Politica tecnica inicial de retencao, exportacao e exclusao

Esta politica orienta a implementacao tecnica do SolverFin no MVP. Ela nao substitui validacao juridica/LGPD, termos finais ou politica publica de privacidade.

## Conceitos

- **Soft delete:** o registro deixa de aparecer em consultas padrao, mas permanece para auditoria autorizada.
- **Hard delete:** remocao definitiva do registro. No MVP deve ser restrito a rotinas explicitamente aprovadas.
- **Anonimizacao:** remocao irreversivel de vinculo com pessoa/tenant quando a retencao estatistica ainda for necessaria.
- **Expurgo:** execucao periodica de exclusao/anonimizacao conforme politica aprovada.

## Categorias de dados

| Categoria | Finalidade | Retencao proposta | Exportavel | Exclusao/anonimizacao | Observacoes |
| --- | --- | --- | --- | --- | --- |
| Usuario | Login, suporte e titularidade | Enquanto conta ativa; apos encerramento conforme validacao juridica | Sim | Anonimizar identificadores pessoais quando permitido | Email pode ser retido em auditoria minimizada |
| Organizacao/tenant | Separacao de dados e permissao | Enquanto houver conta/contrato ativo | Sim | Soft delete inicial, hard delete sob processo aprovado | Deve preservar isolamento de tenant |
| Perfil financeiro | Separar pessoal, familia, MEI ou negocio | Enquanto perfil ativo; soft delete no encerramento | Sim | Soft delete; hard delete depende de retencao fiscal/auditoria | Pode conter nome livre digitado pelo usuario |
| Lancamentos | Controle financeiro e relatorios | Enquanto usuario mantiver perfil; soft delete no MVP | Sim | Soft delete padrao; anonimizar em expurgo futuro | Consultas padrao devem ignorar excluidos |
| Contas/cartoes | Organizacao de lancamentos e conciliacao | Enquanto referenciados por lancamentos | Sim, mascarados quando aplicavel | Soft delete/arquivamento; hard delete apenas sem vinculos ou por rotina aprovada | Identificadores completos nao devem aparecer em logs/UI |
| Categorias | Organizacao financeira | Enquanto houver historico associado | Sim | Soft delete/arquivamento | Pode ser recriada sem expor dados sensiveis |
| Anexos | Comprovantes e suporte a revisao | Curto prazo configuravel; depende de custo e LGPD | Sim quando solicitado e autorizado | Redacao, soft delete e expurgo futuro | OCR completo fica fora do MVP atual |
| Importacoes | Rastrear origem e deduplicacao | Manter metadados; reduzir payload bruto | Sim, com metadados e arquivos quando permitido | Descartar bruto apos processamento quando possivel | Arquivos brutos exigem cuidado especial |
| Mensagens brutas | Extracao de sugestoes | Minimizar; reter somente quando necessario para revisao | Exportavel apenas quando ainda retida e autorizada | Preferir mascaramento/redacao apos revisao | Nao logar mensagem bruta |
| Logs aplicacionais | Diagnostico e seguranca | Prazo curto operacional a definir | Nao como dado primario; pode entrar em relatorio tecnico | Expurgo periodico; mascaramento obrigatorio | Nunca registrar conta/cartao/mensagem bruta completos |
| Auditoria | Rastreabilidade e seguranca | Retencao maior conforme validacao juridica | Parcial, com metadados | Preservar metadados minimizados; anonimizar quando permitido | Deve evitar dados financeiros completos |
| Backups | Recuperacao de desastre | Janela definida por operacao/infra | Nao diretamente; restauracao controlada | Expiram por rotacao; exclusao individual nao e imediata | Comunicar atraso tecnico de exclusao em backups |

## Requisitos tecnicos assumidos

- Consultas padrao devem ignorar registros com `deletedAt`.
- Auditoria deve registrar entidade, tenant, ator, data/hora, acao e motivo mascarado quando houver.
- Dados sensiveis em erros, logs e previews devem passar por mascaramento centralizado.
- Consentimentos devem registrar finalidade, status, usuario, tenant, versao dos termos quando disponivel, origem e data/hora.
- Fluxos de IA, mensagens bancarias e integracoes devem consultar consentimento antes de processar dados sensiveis.

## Backlog tecnico minimo

1. Persistir consentimentos em tabela propria com indice por tenant, usuario, finalidade e `updatedAt`.
2. Adicionar campos `deletedAt`, `deletedByUserId` e `deletionReason` nas entidades financeiras cobertas.
3. Garantir filtros padrao de `deletedAt IS NULL` nas consultas de lancamentos, contas, cartoes, categorias, anexos e importacoes.
4. Criar endpoint de exportacao por tenant/perfil com pacote estruturado e mascaramento quando necessario.
5. Criar rotina de redacao/expurgo de mensagens brutas apos revisao.
6. Definir politica operacional de backups e prazo de rotacao.
7. Criar ADR antes de qualquer hard delete automatico em producao.

## Decisoes de produto pendentes

- Quais prazos de retencao aparecem para o usuario no MVP.
- Se exportacao inclui anexos e mensagens brutas ou apenas dados estruturados.
- Se restauracao de itens excluidos logicamente entra no MVP ou em versao posterior.
- Como exibir pedido de exclusao quando ha dados compartilhados em organizacao multiusuario.

## Perguntas juridicas abertas

- Prazo minimo para reter auditoria de operacoes financeiras.
- Tratamento de dados fiscais/contabeis de MEI e pequenos negocios.
- Prazo maximo para expurgo de backups apos pedido de exclusao.
- Base legal para cada finalidade: consentimento, execucao de contrato, obrigacao legal ou interesse legitimo.

## Riscos e mitigacoes

- **Risco:** mensagem bancaria bruta ser retida por tempo excessivo. **Mitigacao:** redacao/expurgo apos revisao.
- **Risco:** hard delete remover historico necessario para auditoria. **Mitigacao:** soft delete padrao e ADR para expurgo.
- **Risco:** logs conterem dados sensiveis. **Mitigacao:** mascaramento central e testes com payloads ficticios.
- **Risco:** backup manter dado apos exclusao logica. **Mitigacao:** documentar janela de rotacao e impedir acesso operacional amplo.
