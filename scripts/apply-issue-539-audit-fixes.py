from __future__ import annotations

import re
from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


def sub_once(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{path}: pattern matched {count} times: {pattern[:100]}")
    write(path, updated)


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one replacement, found {count}")
    write(path, text.replace(old, new, 1))


def patch_backend() -> None:
    sub_once(
        "apps/api/src/repositories/installments.ts",
        r"function resolveEditBlockedReason\(row: Row\): InstallmentEditBlockedReason \| undefined \{.*?\n\}\n\nfunction readNestedId",
        '''export function resolveEditBlockedReason(
  row: Readonly<Record<string, unknown>>,
): InstallmentEditBlockedReason | undefined {
  if (!row.transactionId || !row.transactionStatus) {
    return "linked_transaction_missing";
  }

  if (row.invoiceId) {
    return "invoice_linked";
  }

  if (lower(row.status) !== "planned") {
    return "installment_status_locked";
  }

  if (lower(row.transactionStatus) !== "planned") {
    return "transaction_status_locked";
  }

  return undefined;
}

function readNestedId''',
        re.S,
    )

    write(
        "apps/api/src/repositories/installments-edit-block-reason.test.ts",
        '''import assert from "node:assert/strict";
import test from "node:test";

import { resolveEditBlockedReason } from "./installments.js";

for (const transactionStatus of ["PLANNED", "POSTED", "RECONCILED", "CANCELLED"]) {
  test(`invoice-linked installment takes precedence over ${transactionStatus.toLowerCase()} transaction status`, () => {
    assert.equal(
      resolveEditBlockedReason({
        transactionId: "transaction-demo",
        transactionStatus,
        status: "PLANNED",
        invoiceId: "invoice-demo",
      }),
      "invoice_linked",
    );
  });
}

test("invoice-linked reason takes precedence over a non-planned installment", () => {
  assert.equal(
    resolveEditBlockedReason({
      transactionId: "transaction-demo",
      transactionStatus: "POSTED",
      status: "POSTED",
      invoiceId: "invoice-demo",
    }),
    "invoice_linked",
  );
});

test("non-invoice installments retain status-specific reasons", () => {
  assert.equal(
    resolveEditBlockedReason({
      transactionId: "transaction-demo",
      transactionStatus: "POSTED",
      status: "PLANNED",
    }),
    "transaction_status_locked",
  );
  assert.equal(
    resolveEditBlockedReason({
      transactionId: "transaction-demo",
      transactionStatus: "PLANNED",
      status: "POSTED",
    }),
    "installment_status_locked",
  );
  assert.equal(resolveEditBlockedReason({ status: "PLANNED" }), "linked_transaction_missing");
});
''',
    )


def patch_web() -> None:
    replace_once(
        "apps/web/src/dev-server/operational-installments.ts",
        '''  .installment-details {
    background: #f8fafc;''',
        '''  .installment-badge[data-installment-block-reason] {
    cursor: help;
    position: relative;
  }
  .installment-badge[data-installment-block-reason]::after {
    background: #0f172a;
    border-radius: 8px;
    color: #f8fafc;
    content: attr(data-installment-block-reason);
    display: none;
    font-size: 0.75rem;
    font-weight: 500;
    left: 0;
    line-height: 1.35;
    max-width: min(320px, calc(100vw - 32px));
    padding: 8px 10px;
    position: absolute;
    top: calc(100% + 6px);
    white-space: normal;
    width: max-content;
    z-index: 30;
  }
  .installment-badge[data-installment-block-reason]:hover::after,
  .installment-badge[data-installment-block-reason]:focus-visible::after {
    display: block;
  }
  .installment-assistive-text {
    border: 0;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    height: 1px;
    margin: -1px;
    overflow: hidden;
    padding: 0;
    position: absolute;
    white-space: nowrap;
    width: 1px;
  }
  .installment-details {
    background: #f8fafc;''',
    )

    sub_once(
        "apps/web/src/dev-server/operational-installments.ts",
        r"      function addBadge\(row, installment\) \{.*?\n      \}\n\n      async function fetchInstallments",
        '''      function addBadge(row, installment) {
        const description = row && row.querySelector(".description strong");
        if (!description || description.querySelector('[data-installment-badge="' + installment.id + '"]')) return;
        const label = installmentLabel(installment);
        const reasonText = blockReason(installment.editBlockedReason);
        const badge = document.createElement("span");
        badge.className = "installment-badge";
        badge.dataset.installmentBadge = installment.id;
        badge.textContent = label;
        badge.setAttribute("aria-label", label);
        badge.title = reasonText || label;
        if (reasonText) {
          const reasonId = "installment-block-reason-" + String(installment.id).replace(/[^a-zA-Z0-9_-]/g, "");
          const reason = document.createElement("span");
          reason.className = "installment-assistive-text";
          reason.id = reasonId;
          reason.textContent = reasonText;
          badge.tabIndex = 0;
          badge.dataset.installmentBlockReason = reasonText;
          badge.setAttribute("aria-describedby", reasonId);
          description.appendChild(reason);
        }
        description.appendChild(badge);
      }

      async function fetchInstallments''',
        re.S,
    )

    replace_once(
        "apps/web/src/dev-server/operational-installments.test.ts",
        '''  assert.match(script, /addEventListener\("keydown", keepInstallmentFocusInsideModal\)/);
});''',
        '''  assert.match(script, /addEventListener\("keydown", keepInstallmentFocusInsideModal\)/);
  assert.match(script, /badge\.tabIndex = 0/);
  assert.match(script, /aria-describedby/);
  assert.match(script, /installment-assistive-text/);
  assert.match(script, /installmentBlockReason/);
});''',
    )


def patch_visual_validation() -> None:
    path = "scripts/statement-visual/issue-539-operational-installments.mjs"
    replace_once(
        path,
        '''  check(line.badge === fixture.cardBadge, "Card installment badge is missing", line);
  check(line.purchaseEditEnabled, "Open invoice purchase was incorrectly blocked", line);
  check(!line.hasInstallmentEdit, "Card purchase was redirected to installment PATCH", line);

  await evaluate(''',
        '''  check(line.badge === fixture.cardBadge, "Card installment badge is missing", line);
  check(line.purchaseEditEnabled, "Open invoice purchase was incorrectly blocked", line);
  check(!line.hasInstallmentEdit, "Card purchase was redirected to installment PATCH", line);
  check(
    line.blockReason === "Esta parcela é alterada pela compra da fatura.",
    "Invoice-linked installment exposed the wrong block reason",
    line,
  );
  check(line.badgeTabIndex === 0, "Blocked installment badge is not keyboard focusable", line);
  check(
    line.accessibleDescription === line.blockReason,
    "Blocked installment badge is missing an accessible description",
    line,
  );

  const badgeFocus = await evaluate(
    browser.cdp,
    `(() => {
      const badge = document.querySelector('[data-installment-badge="${fixture.cardInstallmentId}"]');
      badge.focus();
      return {
        focused: document.activeElement === badge,
        tooltipVisible: getComputedStyle(badge, "::after").display !== "none"
      };
    })()`,
  );
  check(badgeFocus.focused, "Blocked installment badge did not receive focus", badgeFocus);
  check(badgeFocus.tooltipVisible, "Block reason tooltip did not open on focus", badgeFocus);

  const installmentState = await evaluate(
    browser.cdp,
    `fetch("/api/installments?installmentId=${fixture.cardInstallmentId}&status=all")
      .then((response) => response.json())
      .then((body) => body.installments[0])`,
  );
  check(
    installmentState.editBlockedReason === "invoice_linked",
    "API did not prioritize invoice_linked for the card purchase",
    installmentState,
  );

  await evaluate(''',
    )

    replace_once(
        path,
        '''          return {
            badge: badge.textContent.trim(),
            purchaseEditEnabled: !edit.disabled,
            hasInstallmentEdit: Boolean(edit.dataset.installmentEdit),
            globalOverflow: document.documentElement.scrollWidth > window.innerWidth
          };''',
        '''          const descriptionId = badge.getAttribute("aria-describedby") || "";
          return {
            badge: badge.textContent.trim(),
            purchaseEditEnabled: !edit.disabled,
            hasInstallmentEdit: Boolean(edit.dataset.installmentEdit),
            blockReason: badge.dataset.installmentBlockReason || "",
            badgeTabIndex: badge.tabIndex,
            accessibleDescription: document.getElementById(descriptionId)?.textContent || "",
            globalOverflow: document.documentElement.scrollWidth > window.innerWidth
          };''',
    )

    replace_once(
        path,
        '''      cardTransactionId: cardInstallment.transaction.id,
      cardBadge: "Parcela " + cardInstallment.sequenceNumber + " de " + cardInstallment.totalInstallments''',
        '''      cardInstallmentId: cardInstallment.id,
      cardTransactionId: cardInstallment.transaction.id,
      cardBadge: "Parcela " + cardInstallment.sequenceNumber + " de " + cardInstallment.totalInstallments''',
    )


def patch_docs() -> None:
    replace_once(
        "docs/API_INSTALLMENTS.md",
        "Parcelas ligadas a fatura, transacao postada/conciliada/cancelada, parcela nao planejada ou sem transacao vinculada nao devem exibir acao de edicao direta. O backend revalida a mesma elegibilidade durante o `PATCH` para cobrir mudancas de estado entre consulta e salvamento.",
        "Parcelas ligadas a fatura, transacao postada/conciliada/cancelada, parcela nao planejada ou sem transacao vinculada nao devem exibir acao de edicao direta. Quando existe `invoiceId`, `invoice_linked` prevalece sobre os bloqueios genericos de situacao porque a manutencao deve ser explicada pelo contrato operacional da compra da fatura. O backend revalida a mesma elegibilidade durante o `PATCH` para cobrir mudancas de estado entre consulta e salvamento.",
    )
    replace_once(
        "docs/CARDS.md",
        "A manutenção continua exclusivamente pelo endpoint da compra. O bloqueio `invoice_linked` pertence ao contrato de edição direta de parcelas e não desabilita, por si só, uma compra que a situação da fatura permite editar. Faturas fechadas, pagas ou canceladas mantêm os bloqueios existentes; vencimento isolado não cria novo bloqueio.",
        "A manutenção continua exclusivamente pelo endpoint da compra. O bloqueio `invoice_linked` pertence ao contrato de edição direta de parcelas, prevalece sobre motivos genéricos de situação da transação e não desabilita, por si só, uma compra que a situação da fatura permite editar. O indicador associa essa explicação por `aria-describedby` e oferece tooltip acionável por hover e foco de teclado. Faturas fechadas, pagas ou canceladas mantêm os bloqueios existentes; vencimento isolado não cria novo bloqueio.",
    )


def cleanup_temporary_files() -> None:
    workflow = Path(".github/workflows/issue-539-apply-audit-fixes.yml")
    if workflow.exists():
        workflow.unlink()

    ci_path = ".github/workflows/ci.yml"
    ci = read(ci_path)
    ci = ci.replace("permissions:\n  contents: write\n", "permissions:\n  contents: read\n", 1)
    ci, count = re.subn(
        r"\n  # ISSUE-539-PATCH-START\n.*?\n  # ISSUE-539-PATCH-END\n",
        "\n",
        ci,
        count=1,
        flags=re.S,
    )
    if count != 1:
        raise RuntimeError("ci.yml: temporary job block not found")
    write(ci_path, ci)

    Path(__file__).unlink()


def main() -> None:
    patch_backend()
    patch_web()
    patch_visual_validation()
    patch_docs()
    cleanup_temporary_files()


if __name__ == "__main__":
    main()
