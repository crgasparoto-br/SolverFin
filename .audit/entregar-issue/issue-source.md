# Issue #662 — contrato canônico resumido para o handoff

- REQ-001: ao selecionar compra parcelada, interpretar o valor como total por padrão; valor por parcela somente por escolha explícita, preservando `installmentStart` e divisão canônica de centavos.
- REQ-002: cada nova `Installment` deve persistir vínculos inequívocos para a compra de origem e para a fatura da ocorrência, sem backfill heurístico de registros legados.
- REQ-003: `GET /api/installments?invoiceId=...` deve devolver parcelas de compras manuais com compra e fatura alcançáveis em uma única consulta e com isolamento por tenant/perfil.
- REQ-004: cada fatura deve mostrar uma única linha por ocorrência com `Parcela X de Y`, `Installment.amountMinor`, subtotal e contagem por ocorrência; `Invoice.totalAmountMinor` permanece o total da fatura.
- REQ-005: a edição parcelada mostra contexto, total, valor da ocorrência, sequência e parcela inicial; valor, data, fatura e estrutura ficam somente leitura também na API.
- REQ-006: descrição, categoria e instrumento continuam editáveis; a troca de instrumento atualiza atomicamente a compra e todas as parcelas, e qualquer fatura fechada, paga ou cancelada bloqueia a mutação inteira.
- REQ-007: compra simples, moedas explícitas, faturas bloqueadas, SSR, responsividade, teclado/foco e ausência de painel ou linha técnica duplicada não podem regredir.
