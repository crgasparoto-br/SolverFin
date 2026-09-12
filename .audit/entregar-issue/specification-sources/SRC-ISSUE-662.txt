<!-- specification_version: 2 -->
<!-- invalidates_previous_snapshot: true -->
<!-- reviewed_at: 2026-09-10 -->

## Objetivo

Corrigir ponta a ponta o fluxo de **compra parcelada** em `/cartoes` para que:

- o valor informado não seja interpretado/multiplicado de forma surpreendente;
- cada parcela tenha vínculo canônico e consultável com a compra e com a fatura em que é cobrada;
- a fatura exiba e agregue somente o valor da parcela daquele período;
- **Editar compra** preserve o contexto do parcelamento sem permitir mutação financeira parcial ou insegura.

A correção deve manter a compra como fato econômico único e as parcelas como cronograma da cobrança, sem criar linha técnica duplicada na UI.

## Evidência observada

Em 10/09/2026, uma compra criada como parcelada foi reaberta em **Editar compra** e o modal exibiu somente valor, moeda, data, descrição, instrumento e categoria. O contexto de parcelas desapareceu e o valor lançado na fatura correspondeu ao valor integral informado pelo usuário, em vez da fração esperada.

## Fontes canônicas e contratos relacionados

- `docs/CARDS.md` — comportamento de cartões, faturas, compra operacional e parcelas na UI.
- `docs/API_CREDIT_CARDS_INVOICES.md` — registro de compra, divisão do valor e composição das faturas.
- `docs/API_INSTALLMENTS.md` — consulta e metadados canônicos de `Installment`.
- #539 — indicador `Parcela X de Y` na própria linha da compra, sem painel paralelo.
- #553 — semântica canônica `per_installment` x `total` para parcelamentos manuais.
- #610 — arquétipo A3 atual de `/cartoes`.

## Lacunas confirmadas na revisão

### 1. A criação favorece uma interpretação perigosa do campo Valor

Em `apps/web/src/dev-server/cards-page-v2.ts`, `installmentValueMode` apresenta primeiro `per_installment`. Nesse modo, o frontend multiplica o valor digitado pelo número de parcelas antes de enviar a compra.

Assim, se o usuário informar **R$ 437,57** pensando no valor total de uma compra em 3 parcelas e não alterar o modo, o frontend transforma o total canônico em **R$ 1.312,71**; a primeira fatura recebe R$ 437,57. Esse comportamento reproduz o sintoma observado.

### 2. O vínculo de parcelas de compra manual não está persistido de forma utilizável

O domínio declara `Installment.transactionId?` em `packages/domain/src/index.ts`, e `buildPurchaseInstallments()` preenche esse `transactionId` com a compra de origem.

Entretanto, o modelo persistido atual em `prisma/schema.prisma` não possui `Installment.transactionId`, e `registerCardPurchaseForContext()` insere as `Installment` sem esse vínculo. A `Transaction` da compra também não recebe `installmentId`, pois uma compra parcelada possui várias parcelas.

Portanto, a exigência antiga de simplesmente chamar `GET /api/installments?invoiceId=...` não é suficiente para compras parceladas manuais: o repository atual filtra `invoiceId` através da `Transaction` ligada por `Transaction.installmentId`, vínculo que essas parcelas não possuem.

### 3. A V2 não carrega o cronograma de parcelas

`apps/web/src/dev-server/cards-page-v2.ts` carrega compras da fatura, mas não obtém o cronograma canônico da compra parcelada. A linha usa `purchase.amountMinor` diretamente e não possui `sequenceNumber`, `totalInstallments` ou `Installment.amountMinor` da ocorrência.

### 4. Há duas grandezas monetárias diferentes

No fluxo atual de domínio:

- `Transaction.amountMinor` da compra parcelada representa o **valor total da compra**;
- `Installment.amountMinor` representa o **valor da parcela**;
- `Invoice.totalAmountMinor` recebe apenas o `shareAmount` pertencente ao período.

Essas grandezas não podem ser intercambiadas na lista, subtotais, resumo ou edição.

### 5. O PATCH atual não é seguro para alterar o valor de uma compra parcelada

`updateCardPurchaseForContext()` calcula `amountDelta` a partir de `Transaction.amountMinor` e aplica o delta à fatura vinculada à compra. Para uma compra parcelada, isso pode aplicar o delta do **total da compra** somente à fatura atual e deixar o cronograma divergente.

## Decisões funcionais desta revisão

### A. Valor padrão na criação

Ao selecionar **Repetição = Parcelado** em uma nova compra:

1. **Valor total da compra** é a interpretação padrão.
2. A opção **Valor da parcela** continua disponível, mas somente quando escolhida explicitamente pelo usuário.
3. O texto do formulário deve deixar explícita a interpretação ativa antes do salvamento:
   - `Valor total da compra` → o valor será dividido pelo total de parcelas;
   - `Valor da parcela` → o valor informado será aplicado a cada parcela e o total da compra será calculado a partir dele.
4. O frontend envia ao backend um único valor total canônico em `amountMinor`, além de `totalInstallments` e `installmentStart`.
5. Para `installmentStart > 1`, o valor total continua representando o plano original completo; não deve ser reinterpretado como total apenas das parcelas restantes.
6. `installmentValueMode` é uma semântica de entrada da UI e **não precisa virar atributo financeiro persistido**. O modo histórico não deve ser inferido por divisão ou heurística.

### B. Vínculo canônico do cronograma

Para toda nova compra parcelada de cartão:

1. cada `Installment` deve ser resolvível de forma inequívoca para a **compra de origem**;
2. cada `Installment` deve ser resolvível para a **fatura/período em que seu valor compõe o total**;
3. esse vínculo deve ser durável no backend/persistência; a UI não pode reconstruí-lo por descrição, valor, data aproximada ou posição da lista;
4. preservar `GET /api/installments` como contrato canônico de consulta de parcelas e fazer `invoiceId` funcionar também para compras parceladas manuais;
5. o conceito já existente de `Installment.transactionId` no domínio deve ser reconciliado com schema/repository, ou substituído por relação persistida equivalente que preserve a mesma rastreabilidade; não manter um campo apenas em memória que desaparece na persistência;
6. a forma física da relação pode seguir o modelo existente, mas o contrato público precisa garantir que a consulta por `invoiceId` devolva a ocorrência correta e seu vínculo de compra sem N+1.

### C. Exibição em cada fatura

Para compra parcelada:

- a linha da fatura mostra `Parcela X de Y` a partir de `Installment.sequenceNumber` e `Installment.totalInstallments`;
- o valor principal da linha é `Installment.amountMinor` daquela ocorrência;
- o valor total da compra pode aparecer apenas como informação secundária identificada como **Total da compra**;
- a descrição, categoria e instrumento vêm da compra canônica e permanecem rastreáveis em cada ocorrência;
- cada fatura futura que recebeu uma parcela deve conseguir listar essa ocorrência, e não apenas possuir um `Invoice.totalAmountMinor` sem item correspondente;
- subtotal por instrumento, contagem de itens e filtros da fatura devem considerar a ocorrência visível, sem usar o total global da compra no lugar do valor da parcela;
- `Invoice.totalAmountMinor` permanece a fonte do **Total da fatura** e do valor devido.

Para compra simples, `Transaction.amountMinor` continua sendo o valor operacional da linha.

### D. Edição conservadora neste corte

Esta issue **não implementará reparcelamento** de uma compra já criada.

Ao abrir **Editar compra** para uma compra parcelada, o modal deve exibir claramente:

- `Parcelado`;
- parcela atual (`X de Y`);
- valor desta parcela;
- valor total da compra;
- total de parcelas;
- parcela inicial quando diferente de 1.

Neste corte ficam **somente leitura** para uma compra parcelada:

- valor total;
- valor da parcela;
- quantidade total de parcelas;
- parcela inicial;
- data que determinaria o cronograma/período das parcelas.

Continuam editáveis, conforme as regras atuais da compra:

- descrição;
- categoria;
- instrumento.

Ao alterar instrumento de uma compra parcelada, a correção deve preservar a regra durável de que todas as parcelas da mesma compra mantêm a origem pelo mesmo instrumento. A atualização da compra e de suas parcelas deve ocorrer atomicamente; não pode deixar `Transaction.cardInstrumentId` diferente das `Installment.cardInstrumentId` do mesmo parcelamento.

Alterar quantidade de parcelas, parcela inicial, datas do cronograma ou valores de um parcelamento existente fica para contrato específico posterior. O modal deve mostrar esses dados como somente leitura em vez de ocultá-los.

### E. Dados já criados pelo fluxo defeituoso

A correção deve distinguir dados novos de registros legados sem vínculo persistido suficiente.

- Backfill automático só é permitido quando o relacionamento entre compra, parcela e fatura puder ser provado de forma inequívoca por dados persistidos.
- Não associar registros históricos por coincidência de descrição, valor, instrumento ou proximidade de datas.
- Quando não for possível reparar com segurança, preservar o dado e registrar a limitação de saneamento; não inventar `Parcela X de Y` nem recalcular fatura silenciosamente.

## Escopo

- corrigir a semântica padrão do valor ao criar compra parcelada;
- reconciliar domínio, schema e repository para persistir/consultar o vínculo do cronograma;
- tornar `GET /api/installments?invoiceId=...` funcional para parcelas de compra manual de cartão;
- projetar as parcelas na lista da fatura com valor, sequência e total corretos;
- garantir que parcelas de faturas futuras também sejam visíveis como itens da fatura;
- corrigir subtotais/contagens/resumos que hoje possam usar `Transaction.amountMinor` total no lugar da ocorrência;
- apresentar o parcelamento no modal de edição;
- bloquear edição financeira/estrutural do parcelamento neste corte;
- manter edição segura de descrição/categoria/instrumento;
- atualizar documentação e testes de regressão.

## Fora de escopo

- alterar o número de parcelas de uma compra existente;
- alterar o valor total ou o valor por parcela de um parcelamento existente;
- alterar `installmentStart` de parcelamento existente;
- recalcular datas ou mover em lote parcelas entre faturas;
- criar uma tela/painel separado de parcelas;
- inferir parcela por texto `N/Y`;
- mudar o fluxo de compra fixa/recorrente, salvo regressão compartilhada causada pela correção;
- conversão cambial;
- backfill heurístico de dados financeiros ambíguos.

## Invariantes estruturais

### `must_behave`

- Selecionar `Parcelado` em nova compra usa **Valor total da compra** como modo padrão.
- A soma das parcelas materializadas corresponde ao valor total canônico, respeitando `installmentStart` e a regra de centavos.
- Cada parcela nova possui vínculo durável com compra de origem e fatura/período.
- Em cada fatura, a linha e os subtotais usam o valor da parcela daquela ocorrência.
- Editar uma compra parcelada mantém o contexto do parcelamento visível.

### `must_not_behave`

- Não multiplicar silenciosamente o valor digitado por `totalInstallments` sem o usuário ter escolhido explicitamente **Valor da parcela**.
- Não usar `Transaction.amountMinor` total como valor de ocorrência em uma fatura parcelada.
- Não aplicar `amountDelta` do total da compra somente à fatura atual.
- Não ocultar os dados de parcelamento no modo de edição.
- Não inferir o modo histórico `total`/`per_installment`.
- Não criar segunda linha técnica para `Installment`.

### `must_reuse`

- Reutilizar `GET /api/installments` como contrato de consulta do cronograma.
- Reutilizar a regra de divisão de valores do domínio; não duplicar distribuição de centavos no navegador.
- Reutilizar o endpoint operacional da compra para edição de descrição/categoria/instrumento; não usar `PATCH /api/installments/:id` como editor da compra da fatura.

### `must_be_single_source`

- `Transaction.amountMinor` da compra parcelada = total canônico da compra.
- `Installment.amountMinor` = valor canônico da ocorrência/parcela.
- `Installment.sequenceNumber` e `Installment.totalInstallments` = sequência canônica.
- `Invoice.totalAmountMinor` = total canônico da fatura.
- A relação compra ↔ cronograma ↔ fatura deve existir em uma única representação persistida efetiva, sem vínculo concorrente só no frontend.

### `must_not_depend_on`

- O caso principal não pode depender de descrição contendo `1/3`, ordem visual, igualdade de valores, mesma data ou cache do navegador para descobrir o parcelamento.

### `forbidden_implementation`

- Corrigir apenas o label/indicador e manter agregações erradas.
- Dividir `purchase.amountMinor / totalInstallments` no frontend para reconstruir parcelas.
- Consultar uma parcela por linha (N+1).
- Persistir `Installment.transactionId` apenas no objeto de domínio e descartá-lo no repository.
- Atualizar somente a compra ou somente uma parcela ao trocar o instrumento.
- Habilitar alteração de valor/quantidade/data sem contrato transacional de reparcelamento.

## Implementações erradas plausíveis e controles discriminantes

1. **Mantém `per_installment` como default.** O fluxo funciona quando o usuário troca manualmente para total, mas o erro original continua. **Controle:** selecionar `Parcelado`, não tocar no modo de valor e cadastrar R$ 300,00 em 3 parcelas; o total canônico deve continuar R$ 300,00.
2. **Mostra `Parcela X de Y`, mas sem vínculo persistido.** Funciona em fixture montada no frontend e falha após reload/banco real. **Controle:** criar via API, reiniciar/recarregar e consultar por `invoiceId` no PostgreSQL real.
3. **Usa divisão no frontend.** R$ 300/3 passa, mas R$ 100/3 diverge. **Controle:** comparar a linha de cada fatura com `Installment.amountMinor` persistido.
4. **Primeira fatura funciona e futuras ficam sem item.** O total futuro existe, mas a lista está vazia. **Controle:** navegar pelas 3 faturas de uma compra em 3 parcelas e encontrar exatamente uma ocorrência correspondente em cada uma.
5. **PATCH continua aceitando valor em compra parcelada.** A UI parece correta, mas uma chamada direta consegue corromper fatura/cronograma. **Controle:** API deve rejeitar mutação financeira/estrutural parcelada neste corte sem alterar `Transaction`, `Installment` ou `Invoice`.
6. **Troca instrumento apenas na Transaction.** A linha atual muda, mas parcelas futuras mantêm origem antiga. **Controle:** editar instrumento e conferir todas as parcelas do mesmo cronograma após reload.

## Cenários obrigatórios

### 1. Valor total — caminho padrão

Nova compra de R$ 300,00 em 3 parcelas, sem alterar o modo padrão:

- total da compra = R$ 300,00;
- parcelas somam R$ 300,00;
- cada fatura recebe somente sua parcela;
- nenhuma multiplicação para R$ 900,00.

### 2. Valor da parcela — escolha explícita

Nova compra com `Valor da parcela = R$ 100,00` e 3 parcelas:

- total da compra = R$ 300,00;
- cada parcela = R$ 100,00.

### 3. Centavos residuais

R$ 100,00 em 3 parcelas no modo total:

- usar exatamente os valores persistidos pelo domínio;
- soma = R$ 100,00;
- nenhuma recomposição por divisão no frontend.

### 4. Parcela inicial maior que 1

Com `totalInstallments = 6` e `installmentStart = 3`:

- a primeira ocorrência criada/exibida é `Parcela 3 de 6`;
- o total informado continua referindo-se ao plano completo;
- parcelas 1 e 2 não são inventadas.

### 5. Navegação entre faturas

Uma compra em 3 parcelas deve aparecer nas três faturas materializadas, cada uma com sua sequência e seu valor de ocorrência.

### 6. Edição

Em fatura editável, **Editar compra** mostra os dados do parcelamento. Valor/estrutura/data do cronograma ficam readonly; descrição/categoria/instrumento seguem editáveis.

### 7. Compra simples

Mantém o fluxo atual, inclusive edição de valor/data permitida pelas regras existentes.

### 8. Fatura bloqueada

`closed`, `paid` e `cancelled` mantêm o bloqueio atual da compra; nenhuma mutação parcial ocorre.

### 9. Registro legado ambíguo

Não realizar backfill heurístico nem fabricar metadados de parcela.

## Critérios de aceite

- [ ] Ao selecionar `Parcelado`, **Valor total da compra** é o modo padrão.
- [ ] **Valor da parcela** exige escolha explícita e deixa claro que o total será multiplicado pelo número total de parcelas.
- [ ] R$ 300,00 em 3 parcelas no modo padrão gera total canônico de R$ 300,00, não R$ 900,00.
- [ ] O vínculo de cada `Installment` de compra manual sobrevive à persistência e reload.
- [ ] `GET /api/installments?invoiceId=<id>` retorna as parcelas de compra manual pertencentes à fatura indicada e permite alcançar a compra de origem.
- [ ] Não existe N+1 para enriquecer a lista da fatura.
- [ ] Cada fatura futura com parcela possui item visível correspondente.
- [ ] A linha mostra `Parcela X de Y` a partir da `Installment` canônica.
- [ ] A linha e os subtotais por instrumento usam `Installment.amountMinor` para compra parcelada.
- [ ] `Total da fatura` e `Valor a pagar` permanecem ancorados em `Invoice.totalAmountMinor`/contrato de fatura.
- [ ] Contagens e métricas de conciliação não somam `Transaction.amountMinor` total como se fosse a parcela do período.
- [ ] Abrir **Editar compra** exibe total da compra, valor da parcela, X/Y, total de parcelas e parcela inicial quando aplicável.
- [ ] Valor, quantidade, parcela inicial e data estrutural ficam readonly para compra parcelada nesta entrega.
- [ ] Chamada direta ao endpoint de edição não consegue alterar valor/data estrutural de compra parcelada silenciosamente; a rejeição não modifica compra, parcelas nem faturas.
- [ ] Descrição e categoria continuam editáveis sem alterar cronograma ou totais.
- [ ] Alterar instrumento mantém compra e todas as parcelas do mesmo cronograma consistentes e é atômico.
- [ ] Compra simples não sofre regressão.
- [ ] `installmentStart > 1` e centavos residuais são preservados.
- [ ] Faturas bloqueadas continuam protegidas.
- [ ] Backfill não usa heurística ambígua.
- [ ] Não reaparece painel/lista paralela de parcelas.
- [ ] Testes automatizados e gate visual cobrem criação, navegação por faturas, edição e valores.

## Considerações de testes

### Domínio/API/persistência

- `total` padrão e `per_installment` explícito;
- R$ 100,00 / 3 e distribuição canônica de centavos;
- `installmentStart > 1`;
- persistência do vínculo compra ↔ parcelas e consulta após reload;
- consulta `invoiceId` retornando a ocorrência correta de cada fatura;
- compra parcelada visível em faturas futuras;
- rejeição de PATCH financeiro/estrutural em compra parcelada sem alteração parcial;
- edição de instrumento propagada atomicamente para o cronograma;
- resumo da fatura sem somar o total global no bucket da ocorrência;
- isolamento por tenant/perfil;
- PostgreSQL real para provar relações e atomicidade.

### Web

- criação sem tocar em `installmentValueMode` usa total;
- mensagem/label deixa claro `total` x `valor da parcela`;
- linha mostra valor da parcela + `Parcela X de Y`;
- navegação por todas as faturas do parcelamento;
- modal de edição parcelada com campos estruturais readonly;
- compra simples com comportamento atual;
- desktop, mobile, teclado e foco;
- ausência de `installments-panel`, `installments-section` ou linha técnica duplicada.

## Impacto na documentação

Na mesma branch/PR da implementação:

- `docs/CARDS.md` — corrigir a regra atual que diz genericamente que o modo de repetição fica oculto na edição; para compra parcelada, o contexto do parcelamento deve ficar visível em modo informativo/readonly. Documentar também `Valor total` como default na criação e a exibição por ocorrência na fatura.
- `docs/API_CREDIT_CARDS_INVOICES.md` — documentar claramente total da compra x valor da parcela, vínculo persistido do cronograma, consulta por fatura e bloqueio de mutação financeira/estrutural neste corte.
- `docs/API_INSTALLMENTS.md` — reconciliar a consulta `invoiceId` com compras parceladas manuais e registrar a relação canônica com a compra de origem.
- `docs/STATUS_MATRIX.md`/cobertura equivalente — não marcar parcelas de cartão como plenamente cobertas enquanto a regressão desta issue permanecer aberta.

## Riscos e dependências

- O schema atual não persiste o `Installment.transactionId` usado pelo domínio da compra parcelada; a entrega pode exigir migration compatível.
- A consulta atual de `GET /api/installments` usa `Transaction.installmentId` para chegar à fatura, o que não cobre um cronograma de várias parcelas ligado a uma única compra de origem.
- Dados legados criados sem vínculo durável podem não permitir reparo automático seguro.
- A correção precisa validar o caminho real no PostgreSQL; fixture somente em memória não prova o vínculo.

## Prontidão

**Pronta.** A revisão removeu duas decisões materiais que estavam abertas: (1) o modo padrão de valor na criação passa a ser **Valor total da compra**; (2) reparcelamento/alteração financeira estrutural de compra existente fica fora desta entrega e os dados aparecem readonly na edição. Também tornou explícita a lacuna de persistência que impedia `GET /api/installments?invoiceId` de cumprir o contrato para compras parceladas manuais.
