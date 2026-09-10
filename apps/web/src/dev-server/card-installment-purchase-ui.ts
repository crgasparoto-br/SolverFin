export function cardInstallmentPurchaseStyles(): string {
  return `.cards-installment-context{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px;font-size:.75rem;color:var(--muted,#64748b)}.cards-installment-context strong{color:var(--text,#0f172a)}.cards-installment-edit-context{grid-column:1/-1;margin:0;padding:10px 12px;border:1px solid var(--line,#cbd5e1);border-radius:10px;background:var(--surface-muted,#f8fafc);font-size:.8125rem;line-height:1.4}.modal-panel form[data-installment-purchase-edit=true] input[readonly]{background:var(--surface-muted,#f8fafc);color:var(--muted,#64748b);cursor:not-allowed}.installment-value-help{display:block;margin-top:4px;font-size:.75rem;color:var(--muted,#64748b)}`;
}

export function cardInstallmentPurchaseScript(): string {
  return `
    <script>
      (function () {
        const root = document.querySelector('[data-cards-archetype="A3"]');
        const form = document.querySelector('[data-purchase-form]');
        if (!root || !form) return;

        const valueMode = form.querySelector('[name="installmentValueMode"]');
        const repeatMode = form.querySelector('[name="repeatMode"]');
        const amountInput = form.querySelector('[name="amountMinor"]');
        const occurredOnInput = form.querySelector('[name="occurredOn"]');
        const modeLabel = valueMode && valueMode.closest('label');

        function money(amountMinor, currency) {
          try {
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(Number(amountMinor || 0) / 100);
          } catch (_error) {
            return String(Number(amountMinor || 0) / 100);
          }
        }

        function moneyInput(amountMinor) {
          return (Number(amountMinor || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        function ensureValueModeCopy() {
          if (!valueMode) return;
          const total = valueMode.querySelector('option[value="total"]');
          const perInstallment = valueMode.querySelector('option[value="per_installment"]');
          if (total) total.textContent = 'Valor total da compra';
          if (perInstallment) perInstallment.textContent = 'Valor da parcela';
          if (!modeLabel) return;
          let help = modeLabel.querySelector('[data-installment-value-help]');
          if (!help) {
            help = document.createElement('small');
            help.className = 'installment-value-help';
            help.dataset.installmentValueHelp = 'true';
            modeLabel.appendChild(help);
          }
          const isInstallment = repeatMode && repeatMode.value === 'installment';
          help.hidden = !isInstallment;
          help.textContent = valueMode.value === 'per_installment'
            ? 'O valor informado será multiplicado pela quantidade de parcelas para formar o total da compra.'
            : 'O valor total informado será dividido entre as parcelas.';
        }

        function clearInstallmentEditState() {
          form.dataset.installmentPurchaseEdit = 'false';
          if (amountInput) {
            amountInput.readOnly = false;
            amountInput.removeAttribute('aria-readonly');
          }
          if (occurredOnInput) {
            occurredOnInput.readOnly = false;
            occurredOnInput.removeAttribute('aria-readonly');
          }
          form.querySelector('[data-installment-edit-context]')?.remove();
        }

        function prepareNewPurchase() {
          clearInstallmentEditState();
          if (valueMode) valueMode.value = 'total';
          ensureValueModeCopy();
        }

        document.querySelectorAll('[data-open-modal="purchase"]').forEach((button) => {
          button.addEventListener('click', prepareNewPurchase);
        });
        valueMode && valueMode.addEventListener('change', ensureValueModeCopy);
        repeatMode && repeatMode.addEventListener('change', ensureValueModeCopy);

        document.querySelectorAll('[data-purchase]').forEach((node) => {
          const purchase = JSON.parse(node.textContent || '{}');
          const editButton = document.querySelector('[data-edit-purchase="' + purchase.id + '"]');
          if (!editButton) return;

          editButton.addEventListener('click', () => {
            clearInstallmentEditState();
            if (!purchase.installmentSequenceNumber || !purchase.totalInstallments) return;

            form.dataset.installmentPurchaseEdit = 'true';
            if (amountInput) {
              amountInput.value = moneyInput(purchase.purchaseAmountMinor);
              amountInput.readOnly = true;
              amountInput.setAttribute('aria-readonly', 'true');
            }
            if (occurredOnInput) {
              occurredOnInput.value = purchase.purchaseOccurredOn || purchase.occurredOn || '';
              occurredOnInput.readOnly = true;
              occurredOnInput.setAttribute('aria-readonly', 'true');
            }

            const context = document.createElement('p');
            context.className = 'cards-installment-edit-context';
            context.dataset.installmentEditContext = 'true';
            context.setAttribute('role', 'note');
            context.textContent = 'Parcela ' + purchase.installmentSequenceNumber + ' de ' + purchase.totalInstallments
              + ' · valor nesta fatura ' + money(purchase.amountMinor, purchase.currency)
              + ' · total da compra ' + money(purchase.purchaseAmountMinor, purchase.currency)
              + '. Valor, data e distribuição do parcelamento não podem ser alterados.';
            const submit = form.querySelector('button[type="submit"]');
            if (submit) form.insertBefore(context, submit);
            else form.appendChild(context);
          });

          if (!purchase.installmentSequenceNumber || !purchase.totalInstallments) return;
          const row = node.closest('[data-purchase-item]');
          const description = row && row.querySelector('.cards-purchase-description');
          if (description && !description.querySelector('[data-installment-context]')) {
            const context = document.createElement('span');
            context.className = 'cards-installment-context';
            context.dataset.installmentContext = 'true';
            context.innerHTML = '<strong>Parcela ' + purchase.installmentSequenceNumber + ' de ' + purchase.totalInstallments + '</strong>'
              + '<span>· total da compra ' + money(purchase.purchaseAmountMinor, purchase.currency) + '</span>';
            description.appendChild(context);
          }

          if (purchase.installmentEditLocked) {
            editButton.disabled = true;
            editButton.title = 'Esta compra parcelada não pode ser editada porque uma das faturas vinculadas está fechada, paga ou cancelada.';
          }
        });

        prepareNewPurchase();
      })();
    </script>
  `;
}
