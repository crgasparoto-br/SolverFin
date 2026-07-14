export function loginExpression() {
  return `(async () => {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "demo@solverfin.example.invalid",
        password: "SolverFinDemo!2026"
      })
    });
    return { ok: response.ok, status: response.status, body: await response.text() };
  })()`;
}

export function fixtureExpression() {
  return `(async () => {
    async function request(path, method = "GET", body) {
      const response = await fetch(path, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(method + " " + path + " failed with " + response.status + ": " + JSON.stringify(payload));
      }
      return payload;
    }

    const longAccount = (await request("/api/accounts", "POST", {
      name: "QA Visual - Valores Extensos",
      kind: "checking",
      openingBalanceMinor: 0,
      currency: "BRL"
    })).account;
    const singleAccount = (await request("/api/accounts", "POST", {
      name: "QA Visual - Linha Unica Negativa",
      kind: "checking",
      openingBalanceMinor: 0,
      currency: "BRL"
    })).account;

    const maximum = 2147483647;
    const transactions = [
      ["QA 01 limite positivo", "income", maximum, "2026-07-01"],
      ["QA 02 saldo zero", "expense", maximum, "2026-07-02"],
      ["QA 03 saldo negativo", "expense", maximum, "2026-07-03"],
      ["QA 04 retorno ao zero", "income", maximum, "2026-07-04"],
      ["QA 05 valor medio", "income", 99999999, "2026-07-05"],
      ["QA 06 despesa media", "expense", 99999999, "2026-07-06"],
      ["QA 07 valor longo", "income", 999999999, "2026-07-07"],
      ["QA 08 despesa longa", "expense", 999999999, "2026-07-08"]
    ];

    for (let index = 0; index < 47; index += 1) {
      const day = String(9 + (index % 20)).padStart(2, "0");
      transactions.push([
        "QA agregado " + String(index + 1).padStart(2, "0"),
        "income",
        maximum,
        "2026-07-" + day
      ]);
    }

    for (const [description, kind, amountMinor, date] of transactions) {
      await request("/api/transactions", "POST", {
        accountId: longAccount.id,
        kind,
        amountMinor,
        occurredOn: date,
        plannedOn: date,
        effectiveOn: date,
        status: "posted",
        description,
        currency: "BRL"
      });
    }

    await request("/api/transactions", "POST", {
      accountId: singleAccount.id,
      kind: "expense",
      amountMinor: maximum,
      occurredOn: "2026-07-15",
      plannedOn: "2026-07-15",
      effectiveOn: "2026-07-15",
      status: "posted",
      description: "QA unica linha negativa",
      currency: "BRL"
    });

    return { longAccountId: longAccount.id, singleAccountId: singleAccount.id };
  })()`;
}

export function accountEditFixtureExpression() {
  return `(async () => {
    async function request(path, method = "GET", body) {
      const response = await fetch(path, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(method + " " + path + " failed with " + response.status + ": " + JSON.stringify(payload));
      }
      return payload;
    }

    const suffix = Date.now().toString(36);
    const sourceAccount = (await request("/api/accounts", "POST", {
      name: "QA Issue 473 - Origem " + suffix,
      kind: "checking",
      openingBalanceMinor: 50000,
      currency: "BRL"
    })).account;
    const targetAccount = (await request("/api/accounts", "POST", {
      name: "QA Issue 473 - Destino " + suffix,
      kind: "checking",
      openingBalanceMinor: 100000,
      currency: "BRL"
    })).account;
    const transaction = (await request("/api/transactions", "POST", {
      accountId: sourceAccount.id,
      kind: "expense",
      amountMinor: 12345,
      occurredOn: "2026-07-15",
      plannedOn: "2026-07-15",
      effectiveOn: "2026-07-15",
      status: "posted",
      description: "QA issue 473 troca de conta",
      currency: "BRL"
    })).transaction;
    const transfer = (await request("/api/transactions", "POST", {
      accountId: sourceAccount.id,
      destinationAccountId: targetAccount.id,
      kind: "transfer",
      amountMinor: 20000,
      occurredOn: "2026-07-16",
      plannedOn: "2026-07-16",
      effectiveOn: "2026-07-16",
      status: "posted",
      description: "QA issue 473 transferencia",
      currency: "BRL"
    })).transaction;

    return {
      sourceAccountId: sourceAccount.id,
      targetAccountId: targetAccount.id,
      transactionId: transaction.id,
      transferId: transfer.id
    };
  })()`;
}
