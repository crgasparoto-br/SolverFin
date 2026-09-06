import {
  renderDetailLayout,
  renderDialogTrigger,
  renderLoading,
  renderPageContainer,
  renderPageHeader,
  renderRecoverableError,
  renderSolverFinUiInteractionsScriptTag,
} from "../../design-system/primitives.js";
import { apiGet } from "../api.js";
import { renderAuthenticatedShellDocument } from "../shell.js";
import {
  renderConfirmationDialog,
  renderResourceMaster,
  renderSelectedResourceDetail,
} from "./components.js";
import { renderAccountDialog, renderCardDialog } from "./dialogs.js";
import { escapeHtml } from "./presentation.js";
import { renderAccountsCardsApiFormScript, renderAccountsCardsRuntimeScript } from "./runtime.js";
import { accountsCardsPageStyles } from "./styles.js";
import type { AccountRecord, CreditCardAccountRecord } from "./types.js";
import { buildAccountsCardsPageViewModel } from "./view-model.js";

function renderHeaderDialogTrigger(input: {
  dialogId: string;
  label: string;
  className: string;
  variant?: "primary" | "secondary";
}): string {
  // data-open-dialog remains only as a stable visual-evidence selector. Interaction is owned by
  // data-sf-dialog-open from renderDialogTrigger and the shared Phase 3B controller.
  return renderDialogTrigger(input).replace(
    "<button ",
    `<button data-open-dialog="${escapeHtml(input.dialogId)}" `,
  );
}

export async function renderAccountsCardsPage(token: string, url?: URL): Promise<string> {
  const [accounts, creditCardAccounts] = await Promise.all([
    apiGet<{ accounts: AccountRecord[] }>(token, "/api/accounts?status=all"),
    apiGet<{ creditCardAccounts: CreditCardAccountRecord[] }>(
      token,
      "/api/credit-card-accounts?status=all",
    ),
  ]);

  if (!accounts.ok) {
    return renderApiErrorPage("/contas-cartoes", "Contas e Cartões", accounts.error);
  }
  if (!creditCardAccounts.ok) {
    return renderApiErrorPage("/contas-cartoes", "Contas e Cartões", creditCardAccounts.error);
  }

  const viewModel = buildAccountsCardsPageViewModel(
    accounts.data.accounts,
    creditCardAccounts.data.creditCardAccounts,
    url?.searchParams.get("resource"),
  );

  const headerActions = [
    renderHeaderDialogTrigger({
      dialogId: "new-account-dialog",
      label: "Adicionar conta",
      className: "resource-primary-action",
    }),
    renderHeaderDialogTrigger({
      dialogId: "new-card-dialog",
      label: "Adicionar cartão",
      className: "secondary-button",
      variant: "secondary",
    }),
  ].join("");
  const masterDetail = renderDetailLayout({
    masterHtml: renderResourceMaster(viewModel.resources),
    detailHtml: renderSelectedResourceDetail(viewModel.selectedResource, viewModel.accounts),
  });
  const loading = `<div data-resource-loading hidden>${renderLoading({ title: "Atualizando cadastro", description: "Aguarde enquanto a alteração é salva." })}</div>`;

  return renderAuthenticatedPage({
    pathname: "/contas-cartoes",
    currentLabel: "Contas e Cartões",
    content: renderPageContainer({
      className: "accounts-cards-a3-page",
      childrenHtml: `${renderPageHeader({
        eyebrow: "Cadastros financeiros",
        title: "Contas e cartões",
        description:
          "Selecione um recurso para consultar contexto, moeda, instrumentos e ações de manutenção sem perder a listagem.",
        actionsHtml: headerActions,
      })}${loading}<div data-accounts-cards-archetype="A3">${masterDetail}</div>${renderAccountDialog()}${renderCardDialog(viewModel.accounts)}${renderConfirmationDialog()}${renderSolverFinUiInteractionsScriptTag()}${renderAccountsCardsApiFormScript()}${renderAccountsCardsRuntimeScript()}`,
    }),
  });
}

function renderAuthenticatedPage(input: {
  pathname: string;
  currentLabel: string;
  content: string;
}): string {
  return renderAuthenticatedShellDocument({
    activePathname: input.pathname,
    content: input.content,
    currentLabel: input.currentLabel,
    styles: accountsCardsPageStyles(),
  });
}

function renderApiErrorPage(pathname: string, currentLabel: string, error: string): string {
  return renderAuthenticatedPage({
    pathname,
    currentLabel,
    content: renderPageContainer({
      className: "accounts-cards-a3-page",
      childrenHtml: renderRecoverableError({
        title: `Não foi possível carregar ${currentLabel.toLowerCase()}`,
        description: error,
        actionHtml: `<a class="button-link" href="${escapeHtml(pathname)}">Tentar novamente</a>`,
      }),
    }),
  });
}
