# Politica inicial de privacidade, consentimento e retencao

## Objetivo

Esta politica define o contrato inicial de privacidade do SolverFin para fluxos de importacao, inbox de mensagens bancarias, deduplicacao, conciliacao, automacoes e IA financeira.

O principio base e: persistir o minimo necessario, explicar a origem das sugestoes, exigir revisao humana quando houver incerteza e nunca usar dados reais em exemplos, seeds, fixtures, screenshots ou documentacao.

## Conceitos

### Dado bruto

Dado bruto e o conteudo recebido antes da normalizacao, como:

- arquivo CSV ou OFX original;
- texto colado de mensagem bancaria;
- comprovante, anexo, print ou documento;
- resposta completa de provedor externo;
- token, assertion, chave, segredo ou credencial tecnica.

Dado bruto costuma conter informacao sensivel em excesso. Ele so pode ser persistido quando houver necessidade clara, consentimento compativel e prazo de retencao definido.

### Dado normalizado

Dado normalizado e o recorte minimo necessario para operar o produto, como:

- valor em centavos;
- data da movimentacao;
- tipo de movimentacao;
- descricao minimizada;
- conta, categoria, cartao ou perfil financeiro;
- hash tecnico de origem;
- status operacional.

Dado normalizado pode ser persistido enquanto for necessario para a funcionalidade financeira, auditoria e historico do usuario.

### Sugestao revisavel

Sugestao revisavel e uma recomendacao criada por regra, importacao, automacao ou IA antes de produzir efeito financeiro final.

Toda sugestao revisavel deve conter, quando aplicavel:

- origem do dado analisado;
- acao sugerida;
- explicacao em linguagem simples;
- nivel de confianca;
- estado de revisao;
- responsavel e data de revisao;
- vinculo ao tenant e perfil financeiro.

Sugestao revisavel nao substitui consentimento nem revisao humana quando o efeito for incerto, destrutivo ou financeiramente relevante.

## Classificacao de dados

### Dados proibidos em repositorio e logs

Nunca versionar, imprimir em logs ou colocar em fixtures:

- dados financeiros reais de cliente;
- numero completo de conta, agencia, cartao, documento ou chave Pix;
- token, senha, client secret, chave privada ou assertion;
- mensagem bancaria real sem anonimizacao;
- screenshot com dados reais;
- resposta bruta de provedor de IA, banco ou identidade que contenha dados sensiveis.

### Dados permitidos com minimizacao

Podem ser persistidos quando necessarios ao produto:

- identificadores internos UUID;
- valores financeiros normalizados em centavos;
- datas de vencimento, ocorrencia ou revisao;
- descricoes curtas e minimizadas;
- identificadores mascarados, como `final 1234 ficticio`;
- hash tecnico de origem para deduplicacao;
- trilha de auditoria redigida.

### Dados apenas ficticios em exemplos

Documentacao, seeds e testes devem usar apenas dados ficticios, anonimos e nao identificaveis. Emails devem preferir dominios reservados, como `example.invalid`.

## Consentimentos minimos

### Importacao CSV/OFX

Antes de processar importacoes, a interface ou API deve deixar claro que o usuario esta enviando dados financeiros para normalizacao e revisao.

Consentimento minimo exigido:

- autorizacao para processar o arquivo no perfil financeiro ativo;
- confirmacao de que o usuario tem direito de usar aquele dado;
- ciencia de que linhas validas viram sugestoes revisaveis, nao lancamentos finais automaticos quando houver incerteza.

### Inbox de mensagens bancarias

Antes de colar ou compartilhar uma mensagem bancaria, o usuario deve consentir explicitamente que o texto pode conter dados sensiveis.

Consentimento minimo exigido:

- autorizacao para processar a mensagem no perfil financeiro ativo;
- ciencia de que o texto bruto deve ser minimizado, mascarado ou descartado apos normalizacao;
- ciencia de que a sugestao gerada exige revisao antes de efeito financeiro final.

### IA financeira

Antes de enviar dados a qualquer provedor de IA, o sistema deve obter consentimento especifico para uso de IA ou usar uma configuracao previamente aprovada pelo usuario/organizacao.

Consentimento minimo exigido:

- finalidade do uso de IA;
- tipo de dado enviado, sempre minimizado;
- indicacao de que a IA sugere e explica, mas nao decide efeito financeiro irreversivel sozinha;
- capacidade de revisar, aprovar, editar ou rejeitar a sugestao.

## Retencao inicial

### Regra padrao

Dado bruto deve ser descartado assim que a normalizacao segura for concluida, salvo necessidade explicita de auditoria, suporte ou reprocessamento autorizado.

### Prazos maximos iniciais

- Conteudo bruto de CSV/OFX: nao persistir por padrao. Persistir apenas hash de lote, nome de arquivo minimizado e dados normalizados.
- Texto bruto de mensagem bancaria: descartar apos normalizacao no mesmo fluxo. Se for indispensavel manter para revisao operacional, prazo maximo inicial de 24 horas.
- Anexos financeiros brutos: manter apenas quando houver funcionalidade explicita de anexo; marcar status, origem e prazo de revisao. Sem contrato especifico, nao persistir.
- Resposta bruta de IA: nao persistir por padrao. Persistir apenas saida estruturada, explicacao e metadados seguros da sugestao.
- Tokens, assertions e secrets: nunca persistir em formato bruto. Quando sessoes produtivas existirem, persistir apenas hash ou referencia opaca conforme ADR de autenticacao.
- Auditoria redigida: pode ser mantida enquanto o historico financeiro precisar de rastreabilidade, sem conter dado bruto sensivel.

Qualquer excecao a esses prazos deve ser documentada em issue, ADR ou politica complementar antes da implementacao.

## Contrato aplicado ao fluxo CSV revisavel

O fluxo implementado de CSV aplica esta politica da seguinte forma:

- o navegador le o arquivo apenas para enviar a requisicao de preview ou criacao; o conteudo nao e salvo em armazenamento local;
- `POST /api/import-batches/csv/preview` valida e devolve somente cabecalhos, contadores, problemas e uma amostra normalizada, sem gravar lote, sugestao ou arquivo;
- `POST /api/import-batches/csv` exige conta ativa do perfil e consentimento explicito antes de persistir;
- o banco mantem somente metadados minimizados do lote, problemas seguros e payloads financeiros estruturados por linha;
- nome do arquivo, hash contextual, delimitador, mapeamento, conta padrao e contadores podem permanecer para historico e auditoria;
- conteudo bruto, linha original e amostra do preview nao sao persistidos em lote, sugestao, auditoria ou log;
- descartar um lote e uma transicao logica para `discarded`, preservando a trilha normalizada sem manter o arquivo original;
- lotes finalizados e suas decisoes normalizadas seguem a retencao do historico financeiro e da auditoria redigida.

O consentimento deve abranger autorizacao para processar o arquivo no perfil ativo, direito de uso dos dados e ciencia de que as linhas validas serao revisadas antes do efeito financeiro.

## Descarte apos normalizacao

Apos normalizar um dado bruto, o sistema deve descartar:

- linhas completas de arquivo original quando ja houver sugestao estruturada;
- texto integral de mensagem bancaria quando ja houver campos normalizados e resumo mascarado;
- metadados excessivos de arquivo ou dispositivo;
- resposta bruta de IA;
- valores completos de identificadores financeiros quando a exibicao mascarada for suficiente.

O sistema pode manter:

- hash deterministico de origem;
- identificador interno do lote;
- resumo mascarado;
- campos financeiros normalizados;
- status de revisao;
- explicacao da regra ou IA;
- auditoria redigida.

## Mascaramento

### Telas

Telas devem mostrar o minimo suficiente para o usuario reconhecer o item.

Exemplos permitidos:

- `Conta final 1234`;
- `Cartao final 4242 ficticio`;
- `Mensagem bancaria mascarada`;
- descricoes reduzidas que nao exponham documento, chave, token ou conta completa.

Quando o valor completo for indispensavel para uma acao, a tela deve deixar claro o motivo e evitar exibir esse dado fora do contexto da decisao.

### Logs

Logs nunca devem conter dado bruto financeiro, mensagem bancaria completa, token, senha, secret, numero completo de conta/cartao ou payload de IA com dados sensiveis.

Logs podem conter:

- `correlationId`;
- codigo de erro;
- rota ou modulo;
- status HTTP;
- identificador interno quando necessario e seguro;
- marcadores redigidos, como `changed`, `added` ou `removed`.

### Auditoria

Auditoria deve registrar que algo mudou sem copiar dados sensiveis desnecessarios.

Use `redactedChanges` para indicar campos alterados, por exemplo:

```json
{
  "amountMinor": "changed",
  "categoryId": "added"
}
```

O motivo da auditoria deve ser claro, mas nao deve incluir mensagem bancaria bruta, segredo, token ou numero completo de identificador financeiro.

### Seeds, fixtures e exemplos

Seeds, fixtures, testes e documentacao devem conter apenas dados ficticios e minimizados. Exemplos devem usar nomes como `Demo`, `Ficticio`, `Teste` e dominios reservados.

## Origem, rastreabilidade e revisao

Fluxos de importacao, conciliacao, automacao e IA devem registrar:

- origem do dado ou lote;
- perfil financeiro ativo;
- hash ou identificador tecnico quando necessario;
- regra, modelo ou provedor que gerou a sugestao;
- explicacao da sugestao;
- status de revisao;
- usuario e data de aprovacao, edicao ou rejeicao.

Quando houver incerteza, o efeito financeiro final deve aguardar revisao humana.

## Regras para IA

IA deve receber apenas dados minimizados e relevantes para a finalidade declarada.

Nao enviar para IA sem necessidade clara:

- mensagem bancaria integral;
- token, senha, secret ou assertion;
- identificador financeiro completo;
- dados de outro perfil financeiro;
- historico amplo quando um recorte menor resolve o caso.

A saida de IA deve ser estruturada, validada e tratada como sugestao revisavel. A explicacao deve permitir ao usuario entender por que a sugestao foi criada.

## Regras para importacao e conciliacao

Importacao deve priorizar normalizacao e revisao:

- CSV/OFX bruto nao deve ser mantido por padrao;
- linhas validas viram sugestoes revisaveis;
- duplicidades devem ser explicadas por criterios deterministas sempre que possivel;
- conciliacao incerta deve exigir aprovacao antes de alterar lancamento final;
- buscas e comparacoes devem respeitar `organizationId` e `financialProfileId`.

## Erros e suporte

Mensagens de erro devem ajudar o usuario a corrigir o problema sem expor valores internos.

Exemplo adequado:

```text
Nao foi possivel processar este arquivo. Verifique o formato e tente novamente.
```

Evite mensagens que revelem conteudo bruto, token, SQL, stack trace, payload completo ou dados de outro perfil.

## Fora do escopo desta politica inicial

Esta politica nao implementa:

- painel completo de privacidade;
- exportacao LGPD completa;
- exclusao definitiva automatizada;
- retencao legal detalhada por pais ou setor;
- gerenciador externo de secrets;
- politica contratual final para provedores de IA.

Esses pontos devem ser tratados por issues e ADRs especificas antes de uso produtivo amplo.
