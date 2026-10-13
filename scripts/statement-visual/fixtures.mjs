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
    return { ok: response.ok, status: response.status, body: "[redacted]" };
  })()`;
}

export function fixtureExpression() {
  return `(async () => {
    async function request(path, method = "GET", body) {
      const headers = { origin: location.origin };
      if (body !== undefined) headers["content-type"] = "application/json";
      const response = await fetch(path, {
        method,
        headers,
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

    // A short, real note per head row, so the reference two-line description is exercised.
    const FIXTURE_NOTES = {
      "QA 01 limite positivo": "Salário creditado na conta",
      "QA 02 saldo zero": "Compra no cartão físico",
      "QA 03 saldo negativo": "Mensalidade do plano",
      "QA 04 retorno ao zero": "Resgate de investimento",
      "QA 05 valor medio": "Ingresso e transporte"
    };

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

    const created = [];
    for (const [description, kind, amountMinor, date] of transactions) {
      const response = await request("/api/transactions", "POST", {
        accountId: longAccount.id,
        kind,
        amountMinor,
        occurredOn: date,
        plannedOn: date,
        effectiveOn: date,
        status: "posted",
        description,
        note: FIXTURE_NOTES[description],
        currency: "BRL"
      });
      created.push(response.transaction ?? response);
    }

    // The reference shows categorised movements, so the head rows carry real catalogue
    // categories. Missing catalogue entries are skipped instead of invented.
    const catalog = (await request("/api/categories?limit=200")).categories ?? [];
    const used = new Set();
    const pickCategory = (kind, preferredName) => {
      const candidates = catalog.filter((item) => item.kind === kind && !used.has(item.id));
      return (
        candidates.find((item) => item.name === preferredName) ??
        candidates.find((item) => item.name.startsWith(preferredName)) ??
        candidates[0]
      );
    };
    const assignments = [
      ["QA 01 limite positivo", "Salário"],
      ["QA 02 saldo zero", "Alimentação"],
      ["QA 03 saldo negativo", "Transporte"],
      ["QA 04 retorno ao zero", "Investimento"],
      ["QA 05 valor medio", "Lazer"]
    ];
    for (const [description, categoryName] of assignments) {
      const target = created.find((row) => row?.description === description);
      if (!target?.id) continue;
      const category = pickCategory(target.kind, categoryName);
      if (!category?.id) continue;
      used.add(category.id);
      await request("/api/transactions/" + target.id, "PATCH", { categoryId: category.id });
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
