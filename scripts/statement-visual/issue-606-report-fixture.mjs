import { evaluate } from "./cdp.mjs";

export async function seedReportData(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const run = async () => {
        const request = async (path, options = {}) => {
          const response = await fetch(path, {
            credentials: 'same-origin',
            ...options,
            headers: { 'content-type': 'application/json', ...(options.headers || {}) },
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(path + ' -> ' + response.status);
          return body;
        };
        const suffix = Date.now().toString(36);
        const accountsBody = await request('/api/accounts');
        let account = accountsBody.accounts?.find((item) => item.status === 'active');
        if (!account) {
          account = (await request('/api/accounts', {
            method: 'POST',
            body: JSON.stringify({
              name: 'Conta semantica ' + suffix,
              kind: 'checking',
              openingBalanceMinor: 0,
            }),
          })).account;
        }
        const category = (await request('/api/categories', {
          method: 'POST',
          body: JSON.stringify({ name: 'Despesa semantica ' + suffix, kind: 'expense' }),
        })).category;
        const occurredOn = new Date().toISOString().slice(0, 10);
        await request('/api/transactions', {
          method: 'POST',
          body: JSON.stringify({
            status: 'posted',
            occurredOn,
            plannedOn: occurredOn,
            accountId: account.id,
            kind: 'expense',
            categoryId: category.id,
            amountMinor: 87500,
            description: 'Despesa semantica ' + suffix,
          }),
        });
        return occurredOn.slice(0, 7);
      };
      return run();
    })()`,
  );
}
