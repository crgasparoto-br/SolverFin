from pathlib import Path


def replace_once(path_value: str, old: str, new: str) -> None:
    path = Path(path_value)
    content = path.read_text(encoding="utf-8")
    count = content.count(old)
    if count != 1:
        raise SystemExit(
            f"expected one anchor in {path_value}, found {count}: {old[:100]!r}"
        )
    path.write_text(content.replace(old, new, 1), encoding="utf-8")


# Preserve the existing operational reconciliation action while blocking all
# other generic mutation paths for canonical installments.
replace_once(
    "apps/api/src/repositories/transactions.ts",
    """export interface UpdateTransactionOptions {
  denyCanonicalInstallmentMutation?: boolean;
}

type TransactionMetadata = {
""",
    """export interface UpdateTransactionOptions {
  denyCanonicalInstallmentMutation?: boolean;
}

function isCanonicalInstallmentReconciliation(
  payload: UpdateTransactionPayloadWithMetadata,
): boolean {
  const keys = Object.keys(payload);
  return (
    keys.length === 1 &&
    payload.status !== undefined &&
    (payload.status === "posted" || payload.status === "reconciled")
  );
}

type TransactionMetadata = {
""",
)
replace_once(
    "apps/api/src/repositories/transactions.ts",
    """  if (options.denyCanonicalInstallmentMutation === true && currentTransaction?.installmentId) {
    throw Object.assign(new Error("Use a manutenção da parcela para alterar este lançamento."), {
      code: "INSTALLMENT_DIRECT_UPDATE_REQUIRED",
      statusCode: 409,
    });
  }
""",
    """  if (
    options.denyCanonicalInstallmentMutation === true &&
    currentTransaction?.installmentId &&
    !isCanonicalInstallmentReconciliation(payload)
  ) {
    throw Object.assign(new Error("Use a manutenção da parcela para alterar este lançamento."), {
      code: "INSTALLMENT_DIRECT_UPDATE_REQUIRED",
      statusCode: 409,
    });
  }
""",
)

# Add an operational-date range that follows the statement date precedence.
replace_once(
    "apps/api/src/repositories/installments.ts",
    """  dueFrom?: string;
  dueTo?: string;
  status?: InstallmentStatus | "all";
""",
    """  dueFrom?: string;
  dueTo?: string;
  operationalFrom?: string;
  operationalTo?: string;
  status?: InstallmentStatus | "all";
""",
)
replace_once(
    "apps/api/src/repositories/installments.ts",
    """  if (filters.dueTo !== undefined) {
    params.push(filters.dueTo);
    where.push(`i."dueOn" <= $${params.length}`);
  }

  const rows = await query<Row>(
""",
    """  if (filters.dueTo !== undefined) {
    params.push(filters.dueTo);
    where.push(`i."dueOn" <= $${params.length}`);
  }

  if (filters.operationalFrom !== undefined) {
    params.push(filters.operationalFrom);
    where.push(
      `coalesce(t."effectiveOn", t."plannedOn", t."occurredOn", i."dueOn") >= $${params.length}`,
    );
  }

  if (filters.operationalTo !== undefined) {
    params.push(filters.operationalTo);
    where.push(
      `coalesce(t."effectiveOn", t."plannedOn", t."occurredOn", i."dueOn") <= $${params.length}`,
    );
  }

  const rows = await query<Row>(
""",
)
replace_once(
    "apps/api/src/repositories/installments.ts",
    """function validateFilters(filters: ListInstallmentsFilters): void {
  if (
    filters.status !== undefined &&
    filters.status !== "all" &&
    !VALID_INSTALLMENT_STATUSES.includes(filters.status)
  ) {
    throwInstallmentsFilterInvalid("Status de parcela invalido.");
  }

  if (filters.dueFrom !== undefined && !isIsoDate(filters.dueFrom)) {
    throwInstallmentsFilterInvalid("Data inicial de vencimento invalida.");
  }

  if (filters.dueTo !== undefined && !isIsoDate(filters.dueTo)) {
    throwInstallmentsFilterInvalid("Data final de vencimento invalida.");
  }

  if (
    filters.dueFrom !== undefined &&
    filters.dueTo !== undefined &&
    filters.dueFrom > filters.dueTo
  ) {
    throwInstallmentsFilterInvalid("Periodo de vencimento invertido.");
  }
}
""",
    """function validateFilters(filters: ListInstallmentsFilters): void {
  if (
    filters.status !== undefined &&
    filters.status !== "all" &&
    !VALID_INSTALLMENT_STATUSES.includes(filters.status)
  ) {
    throwInstallmentsFilterInvalid("Status de parcela invalido.");
  }

  if (filters.dueFrom !== undefined && !isIsoDate(filters.dueFrom)) {
    throwInstallmentsFilterInvalid("Data inicial de vencimento invalida.");
  }

  if (filters.dueTo !== undefined && !isIsoDate(filters.dueTo)) {
    throwInstallmentsFilterInvalid("Data final de vencimento invalida.");
  }

  if (
    filters.dueFrom !== undefined &&
    filters.dueTo !== undefined &&
    filters.dueFrom > filters.dueTo
  ) {
    throwInstallmentsFilterInvalid("Periodo de vencimento invertido.");
  }

  if (filters.operationalFrom !== undefined && !isIsoDate(filters.operationalFrom)) {
    throwInstallmentsFilterInvalid("Data operacional inicial invalida.");
  }

  if (filters.operationalTo !== undefined && !isIsoDate(filters.operationalTo)) {
    throwInstallmentsFilterInvalid("Data operacional final invalida.");
  }

  if (
    filters.operationalFrom !== undefined &&
    filters.operationalTo !== undefined &&
    filters.operationalFrom > filters.operationalTo
  ) {
    throwInstallmentsFilterInvalid("Periodo operacional invertido.");
  }
}
""",
)
replace_once(
    "apps/api/src/installments-router.ts",
    """    ...(request.query.get("dueFrom") ? { dueFrom: String(request.query.get("dueFrom")) } : {}),
    ...(request.query.get("dueTo") ? { dueTo: String(request.query.get("dueTo")) } : {}),
    ...(request.query.get("status")
""",
    """    ...(request.query.get("dueFrom") ? { dueFrom: String(request.query.get("dueFrom")) } : {}),
    ...(request.query.get("dueTo") ? { dueTo: String(request.query.get("dueTo")) } : {}),
    ...(request.query.get("operationalFrom")
      ? { operationalFrom: String(request.query.get("operationalFrom")) }
      : {}),
    ...(request.query.get("operationalTo")
      ? { operationalTo: String(request.query.get("operationalTo")) }
      : {}),
    ...(request.query.get("status")
""",
)

# Use the statement operational range and normalize notes before comparing.
replace_once(
    "apps/web/src/dev-server/operational-installments.ts",
    """    accountId,
    dueFrom: `${month}-01`,
    dueTo: `${month}-${String(lastDay).padStart(2, "0")}`,
    status: "all",
""",
    """    accountId,
    operationalFrom: `${month}-01`,
    operationalTo: `${month}-${String(lastDay).padStart(2, "0")}`,
    status: "all",
""",
)
replace_once(
    "apps/web/src/dev-server/operational-installments.ts",
    """  const description = current.description.trim();
  if (description !== initial.description.trim()) patch.description = description;
  if (current.note !== initial.note) patch.note = current.note.trim() || null;
  if (current.categoryId !== initial.categoryId) patch.categoryId = current.categoryId || null;
""",
    """  const description = current.description.trim();
  const initialNote = initial.note.trim();
  const currentNote = current.note.trim();
  if (description !== initial.description.trim()) patch.description = description;
  if (currentNote !== initialNote) patch.note = currentNote || null;
  if (current.categoryId !== initial.categoryId) patch.categoryId = current.categoryId || null;
""",
)
replace_once(
    "apps/web/src/dev-server/operational-installments.ts",
    """        return "/api/installments?accountId=" + encodeURIComponent(accountId)
          + "&dueFrom=" + month + "-01&dueTo=" + month + "-" + String(lastDay).padStart(2, "0")
          + "&status=all";
""",
    """        return "/api/installments?accountId=" + encodeURIComponent(accountId)
          + "&operationalFrom=" + month + "-01&operationalTo=" + month + "-" + String(lastDay).padStart(2, "0")
          + "&status=all";
""",
)
replace_once(
    "apps/web/src/dev-server/operational-installments.ts",
    """        const patch = {};
        if (current.description !== String(initial.description || "").trim()) patch.description = current.description;
        if (current.note !== String(initial.note || "")) patch.note = current.note.trim() || null;
        if (current.categoryId !== String(initial.categoryId || "")) patch.categoryId = current.categoryId || null;
""",
    """        const patch = {};
        const initialNote = String(initial.note || "").trim();
        const currentNote = current.note.trim();
        if (current.description !== String(initial.description || "").trim()) patch.description = current.description;
        if (currentNote !== initialNote) patch.note = currentNote || null;
        if (current.categoryId !== String(initial.categoryId || "")) patch.categoryId = current.categoryId || null;
""",
)

# Discriminant API tests.
replace_once(
    "apps/api/src/installments-router.integration.test.ts",
    """  const concurrentInstallment =
    installmentRefs[1] ?? assert.fail("Expected concurrent installment.");
  await assertRejectsGenericTransactionMutation(token, editableInstallment);
""",
    """  const concurrentInstallment =
    installmentRefs[1] ?? assert.fail("Expected concurrent installment.");
  const reconciliationInstallment =
    installmentRefs[2] ?? assert.fail("Expected reconciliation installment.");
  await assertRejectsGenericTransactionMutation(token, editableInstallment);
  await assertAllowsGenericReconciliation(token, reconciliationInstallment);
  await assertFiltersOperationalPeriod(token, reconciliationInstallment, account.id);
""",
)
replace_once(
    "apps/api/src/installments-router.integration.test.ts",
    """async function assertRevalidatesConcurrentStateChange(
""",
    """async function assertAllowsGenericReconciliation(
  token: string,
  ref: InstallmentRef,
): Promise<void> {
  const reconcileResponse = await apiRequest(
    token,
    "PATCH",
    `/api/transactions/${ref.transactionId}`,
    { status: "reconciled" },
  );
  assert.equal(reconcileResponse.statusCode, 200);
  assert.equal(
    readBody<{ transaction: { status: string } }>(reconcileResponse).transaction.status,
    "reconciled",
  );

  const reconciled = await readInstallment(token, ref.installmentId);
  assert.equal(reconciled.transaction?.status, "reconciled");
  assert.equal(reconciled.editBlockedReason, "transaction_status_locked");

  const reopenResponse = await apiRequest(
    token,
    "PATCH",
    `/api/transactions/${ref.transactionId}`,
    { status: "posted" },
  );
  assert.equal(reopenResponse.statusCode, 200);
  assert.equal(
    readBody<{ transaction: { status: string } }>(reopenResponse).transaction.status,
    "posted",
  );
}

async function assertFiltersOperationalPeriod(
  token: string,
  ref: InstallmentRef,
  accountId: string,
): Promise<void> {
  await getPool().query(
    `update "Transaction"
        set "status" = 'POSTED', "effectiveOn" = $2
      where "id" = $1`,
    [ref.transactionId, "2026-10-15"],
  );

  const operationalResponse = await apiRequest(
    token,
    "GET",
    `/api/installments?accountId=${accountId}&operationalFrom=2026-10-01&operationalTo=2026-10-31&status=all`,
  );
  assert.equal(operationalResponse.statusCode, 200);
  const operationalIds = readBody<{ installments: ApiInstallmentHistory[] }>(
    operationalResponse,
  ).installments.map((installment) => installment.id);
  assert.equal(operationalIds.includes(ref.installmentId), true);

  const dueOnlyResponse = await apiRequest(
    token,
    "GET",
    `/api/installments?accountId=${accountId}&dueFrom=2026-10-01&dueTo=2026-10-31&status=all`,
  );
  assert.equal(dueOnlyResponse.statusCode, 200);
  const dueOnlyIds = readBody<{ installments: ApiInstallmentHistory[] }>(
    dueOnlyResponse,
  ).installments.map((installment) => installment.id);
  assert.equal(dueOnlyIds.includes(ref.installmentId), false);
}

async function assertRevalidatesConcurrentStateChange(
""",
)
replace_once(
    "apps/api/src/installments-router.integration.test.ts",
    """  assert.equal(invertedPeriod.statusCode, 400);
  assert.equal(readErrorCode(invertedPeriod), "INSTALLMENTS_FILTER_INVALID");
}
""",
    """  assert.equal(invertedPeriod.statusCode, 400);
  assert.equal(readErrorCode(invertedPeriod), "INSTALLMENTS_FILTER_INVALID");

  const invertedOperationalPeriod = await apiRequest(
    token,
    "GET",
    "/api/installments?operationalFrom=2026-08-01&operationalTo=2026-07-01",
  );
  assert.equal(invertedOperationalPeriod.statusCode, 400);
  assert.equal(readErrorCode(invertedOperationalPeriod), "INSTALLMENTS_FILTER_INVALID");
}
""",
)

# Web contract tests.
replace_once(
    "apps/web/src/dev-server/operational-installments.test.ts",
    '    "/api/installments?accountId=account-demo&dueFrom=2026-02-01&dueTo=2026-02-28&status=all&profileId=profile-demo",\n',
    '    "/api/installments?accountId=account-demo&operationalFrom=2026-02-01&operationalTo=2026-02-28&status=all&profileId=profile-demo",\n',
)
replace_once(
    "apps/web/src/dev-server/operational-installments.test.ts",
    """  assert.deepEqual(
    buildInstallmentPatch(
      { description: "Parcela", note: "", categoryId: "" },
      { description: "Parcela", note: "", categoryId: "" },
    ),
    {},
  );
});
""",
    """  assert.deepEqual(
    buildInstallmentPatch(
      { description: "Parcela", note: "", categoryId: "" },
      { description: "Parcela", note: "", categoryId: "" },
    ),
    {},
  );
  assert.deepEqual(
    buildInstallmentPatch(
      { description: "Parcela", note: "Observação", categoryId: "" },
      { description: "Parcela", note: "  Observação  ", categoryId: "" },
    ),
    {},
  );
});
""",
)

# Extend real-browser validation with read-only and stale-conflict states.
replace_once(
    "scripts/statement-visual/issue-539-operational-installments.mjs",
    """  await validateAccountDesktop(fixture);
  await validateAccountMobile(fixture);
  await validateCardDesktop(fixture);
""",
    """  await validateAccountDesktop(fixture);
  await validateAccountMobile(fixture);
  await validateBlockedAccountDesktop(fixture);
  await validateConflictAccountDesktop(fixture);
  await validateCardDesktop(fixture);
""",
)
replace_once(
    "scripts/statement-visual/issue-539-operational-installments.mjs",
    """async function validateCardDesktop(fixture) {
""",
    """async function validateBlockedAccountDesktop(fixture) {
  await setViewport(browser.cdp, 1366, 768);
  const route = `/lancamentos?accountId=${encodeURIComponent(fixture.accountId)}&month=2026-08`;
  await navigate(browser.cdp, `${baseUrl}${route}`);
  const line = await waitForAccountLine(fixture.blockedAccountTransactionId);
  check(line.installmentEditable === false, "Blocked installment was presented as editable", line);

  await evaluate(
    browser.cdp,
    `document.querySelector('[data-edit="${fixture.blockedAccountTransactionId}"]').click()`,
  );
  await sleep(250);
  const modal = await readAccountModal(fixture.archivedCategoryId);
  check(modal.open, "Read-only installment modal did not open", modal);
  check(modal.title === "Detalhes da parcela", "Read-only modal title is incorrect", modal);
  check(modal.visibleEditableNames.length === 0, "Read-only modal exposes editable fields", modal);
  check(modal.saveHidden, "Read-only modal still exposes the save action", modal);
  check(
    modal.reasonText === "O lançamento já foi efetivado, conciliado ou cancelado.",
    "Read-only modal did not translate the block reason",
    modal,
  );

  const filename = "issue-539-account-installment-blocked-desktop-1366x768.png";
  await screenshot(browser.cdp, join(outputDir, filename));
  scenarios.push({ route, viewport: "1366x768", state: "read-only reconciled installment", screenshot: filename, modal });
  await evaluate(browser.cdp, `document.querySelector("[data-modal]").close()`);
}

async function validateConflictAccountDesktop(fixture) {
  await setViewport(browser.cdp, 1366, 768);
  const route = `/lancamentos?accountId=${encodeURIComponent(fixture.accountId)}&month=2026-09`;
  await navigate(browser.cdp, `${baseUrl}${route}`);
  await waitForAccountLine(fixture.conflictAccountTransactionId);
  await evaluate(
    browser.cdp,
    `document.querySelector('[data-edit="${fixture.conflictAccountTransactionId}"]').click()`,
  );
  await sleep(250);
  const attemptedDescription = `Conflito preservado ${Date.now().toString(36)}`;
  const conflict = await evaluate(
    browser.cdp,
    `(async () => {
      const form = document.querySelector("[data-form]");
      const nativeFetch = window.fetch.bind(window);
      const nativeSetTimeout = window.setTimeout.bind(window);
      form.description.value = ${JSON.stringify(attemptedDescription)};
      const statusResponse = await nativeFetch("/api/transactions/${fixture.conflictAccountTransactionId}", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "reconciled" })
      });
      let patchResult;
      window.fetch = async (...args) => {
        const response = await nativeFetch(...args);
        const path = String(args[0] || "");
        const method = String(args[1]?.method || "GET").toUpperCase();
        if (path.includes("/api/installments/") && method === "PATCH") {
          patchResult = { status: response.status, body: await response.clone().json().catch(() => ({})) };
        }
        return response;
      };
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      for (let attempt = 0; attempt < 50 && !patchResult; attempt += 1) {
        await new Promise((resolve) => nativeSetTimeout(resolve, 100));
      }
      window.fetch = nativeFetch;
      return {
        statusUpdate: statusResponse.status,
        patchResult,
        modalOpen: document.querySelector("[data-modal]").open,
        statusText: form.querySelector("[data-installment-status-message]")?.textContent || "",
        descriptionValue: form.description.value,
        reloadVisible: Boolean(form.querySelector("[data-installment-reload]"))
      };
    })()`,
  );
  check(conflict.statusUpdate === 200, "Concurrent status transition failed", conflict);
  check(conflict.patchResult?.status === 409, "Stale installment edit was not rejected", conflict);
  check(conflict.modalOpen, "Conflict closed the installment modal", conflict);
  check(conflict.descriptionValue === attemptedDescription, "Conflict did not preserve the typed description", conflict);
  check(conflict.reloadVisible, "Conflict did not expose the reload action", conflict);
  check(conflict.statusText.includes("estado da parcela mudou"), "Conflict message is not actionable", conflict);

  const filename = "issue-539-account-installment-conflict-desktop-1366x768.png";
  await screenshot(browser.cdp, join(outputDir, filename));
  scenarios.push({ route, viewport: "1366x768", state: "stale edit conflict", screenshot: filename, conflict });

  await evaluate(browser.cdp, `document.querySelector("[data-installment-reload]").click()`);
  await sleep(300);
  const reloaded = await readAccountModal(fixture.archivedCategoryId);
  check(reloaded.title === "Detalhes da parcela", "Reload did not reflect the blocked state", reloaded);
  check(reloaded.visibleEditableNames.length === 0, "Reload kept blocked fields editable", reloaded);
  check(reloaded.descriptionValue === fixture.conflictAccountOriginalDescription, "Reload did not restore the persisted description", reloaded);
  await evaluate(browser.cdp, `document.querySelector("[data-modal]").close()`);
}

async function validateCardDesktop(fixture) {
""",
)
replace_once(
    "scripts/statement-visual/issue-539-operational-installments.mjs",
    """            editable: Boolean(edit.dataset.installmentEdit) && !edit.disabled,
            hasRecurrenceIndicator: Boolean(row.querySelector(".recurrence-indicator")),
""",
    """            editable: Boolean(edit.dataset.installmentEdit) && !edit.disabled,
            installmentEditable: edit.dataset.installmentEditable === "true",
            hasRecurrenceIndicator: Boolean(row.querySelector(".recurrence-indicator")),
""",
)
replace_once(
    "scripts/statement-visual/issue-539-operational-installments.mjs",
    """        focusName: document.activeElement?.name || "",
        globalOverflow: document.documentElement.scrollWidth > window.innerWidth,
""",
    """        focusName: document.activeElement?.name || "",
        reasonText: form.querySelector("[data-installment-reason]")?.textContent || "",
        saveHidden: Boolean(form.querySelector('.save-row button[type="submit"]')?.hidden),
        descriptionValue: form.description.value,
        reloadVisible: Boolean(form.querySelector("[data-installment-reload]")),
        globalOverflow: document.documentElement.scrollWidth > window.innerWidth,
""",
)
replace_once(
    "scripts/statement-visual/issue-539-operational-installments.mjs",
    """    const accountInstallment = accountInstallments.find(
      (item) => item.dueOn === "2026-07-05" && item.transaction?.id,
    );
    await request("/api/categories/" + category.id + "/archive", "POST");
""",
    """    const accountInstallment = accountInstallments.find(
      (item) => item.dueOn === "2026-07-05" && item.transaction?.id,
    );
    const blockedAccountInstallment = accountInstallments.find(
      (item) => item.dueOn === "2026-08-05" && item.transaction?.id,
    );
    const conflictAccountInstallment = accountInstallments.find(
      (item) => item.dueOn === "2026-09-05" && item.transaction?.id,
    );
    if (blockedAccountInstallment?.transaction?.id) {
      await request(
        "/api/transactions/" + blockedAccountInstallment.transaction.id,
        "PATCH",
        { status: "reconciled" },
      );
    }
    await request("/api/categories/" + category.id + "/archive", "POST");
""",
)
replace_once(
    "scripts/statement-visual/issue-539-operational-installments.mjs",
    """    if (!accountInstallment?.transaction?.id || !cardInstallment?.transaction?.invoiceId) {
      throw new Error("Issue 539 fixture did not create linked operational installments");
    }
""",
    """    if (
      !accountInstallment?.transaction?.id ||
      !blockedAccountInstallment?.transaction?.id ||
      !conflictAccountInstallment?.transaction?.id ||
      !cardInstallment?.transaction?.invoiceId
    ) {
      throw new Error("Issue 539 fixture did not create linked operational installments");
    }
""",
)
replace_once(
    "scripts/statement-visual/issue-539-operational-installments.mjs",
    """      accountTransactionId: accountInstallment.transaction.id,
      accountBadge: "Parcela " + accountInstallment.sequenceNumber + " de " + accountInstallment.totalInstallments,
      cardId: card.id,
""",
    """      accountTransactionId: accountInstallment.transaction.id,
      accountBadge: "Parcela " + accountInstallment.sequenceNumber + " de " + accountInstallment.totalInstallments,
      blockedAccountTransactionId: blockedAccountInstallment.transaction.id,
      conflictAccountTransactionId: conflictAccountInstallment.transaction.id,
      conflictAccountOriginalDescription: conflictAccountInstallment.transaction.description,
      cardId: card.id,
""",
)

# Reconcile canonical documentation with the corrected contract.
replace_once(
    "docs/API_INSTALLMENTS.md",
    """dueFrom
dueTo
status
""",
    """dueFrom
dueTo
operationalFrom
operationalTo
status
""",
)
replace_once(
    "docs/API_INSTALLMENTS.md",
    """`dueFrom` e `dueTo` usam `YYYY-MM-DD`. `status` aceita `planned`, `posted`, `reconciled`, `cancelled` ou `all`.

`accountId` filtra parcelas pela transacao vinculada a uma conta. Esse filtro deve ser usado por `/lancamentos` para consultar somente as parcelas do extrato selecionado.
""",
    """`dueFrom`, `dueTo`, `operationalFrom` e `operationalTo` usam `YYYY-MM-DD`. `status` aceita `planned`, `posted`, `reconciled`, `cancelled` ou `all`.

`accountId` filtra parcelas pela transacao vinculada a uma conta. No Extrato, `operationalFrom` e `operationalTo` acompanham a mesma precedencia de data exibida pela linha (`effectiveOn`, `plannedOn`, `occurredOn` e `dueOn` como fallback), inclusive quando a efetivacao ocorreu em mes diferente do vencimento.
""",
)
replace_once(
    "docs/API_INSTALLMENTS.md",
    """- `/lancamentos` executa no máximo uma consulta complementar por renderização, usando `accountId`, `dueFrom`, `dueTo`, `status=all` e o `profileId` ativo quando existir. A associação acontece por `installment.transaction.id` com a linha já renderizada. Falha nessa consulta não impede o carregamento do extrato.
""",
    """- `/lancamentos` executa no máximo uma consulta complementar por renderização, usando `accountId`, `operationalFrom`, `operationalTo`, `status=all` e o `profileId` ativo quando existir. A associação acontece por `installment.transaction.id` com a linha já renderizada. Falha nessa consulta não impede o carregamento do extrato.
""",
)
replace_once(
    "docs/API_INSTALLMENTS.md",
    """- Para `409 INSTALLMENT_EDIT_BLOCKED`, o modal permanece aberto, conserva os valores digitados e permite recarregar o estado atual. O endpoint genérico `PATCH /api/transactions/:transactionId` retorna `409 INSTALLMENT_DIRECT_UPDATE_REQUIRED` quando a transação possui `installmentId`; assim, indisponibilidade ou atraso da consulta complementar da web não libera alteração de valor, datas, conta, situação ou outros campos fora da allowlist.
""",
    """- Para `409 INSTALLMENT_EDIT_BLOCKED`, o modal permanece aberto, conserva os valores digitados e permite recarregar o estado atual. O endpoint genérico `PATCH /api/transactions/:transactionId` retorna `409 INSTALLMENT_DIRECT_UPDATE_REQUIRED` para mutações de dados de uma transação com `installmentId`; a única exceção é o payload exclusivo de `status: posted|reconciled`, usado pela ação operacional existente de conciliar ou desconciliar. Assim, indisponibilidade ou atraso da consulta complementar não libera alteração de valor, datas, conta, descrição, categoria ou outros campos fora do contrato da parcela.
""",
)
replace_once(
    "docs/RECURRENCES_INSTALLMENTS_WEB.md",
    """As telas `/lancamentos` e `/cartoes` enriquecem as linhas já existentes com `Parcela X de Y`, associando o retorno de `/api/installments` por `transaction.id`. A consulta é única por tela/escopo e degradável: indisponibilidade da API de parcelas não bloqueia a lista principal. No Extrato, as ações de edição ficam temporariamente indisponíveis quando a elegibilidade não pode ser consultada; o endpoint genérico de transações também rejeita mutação de lançamento vinculado a parcela canônica, impedindo que a restrição seja contornada.
""",
    """As telas `/lancamentos` e `/cartoes` enriquecem as linhas já existentes com `Parcela X de Y`, associando o retorno de `/api/installments` por `transaction.id`. A consulta é única por tela/escopo e degradável: indisponibilidade da API de parcelas não bloqueia a lista principal. O Extrato usa o período da data operacional exibida, não apenas `dueOn`, e mantém as ações de edição temporariamente indisponíveis quando a elegibilidade não pode ser consultada. O endpoint genérico rejeita mutações de dados da parcela canônica, preservando somente o payload de situação usado para conciliar ou desconciliar.
""",
)
replace_once(
    "docs/WEB_MAINTENANCE_COVERAGE.md",
    """A consulta complementar é limitada a uma chamada por renderização e preserva `profileId`. Falha da consulta não remove nem bloqueia a listagem principal; no Extrato, a edição fica indisponível enquanto a elegibilidade não puder ser confirmada, e a API genérica de transações rejeita qualquer tentativa de contornar o contrato da parcela. Categorias arquivadas são exibidas como valor histórico e não são removidas sem escolha explícita. O modal mantém foco acessível, fechamento por Escape, mensagens em `aria-live` e recuperação explícita de conflito `409`.
""",
    """A consulta complementar é limitada a uma chamada por renderização, preserva `profileId` e usa a data operacional do Extrato. Falha da consulta não remove nem bloqueia a listagem principal; no Extrato, a edição fica indisponível enquanto a elegibilidade não puder ser confirmada, e a API genérica rejeita alterações de dados fora do contrato da parcela. A ação existente de conciliar ou desconciliar continua permitida somente com payload exclusivo de situação. Categorias arquivadas são exibidas como valor histórico e não são removidas sem escolha explícita. O modal mantém foco acessível, fechamento por Escape, mensagens em `aria-live` e recuperação explícita de conflito `409`.
""",
)
replace_once(
    "docs/TRANSACTIONS.md",
    """O Extrato consulta as parcelas canônicas pela conta e pelo período selecionados e associa cada item pela transação vinculada. A linha continua sendo a própria transação; o indicador `Parcela X de Y` não transforma descrições como `1/6` em parcela canônica.
""",
    """O Extrato consulta as parcelas canônicas pela conta e pelo período operacional selecionados e associa cada item pela transação vinculada. A data operacional segue `effectiveOn`, `plannedOn`, `occurredOn` e `dueOn` como fallback, para que uma parcela efetivada em mês diferente do vencimento continue identificada. A linha continua sendo a própria transação; o indicador `Parcela X de Y` não transforma descrições como `1/6` em parcela canônica.
""",
)
replace_once(
    "docs/TRANSACTIONS.md",
    """A edição direta usa o modal de lançamento em modo restrito. Somente `description`, `note` e `categoryId` podem ser enviados ao contrato de parcelas, e `categoryId: null` remove a categoria após escolha explícita de **Sem categoria**. Categoria arquivada vinculada ao lançamento permanece selecionada como referência histórica. Mudanças de valor, datas, conta, tipo, situação, repetição ou redistribuição permanecem fora desse fluxo. O endpoint genérico de transações rejeita atualizações de registros com `installmentId`, de modo que atraso ou falha no enriquecimento da interface não contorna essa restrição.
""",
    """A edição direta usa o modal de lançamento em modo restrito. Somente `description`, `note` e `categoryId` podem ser enviados ao contrato de parcelas, e `categoryId: null` remove a categoria após escolha explícita de **Sem categoria**. Categoria arquivada vinculada ao lançamento permanece selecionada como referência histórica. Mudanças de valor, datas, conta, tipo, situação, repetição ou redistribuição permanecem fora desse fluxo. O endpoint genérico de transações rejeita atualizações de dados de registros com `installmentId`, exceto o payload exclusivo `status: posted|reconciled` usado pela ação operacional de conciliar ou desconciliar.
""",
)
replace_once(
    "docs/STATUS_MATRIX.md",
    """- Nota: parcelas canônicas aparecem incorporadas às linhas de `/lancamentos` e `/cartoes` como `Parcela X de Y`, sem painel ou rota próprios. O Extrato permite alterar somente descrição, observação e categoria quando a parcela está elegível; Cartões mantém a compra como único ponto de manutenção operacional. `/relatorios` continua somente leitura. O modo manual `Repeticao = Parcelado` do Extrato ainda cria várias `Transaction` independentes e não cria `Installment`; essa lacuna permanece explícita e esses registros não são tratados como parcelas canônicas.
""",
    """- Nota: parcelas canônicas aparecem incorporadas às linhas de `/lancamentos` e `/cartoes` como `Parcela X de Y`, sem painel ou rota próprios. O Extrato permite alterar somente descrição, observação e categoria quando a parcela está elegível e preserva a ação operacional de conciliar ou desconciliar por payload exclusivo de situação; Cartões mantém a compra como único ponto de manutenção operacional. O enriquecimento do Extrato acompanha a data operacional exibida, inclusive quando ela diverge de `dueOn`. `/relatorios` continua somente leitura. O modo manual `Repeticao = Parcelado` do Extrato ainda cria várias `Transaction` independentes e não cria `Installment`; essa lacuna permanece explícita e esses registros não são tratados como parcelas canônicas.
""",
)
