import assert from "node:assert/strict";

import {
  cardInstallmentPurchaseScript,
  cardInstallmentPurchaseStyles,
} from "./card-installment-purchase-ui.js";
import { recurrencesSectionScript, recurrencesSectionStyles } from "./recurrences-section.js";

const script = cardInstallmentPurchaseScript();
const styles = cardInstallmentPurchaseStyles();
const integratedScript = recurrencesSectionScript();
const integratedStyles = recurrencesSectionStyles();

assert.match(script, /Valor total da compra/);
assert.match(script, /Valor da parcela/);
assert.match(script, /valueMode\.value = 'total'/);
assert.match(script, /multiplicado pela quantidade de parcelas/);
assert.match(script, /dividido entre as parcelas/);
assert.match(script, /purchase\.purchaseAmountMinor/);
assert.match(script, /purchase\.installmentSequenceNumber/);
assert.match(script, /purchase\.totalInstallments/);
assert.match(script, /Parcela ' \+ purchase\.installmentSequenceNumber/);
assert.match(script, /valor nesta fatura/);
assert.match(script, /total da compra/);
assert.match(script, /amountInput\.readOnly = true/);
assert.match(script, /occurredOnInput\.readOnly = true/);
assert.match(script, /aria-readonly/);
assert.match(script, /purchase\.installmentEditLocked/);
assert.match(script, /editButton\.disabled = true/);
assert.match(script, /description\.appendChild\(context\)/);
assert.doesNotMatch(script, /insertAdjacentHTML\([^,]+,[^)]*data-purchase-item/);
assert.match(styles, /flex-wrap:wrap/);
assert.match(styles, /data-installment-purchase-edit=true/);
assert.match(integratedScript, /cardInstallmentPurchaseScript/);
assert.match(integratedScript, /purchase\.installmentSequenceNumber\) return/);
assert.ok(integratedStyles.includes(styles));
