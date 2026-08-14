# ADR 0012 - Separar agência e conta no cadastro de conta

- Status: Aceito
- Data: 2026-08-14
- Issue: #587

## Contexto

O cadastro de conta financeira mantinha agência e número da conta em um único campo `maskedIdentifier`. O formato não era estruturado e podia misturar textos diferentes, o que impedia editar, validar e evoluir agência e conta de forma independente.

Agência e conta também são dados financeiros sensíveis. A interface deve evitar expor os valores completos fora do contexto em que a edição exige esses dados.

## Decisão

O modelo `Account` passa a possuir dois campos opcionais e independentes:

- `agencyIdentifier`: agência da conta;
- `accountIdentifier`: número/identificador da conta.

Os dois campos aceitam até 80 caracteres, são normalizados com `trim` no domínio e podem ser removidos independentemente.

`maskedIdentifier` permanece temporariamente no modelo exclusivamente como dado legado de leitura. Os payloads graváveis de `POST /api/accounts` e `PATCH /api/accounts/:accountId` não expõem esse campo. Atualizações não relacionadas preservam o valor histórico existente. Não haverá parsing, backfill ou migração heurística de `maskedIdentifier`, porque o conteúdo histórico não possui formato garantido.

A migração de banco é aditiva: cria duas colunas nullable e não altera os dados existentes.

Na interface:

- criação e edição apresentam campos separados `Agência` e `Conta`;
- novos formulários não concatenam os valores em `maskedIdentifier`;
- a listagem apresenta apenas sufixos minimizados quando os campos estruturados existem;
- identificadores curtos demais para permitir exibição parcial não aparecem na listagem nem em dados de busca;
- registros exclusivamente legados são indicados na listagem sem revelar o texto bruto;
- o identificador legado completo pode ser mostrado no modal de edição para permitir que o usuário corrija o cadastro e preencha os novos campos.

## Consequências

### Positivas

- agência e conta passam a ter semântica e ciclo de vida independentes;
- a API pode evoluir validações sem depender de parsing de texto;
- a apresentação atende ao princípio de minimização de dados;
- a mudança é compatível com registros históricos sem manter uma superfície de escrita legada.

### Custos

- durante o período de compatibilidade existem três campos armazenados de identificação, embora apenas os dois estruturados sejam graváveis pela API;
- dados legados só se tornam estruturados quando o cadastro é revisado explicitamente;
- remoção futura de `maskedIdentifier` exige uma decisão separada depois de confirmar que não existem registros históricos que dependam da leitura desse campo.

## Rollback

O rollback de aplicação pode parar de escrever os novos campos sem perda dos dados legados existentes. As colunas não devem ser removidas automaticamente no rollback da aplicação; uma eventual remoção exige migração destrutiva separada e verificação prévia de uso.
