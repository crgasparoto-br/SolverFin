# Politica tecnica inicial de retencao, exportacao e exclusao

Esta politica orienta implementacoes do MVP do SolverFin. Ela nao substitui validacao juridica/LGPD, fiscal ou contabil. Decisoes incertas ficam separadas como perguntas abertas.

## Principios

- Coletar e manter apenas dados necessarios para a finalidade financeira autorizada.
- Separar usuario, organizacao e perfil financeiro em todos os dados persistentes.
- Preferir exclusao logica para dados financeiros auditaveis.
- Usar hard delete apenas em fluxos de expurgo documentados e autorizados.
- Mascarar identificadores financeiros em logs, erros, eventos e telas quando o valor completo nao for indispensavel.
- Exportar apenas dados do tenant/perfil financeiro autorizado.

## Categorias de dados

| Categoria         | Finalidade                              | Retencao proposta                                               | Exportavel                   | Exclusao/anonimizacao                                        | Observacoes                                                |
| ----------------- | --------------------------------------- | --------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| Usuario           | Identidade, sessao e titularidade       | Enquanto conta ativa e periodo operacional posterior            | Sim                          | Anonimizar dados pessoais apos encerramento quando permitido | Email e nome devem ser tratados como dados pessoais.       |
| Organizacao       | Agrupar perfis financeiros              | Enquanto existir conta/tenant                                   | Sim                          | Soft delete, depois expurgo planejado                        | Mantem relacao com auditoria.                              |
| Perfil financeiro | Separar pessoal, familia, MEI e negocio | Enquanto ativo ou auditavel                                     | Sim                          | Soft delete                                                  | Base de isolamento por contexto.                           |
| Contas            | Registrar saldos e movimentacoes        | Enquanto houver historico financeiro relevante                  | Sim                          | Soft delete                                                  | Identificadores devem ficar mascarados.                    |
| Cartoes           | Faturas, compras e conciliacao          | Enquanto houver faturas/lancamentos vinculados                  | Sim                          | Soft delete/bloqueio                                         | Nunca exibir numero completo.                              |
| Categorias        | Classificacao financeira                | Enquanto usadas por lancamentos                                 | Sim                          | Arquivar/substituir                                          | Evitar apagar historico classificado.                      |
| Lancamentos       | Historico financeiro                    | Conforme necessidade do usuario, auditoria e requisitos fiscais | Sim                          | Soft delete; hard delete apenas por expurgo autorizado       | Lancamento excluido nao aparece por padrao.                |
| Anexos            | Comprovantes e documentos de apoio      | Pelo menor periodo necessario                                   | Opcional                     | Redigir, remover storage e manter metadados minimos          | Anexos podem conter dados sensiveis de terceiros.          |
| Importacoes       | Rastrear origem e deduplicacao          | Metadados enquanto necessarios; payload bruto pelo menor prazo  | Parcial                      | Descartar payload bruto apos normalizacao quando possivel    | Hash pode permanecer para deduplicacao.                    |
| Mensagens brutas  | Extracao por regras/IA                  | Temporaria e minimizada                                         | Preferencialmente nao        | Descartar ou anonimizar apos gerar sugestao                  | Requer consentimento e mascaramento.                       |
| Sugestoes de IA   | Revisao e explicabilidade               | Enquanto pendentes; revisadas por prazo definido                | Sim, com dados minimizados   | Expirar/anonimizar detalhes sensiveis                        | Deve manter origem, confianca e decisao.                   |
| Logs              | Diagnostico e seguranca                 | Curto prazo operacional                                         | Nao, salvo relatorio tecnico | Rotacao e expurgo                                            | Nunca conter payload financeiro bruto.                     |
| Auditoria         | Rastreabilidade                         | Prazo maior que logs operacionais                               | Parcial                      | Preservar metadados, nao payload completo                    | Guardar quem, quando, entidade, acao e mudancas redigidas. |
| Backups           | Recuperacao operacional                 | Conforme politica de infraestrutura                             | Nao direto                   | Expurgo por ciclo de backup                                  | Exclusao pode persistir em backup ate rotacao.             |

## Exportacao de dados

A exportacao inicial para contador/MEI usa CSV, com periodo, data do lancamento, tipo, categoria, descricao, valor, moeda, contexto financeiro e status. Exportacoes completas futuras devem incluir anexos e mensagens brutas apenas se houver base legal, consentimento e produto confirmado.

Requisitos tecnicos assumidos:

- validar periodo inicial e final;
- filtrar por organizacao e perfil financeiro ativo;
- gerar arquivo valido mesmo sem linhas de dados;
- usar cabecalhos estaveis e documentados;
- nao registrar conteudo exportado em logs.

## Exclusao

- Soft delete: marca `deletedAt`, `deletedByUserId` e motivo opcional; consultas padrao ignoram o registro.
- Hard delete: remove definitivamente do banco/storage; deve ficar restrito a expurgo autorizado, ambiente de desenvolvimento ou rotinas futuras documentadas.
- Anonimizacao: remove ou generaliza dados pessoais/sensiveis preservando estatistica ou auditoria minima.
- Retencao obrigatoria: mantem metadados quando auditoria, suporte, seguranca, fiscal ou contabilidade exigirem.

## Logs e backups

Logs devem guardar correlation id, codigo de erro, rota e metadados seguros. Nao devem guardar numero completo de conta/cartao, documentos, mensagem bancaria bruta, tokens ou payload financeiro.

Backups seguem ciclo de infraestrutura. Uma exclusao logica pode continuar presente em backup ate a expiracao daquele backup; essa limitacao deve ser explicada ao usuario em politica final.

## Backlog tecnico

- Implementar campos persistentes de soft delete nas entidades financeiras cobertas.
- Criar filtros padrao de repositorio para ignorar `deletedAt`.
- Criar endpoint/tela de preferencias de privacidade com consentimentos por finalidade.
- Criar exportacao completa de dados do titular, separada da exportacao CSV contabil.
- Definir prazo de expiracao de mensagens bancarias brutas e sugestoes revisadas.
- Automatizar expurgo de anexos e payloads brutos apos normalizacao.
- Documentar rotina de backup/restore e impacto de exclusoes.

## Perguntas juridicas e de produto

- Quais prazos minimos de retencao se aplicam a MEI, contador e suporte?
- A exportacao do titular deve incluir anexos e mensagens brutas no MVP?
- Por quanto tempo sugestoes rejeitadas podem ser mantidas para aprendizado negativo?
- Quais dados de auditoria podem ser anonimizados sem perder rastreabilidade necessaria?
