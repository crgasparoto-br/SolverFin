import assert from "node:assert/strict";

import { resolveInvoiceDay } from "./cards-page-month-navigation.js";

const invoice = {
  id: "invoice-1",
  cardId: "card-1",
  periodStartOn: "2028-01-01",
  periodEndOn: "2028-01-31",
};

assert.equal(resolveInvoiceDay("2028-01-01", invoice), "2028-01-01");
assert.equal(resolveInvoiceDay("2028-01-31", invoice), "2028-01-31");
assert.equal(resolveInvoiceDay("2028-01-10", invoice), "2028-01-10");
assert.equal(resolveInvoiceDay("2027-12-31", invoice), undefined);
assert.equal(resolveInvoiceDay("2028-02-01", invoice), undefined);
assert.equal(resolveInvoiceDay("2028-02-30", invoice), undefined);
assert.equal(resolveInvoiceDay("not-a-date", invoice), undefined);
assert.equal(resolveInvoiceDay(undefined, invoice), undefined);
assert.equal(resolveInvoiceDay("2028-01-10", undefined), undefined);
