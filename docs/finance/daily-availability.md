# Disponibilidade financeira diaria

A disponibilidade financeira diaria responde `quanto posso gastar hoje?` usando uma fonte unica de calculo no dominio. A resposta deve ser consumida por dashboard, fluxos de revisao e assistente financeiro, sem estimar valores fora do resultado estruturado.

## Fonte de calculo

O calculo recebe explicitamente:

- saldo atual consolidado do perfil financeiro;
- lancamentos planejados ou postados dentro do horizonte;
- contas a pagar e a receber pendentes;
- faturas e parcelas de cartao ainda nao pagas ou canceladas;
- recorrencias cadastradas pelo usuario;
- recorrencias estatisticamente inferidas, quando habilitadas;
- premissas financeiras ativas para o tenant/perfil.

O retorno inclui `availableTodayMinor`, `projectedBalanceMinor`, moeda, periodo considerado, componentes, premissas aplicadas, ids das premissas, confianca, limitacoes e data de calculo.

## Premissas configuraveis

As premissas ficam escopadas por organizacao e perfil financeiro. Elas tambem podem ter escopo especifico por categoria, conta, cartao, recorrencia inferida ou calculo.

Premissas iniciais suportadas:

- `horizon_days`: horizonte do calculo, com padrao de 30 dias;
- `reserve_amount`: reserva minima que reduz o disponivel;
- `safety_margin_percent`: margem aplicada sobre saidas futuras, com padrao de 10%;
- `ignored_category`: categoria ignorada no calculo;
- `include_inferred_recurrences`: liga ou desliga recorrencias inferidas.

Cada premissa registra origem, status, vigencia, versao e motivo. Premissas inativas ou arquivadas nao entram no calculo.

## Recorrencias estatisticas

A deteccao estatistica agrupa despesas por descricao normalizada, categoria, conta e cartao. Um gasto vira candidato quando ha historico suficiente, periodicidade estavel e variacao de valor aceitavel.

Cada sugestao informa:

- origem `inferred`;
- frequencia semanal, mensal ou anual;
- valor medio, variancia, quantidade de ocorrencias e ultima ocorrencia;
- proxima data esperada;
- confianca e explicacao em linguagem simples;
- ids das transacoes usadas como evidencia.

O usuario pode aceitar, ignorar, ajustar ou desativar uma recorrencia inferida. Recorrencias ja cadastradas nao sao duplicadas.

## Regras de disponibilidade

O calculo soma o saldo atual, adiciona entradas futuras e subtrai saidas futuras dentro do horizonte. Depois aplica reserva minima e margem de seguranca.

Para evitar duplicidade:

- transacoes vinculadas a faturas ou parcelas nao sao recontadas quando a fatura/parcela ja entra no calculo;
- recorrencias cadastradas sao separadas das inferidas;
- itens ignorados por premissa aparecem no detalhamento como `ignored`, mas nao alteram o valor final.

Se faltar historico ou houver componentes de baixa confianca, o resultado volta com confianca `low` ou `medium` e limitacoes explicitas. O assistente nao deve inventar valor quando o servico de disponibilidade nao estiver disponivel.

## Experiencia

O dashboard deve exibir um cartao com valor, confianca, periodo considerado e acoes para abrir detalhes, editar premissas e revisar recorrencias sugeridas. O detalhe separa dados conhecidos, recorrencias inferidas e itens ignorados.

Estados obrigatorios:

- carregando: informar que saldo, compromissos e premissas estao sendo atualizados;
- vazio: orientar o cadastro de saldo, compromissos ou premissas;
- erro: oferecer nova tentativa;
- baixa confianca: pedir revisao das premissas e limitacoes antes da decisao.

O assistente financeiro deve responder perguntas de disponibilidade apenas com o resultado estruturado do calculo e deve citar componentes, premissas e limitacoes relevantes.
