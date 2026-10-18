import {
  renderAlert,
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
import type { CdiIncomeCategory } from "./dialogs.js";
import { escapeHtml } from "./presentation.js";
import { renderAccountsCardsApiFormScript, renderAccountsCardsRuntimeScript } from "./runtime.js";
import { accountsCardsPageStyles } from "./styles.js";
import type { AccountRecord, CreditCardAccountRecord } from "./types.js";
import { buildAccountsCardsPageViewModel } from "./view-model.js";
import type { AccountCdiConfiguration } from "./view-model.js";

interface CdiConfigurationsResponse {
  configurations: AccountCdiConfiguration[];
}

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
  const [accounts, creditCardAccounts, cdiConfigurations] = await Promise.all([
    apiGet<{ accounts: AccountRecord[] }>(token, "/api/accounts?status=all"),
    apiGet<{ creditCardAccounts: CreditCardAccountRecord[] }>(
      token,
      "/api/credit-card-accounts?status=all",
    ),
    apiGet<CdiConfigurationsResponse>(token, "/api/account-remuneration/configurations"),
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
    cdiConfigurations.ok ? cdiConfigurations.data.configurations : [],
    cdiConfigurations.ok,
  );
  let cdiUnavailableNotice = "";
  if (!cdiConfigurations.ok) {
    cdiUnavailableNotice = renderAlert({
      title: "Indicador CDI indisponível",
      description:
        "Não foi possível verificar quais contas têm CDI ativo. Tente atualizar a página.",
      tone: "attention",
    });
  }

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
  const selectedAccountId =
    viewModel.selectedResource?.kind === "account"
      ? viewModel.selectedResource.account.id
      : undefined;
  const selectedCdiConfiguration =
    selectedAccountId && cdiConfigurations.ok
      ? cdiConfigurations.data.configurations.find(
          (configuration) => configuration.accountId === selectedAccountId,
        )
      : undefined;
  const eligibleForCdiSettings =
    viewModel.selectedResource?.kind === "account" &&
    viewModel.selectedResource.account.status === "active" &&
    viewModel.selectedResource.account.currency === "BRL";
  const cdiCategoryResult = eligibleForCdiSettings && cdiConfigurations.ok
    ? await apiGet<{ categories: CdiIncomeCategory[] }>(token, "/api/categories?status=all")
    : undefined;
  const masterDetail = renderDetailLayout({
    masterHtml: renderResourceMaster(viewModel.resources),
    detailHtml: renderSelectedResourceDetail(
      viewModel.selectedResource,
      viewModel.accounts,
      selectedCdiConfiguration,
      cdiConfigurations.ok,
      cdiCategoryResult?.ok ? cdiCategoryResult.data.categories : [],
      cdiCategoryResult?.ok ?? false,
    ),
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
          "Compare contas e cartões por instituição, moeda, saldo inicial e limite. Selecione uma linha para editar ou consultar os detalhes.",
        actionsHtml: headerActions,
      })}${loading}${cdiUnavailableNotice}${cdiCategoryResult && !cdiCategoryResult.ok ? renderAlert({ title: "Configuração CDI indisponível", description: "Não foi possível carregar categorias de receita. Atualize a página para configurar os parâmetros.", tone: "attention" }) : ""}<div data-accounts-cards-archetype="A3">${masterDetail}</div>${renderAccountDialog()}${renderCardDialog(viewModel.accounts)}${renderConfirmationDialog()}${renderSolverFinUiInteractionsScriptTag()}${renderAccountsCardsApiFormScript()}${renderAccountsCardsRuntimeScript()}`,
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
