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

    const suffix = Date.now().toString(36);
    const account = (await request("/api/accounts", "POST", {
      name: "QA Issue 539 - Conta " + suffix,
      kind: "checking",
      openingBalanceMinor: 0,
      currency: "BRL"
    })).account;
    const category = (await request("/api/categories", "POST", {
      name: "Categoria historica QA " + suffix,
      kind: "expense"
    })).category;
    const accountRecurrence = (await request("/api/recurrences", "POST", {
      frequency: "monthly",
      startOn: "2026-07-05",
      endOn: "2026-09-05",
      amountMinor: 12345,
      description: "QA issue 539 parcela conta",
      kind: "expense",
      accountId: account.id,
      categoryId: category.id
    })).recurrence;
    await request("/api/recurrences/" + accountRecurrence.id + "/generate-installments", "POST", {
      through: "2026-09-05",
      maxOccurrences: 3
    });
    const accountInstallments = (await request(
      "/api/installments?recurrenceId=" + accountRecurrence.id + "&status=all"
    )).installments;
    const recurringAccountInstallment = accountInstallments.find(
      (item) => item.dueOn === "2026-07-05" && item.transaction?.id,
    );
    ${manualFinitePlanSetupScript("2026-07-05", "QA issue 539 parcela manual", 3)}
    const blockedAccountInstallment = accountInstallments.find(
      (item) => item.dueOn === "2026-08-05" && item.transaction?.id,
    );
    let blockedAccountMonth = "";
    if (blockedAccountInstallment?.transaction?.id) {
      const reconciled = await request(
        "/api/transactions/" + blockedAccountInstallment.transaction.id,
        "PATCH",
        { status: "reconciled" },
      );
      const effectiveOn = reconciled.transaction?.effectiveOn || "";
      blockedAccountMonth = String(effectiveOn).slice(0, 7);
    }
    await request("/api/categories/" + category.id + "/archive", "POST");

    const card = (await request("/api/credit-card-accounts", "POST", {
      name: "QA Issue 539 - Cartao " + suffix,
      closingDay: 20,
      dueDay: 10,
      creditLimitMinor: 80000,
      currency: "BRL",
      instruments: [{
        type: "physical",
        holder: "primary",
        name: "Fisico QA",
        maskedIdentifier: "**** 5390"
      }]
    })).creditCardAccount;
    const instrument = card.instruments[0];
    const cardRecurrence = (await request("/api/recurrences", "POST", {
      frequency: "monthly",
      startOn: "2026-07-08",
      endOn: "2026-09-08",
      amountMinor: 2468,
      description: "QA issue 539 parcela cartao",
      cardId: card.id,
      cardInstrumentId: instrument.id
    })).recurrence;
    await request("/api/recurrences/" + cardRecurrence.id + "/generate-installments", "POST", {
      through: "2026-09-08",
      maxOccurrences: 3
    });
    const cardInstallments = (await request(
      "/api/installments?recurrenceId=" + cardRecurrence.id + "&status=all"
    )).installments;
    const cardInstallment = cardInstallments.find(
      (item) => item.dueOn === "2026-07-08" && item.transaction?.invoiceId,
    );

    if (
      !accountInstallment?.transaction?.id ||
      !recurringAccountInstallment?.transaction?.id ||
      !blockedAccountInstallment?.transaction?.id ||
      !blockedAccountMonth ||
      !conflictAccountInstallment?.transaction?.id ||
      !cardInstallment?.transaction?.invoiceId
    ) {
      throw new Error("Issue 539 fixture did not create linked operational installments");
    }

    return {
      accountId: account.id,
      archivedCategoryId: category.id,
      accountInstallmentId: accountInstallment.id,
      accountTransactionId: accountInstallment.transaction.id,
      recurringAccountTransactionId: recurringAccountInstallment.transaction.id,
      accountBadge: "Parcela " + accountInstallment.sequenceNumber + " de " + accountInstallment.totalInstallments,
      blockedAccountMonth,
      blockedAccountTransactionId: blockedAccountInstallment.transaction.id,
      conflictAccountTransactionId: conflictAccountInstallment.transaction.id,
      conflictAccountOriginalDescription: conflictAccountInstallment.transaction.description,
      cardId: card.id,
      invoiceId: cardInstallment.transaction.invoiceId,
      cardInstallmentId: cardInstallment.id,
      cardTransactionId: cardInstallment.transaction.id
    };
  })()`;
}
