import { apiGet } from "../api.js";
import { icon } from "../icons.js";
import { renderAuthenticatedShellDocument } from "../shell.js";
import {
  renderAccountItem,
  renderCardItem,
  renderEmptyState,
  renderFilterEmptyState,
} from "./components.js";
import { renderAccountDialog, renderCardDialog } from "./dialogs.js";
import { escapeHtml } from "./presentation.js";
import {
  renderAccountsCardsApiFormScript,
  renderAccountsCardsRuntimeScript,
} from "./runtime.js";
import { accountsCardsPageStyles } from "./styles.js";
import type { AccountRecord, CreditCardAccountRecord } from "./types.js";
import { buildAccountsCardsPageViewModel } from "./view-model.js";

export async function renderAccountsCardsPage(token: string): Promise<string> {
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
  );
  const accountsHtml =
    viewModel.accounts.map(renderAccountItem).join("") ||
    renderEmptyState(
      "Nenhuma conta cadastrada.",
      "Crie uma conta para iniciar saldos e lançamentos.",
    );
  const cardsHtml =
    viewModel.cards.map((card) => renderCardItem(card, viewModel.accounts)).join("") ||
    renderEmptyState(
      "Nenhum cartão cadastrado.",
      "Crie um cartão agrupador com ao menos um instrumento ativo para começar.",
    );
  const connectionsHtml = renderEmptyState(
    "Conexões ficam para uma próxima etapa.",
    "Esta tela está preparada para receber integrações quando houver suporte, sem prometer automação bancária direta.",
  );

  return renderAuthenticatedPage({
    pathname: "/contas-cartoes",
    currentLabel: "Contas e Cartões",
    content: `
      <section class="master-heading">
        <div>
          <p class="eyebrow">Cadastros financeiros</p>
          <h1>Contas e Cartões</h1>
          <p class="muted">Mantenha contas, dinheiro, investimentos e cartões em um único cadastro mestre.</p>
        </div>
        <div class="master-actions" aria-label="Ações principais">
          <button type="button" data-open-dialog="new-account-dialog" title="Adicionar nova conta">${icon("plus", 14)} Adicionar conta</button>
          <button type="button" data-open-dialog="new-card-dialog" title="Adicionar novo cartão">${icon("plus", 14)} Adicionar cartão</button>
        </div>
      </section>

      <section class="master-toolbar" aria-label="Filtros da lista">
        <div class="tab-list" role="tablist" aria-label="Tipo de cadastro">
          <button id="accounts-tab" type="button" role="tab" class="tab-button" data-tab="accounts" aria-controls="accounts-panel" aria-selected="true">Contas bancárias <span>${viewModel.accounts.length}</span></button>
          <button id="cards-tab" type="button" role="tab" class="tab-button" data-tab="cards" aria-controls="cards-panel" aria-selected="false">Cartões de crédito <span>${viewModel.cards.length}</span></button>
          <button id="connections-tab" type="button" role="tab" class="tab-button" data-tab="connections" aria-controls="connections-panel" aria-selected="false">Conexões</button>
        </div>
        <div class="filter-row">
          <label>Buscar<input data-master-search type="search" placeholder="Nome, instituição, bandeira ou instrumento" /></label>
          <label>Status
            <select data-master-status>
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          </label>
        </div>
      </section>

      <section id="accounts-panel" class="master-panel" data-tab-panel="accounts" role="tabpanel" aria-labelledby="accounts-tab">
        <div class="section-heading">
          <div>
            <h2>Contas bancárias</h2>
            <p class="muted">Use para saldos, extrato, dinheiro, aplicações e contas de pagamento.</p>
          </div>
          <span>${viewModel.activeAccountCount} ativas</span>
        </div>
        <div class="master-list" data-master-list>
          ${accountsHtml}
        </div>
        ${renderFilterEmptyState("Nenhuma conta encontrada.")}
      </section>

      <section id="cards-panel" class="master-panel" data-tab-panel="cards" role="tabpanel" aria-labelledby="cards-tab" hidden>
        <div class="section-heading">
          <div>
            <h2>Cartões de crédito</h2>
            <p class="muted">Cadastre o cartão agrupador e acompanhe os instrumentos internos usados nas compras.</p>
          </div>
          <span>${viewModel.activeCardCount} ativos</span>
        </div>
        <div class="master-list" data-master-list>
          ${cardsHtml}
        </div>
        ${renderFilterEmptyState("Nenhum cartão encontrado.")}
      </section>

      <section id="connections-panel" class="master-panel" data-tab-panel="connections" role="tabpanel" aria-labelledby="connections-tab" hidden>
        ${connectionsHtml}
      </section>

      ${renderAccountDialog()}
      ${renderCardDialog(viewModel.accounts)}
      ${renderAccountsCardsApiFormScript()}
      ${renderAccountsCardsRuntimeScript()}
    `,
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
    content: `
      <section class="master-panel placeholder-state">
        <p class="eyebrow">Erro ao carregar dados</p>
        <h1>${escapeHtml(currentLabel)}</h1>
        <p class="error" role="alert">${escapeHtml(error)}</p>
        <a class="button-link" href="${escapeHtml(pathname)}">Tentar novamente</a>
      </section>
    `,
  });
}
