# ADR 0008 - Recuperacao de envio ambiguo de parcelamento manual

- Status: Aceito
- Data: 2026-07-31
- Issue: #553

## Contexto

A criacao manual de parcelas usa uma chave de idempotencia duravel. Uma falha de rede, timeout ou resposta 5xx pode acontecer depois do commit no backend e antes de o navegador receber a confirmacao. Nesse estado, editar o formulario e gerar outra chave pode transformar uma correcao aparente em uma segunda operacao financeira.

## Decisao

Quando `POST /api/installments` termina com falha de transporte, `408`, `425`, `429` ou `5xx`, o navegador trata o resultado como ambiguo:

- preserva a URL, o corpo e a chave da requisicao original;
- aplica o bloqueio do formulario antes de oferecer a confirmacao novamente;
- bloqueia alteracoes nos campos do formulario;
- mantem somente a acao de confirmar novamente disponivel;
- mantem a mensagem de recuperacao autoritativa no live region enquanto a tentativa estiver ambigua;
- classifica a resposta tanto no fluxo do formulario quanto no guard da fronteira de transporte;
- no retry, reenvia exatamente a requisicao preservada, mesmo que o DOM seja alterado por script;
- encerra o estado de recuperacao apenas com resposta definitiva ou fechamento do modal.

Uma resposta `4xx` definitiva fora da lista acima libera o formulario. Nesse caso, uma correcao material inicia uma nova tentativa logica com nova chave.

Fechar o modal cancela apenas a tentativa local. Isso nao desfaz um conjunto que possa ter sido confirmado pelo backend; a idempotencia persistida continua sendo a fonte de recuperacao.

## Evidencia obrigatoria

O teste de navegador deve confirmar a mesma requisicao diretamente no backend, responder `504` apenas para a requisicao original pausada no navegador, executar o retry e comprovar:

- o backend confirmou a primeira tentativa com `201` antes de o navegador observar o `504`;
- mesma URL, payload e chave no retry;
- campos bloqueados durante a ambiguidade;
- um unico conjunto persistido;
- nenhum efeito do payload adulterado entre as duas requisicoes.

## Consequencias

- Evita duplicidade financeira causada por edicao depois de resposta inconclusiva.
- O usuario precisa confirmar a tentativa pendente ou fechar o modal antes de informar outros dados.
- O comportamento fica centralizado no guard do Extrato, que intercepta a fronteira real de transporte.
