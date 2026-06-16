# Categorizacao inteligente e aprendizado por correcao

A categorizacao inteligente combina aprendizado por correcao, regras de merchant, historico do contexto financeiro e sugestoes de IA ja validadas pelo fluxo de uso seguro.

O dominio nao chama provider diretamente. A IA pode produzir uma sugestao externa, mas o dominio valida se a categoria esta ativa, pertence ao tenant/contexto e e compativel com o tipo de lancamento.

## Ordem de sugestao

1. Aprendizado ativo criado por correcao anterior do usuario.
2. Regra explicita de merchant.
3. Historico de lancamentos semelhantes no mesmo contexto financeiro.
4. Sugestao de IA, quando informada e com confianca suficiente.
5. Revisao manual quando nenhuma origem e confiavel.

## Aprendizado por correcao

Quando o usuario corrige uma categoria, `recordCategoryCorrection` cria ou atualiza uma entrada por:

- organizacao;
- perfil financeiro;
- merchant normalizado;
- tipo do lancamento;
- categoria corrigida.

As proximas sugestoes com merchant semelhante priorizam esse aprendizado. A entrada guarda `confidence`, `correctionCount`, `lastCorrectedAt` e motivo de origem para auditoria.

## Conflitos

Se existirem correcoes ativas conflitantes para o mesmo merchant e tipo, a sugestao usa a entrada com maior `correctionCount`; em empate, usa a mais recente. A confianca e reduzida para sinalizar revisao mais cuidadosa.

## Reversao e ignorar aprendizado

`ignoreCategoryLearning` desativa uma entrada sem apaga-la. `revertCategoryLearning` marca a entrada como revertida. Entradas ignoradas ou revertidas nao entram em novas sugestoes.

## Privacidade e tenant

O aprendizado nunca cruza organizacao ou perfil financeiro. Testes cobrem isolamento entre contextos pessoal e MEI usando merchants e lancamentos ficticios.

## Categorias arquivadas

Categorias arquivadas nao sao sugeridas, mesmo que uma entrada antiga de aprendizado ainda referencie a categoria.
