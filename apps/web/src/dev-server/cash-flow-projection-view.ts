import { formatDateOnly } from "@solverfin/shared";

import { renderMoney } from "../design-system/money.js";
import { apiGet } from "./api.js";
import {
  escapeReportHtml as escapeHtml,
  renderReportHeading as renderHeading,
  renderReportState as renderState,
  renderReportsShell as renderShell,
  renderReportViewNavigation as renderViewNavigation,
} from "./reports-route-page-shared.js";

interface CashFlowProjectionMovement {
  commitmentId: string;
  effectId: string;
  description: string;
  source: {
    kind: "transaction" | "invoice" | "recurrence_projection" | "payable_receivable";
    id: string;
  };
  amountMinor: number;
  currency: string;
  accountId?: string;
  cardId?: string;
}
interface CashFlowProjectionPoint {
  date: string;
  netMovementMinor: number;
  closingBalanceMinor: number;
  movements: CashFlowProjectionMovement[];
}
interface CashFlowProjectionCurrencyBlock {
  currency: string;
  openingBalanceMinor: number;
  closingBalanceMinor: number;
  points: CashFlowProjectionPoint[];
}
interface CashFlowProjection {
  referenceDate: string;
  horizonDays: 30 | 60 | 90;
  from: string;
  to: string;
  currencyBlocks: CashFlowProjectionCurrencyBlock[];
}
interface CashFlowFilters {
  referenceDate: string;
  horizonDays: 30 | 60 | 90;
  profileId?: string;
}

export async function renderCashFlowProjectionView(
  token: string,
  url: URL,
  referenceDate: Date,
): Promise<string> {
  const draftReferenceDate =
    url.searchParams.get("referenceDate") ?? referenceDate.toISOString().slice(0, 10);
  const draftHorizon = url.searchParams.get("horizonDays") ?? "30";
  const profileId = url.searchParams.get("profileId") ?? undefined;
  const heading = renderHeading(
    "Projeção de caixa",
    "Acompanhe o saldo projetado dia a dia, sempre separado por moeda.",
  );
  const navigation = renderViewNavigation("cash-flow", profileId);

  let filters: CashFlowFilters;
  try {
    filters = {
      referenceDate: parseReferenceDate(draftReferenceDate),
      horizonDays: parseHorizon(draftHorizon),
      ...(profileId ? { profileId } : {}),
    };
  } catch (error) {
    return renderShell(
      heading +
        navigation +
        renderFilters(draftReferenceDate, draftHorizon, profileId) +
        renderState(
          "filter-error",
          "Revise os filtros",
          error instanceof Error ? error.message : "Os filtros informados são inválidos.",
        ),
    );
  }

  const result = await apiGet<CashFlowProjection>(token, buildApiPath(filters));
  if (!result.ok) {
    return renderShell(
      heading +
        navigation +
        renderFilters(filters.referenceDate, String(filters.horizonDays), filters.profileId) +
        renderState(
          "api-error",
          "Não foi possível carregar a projeção",
          `${result.error} Tente novamente antes de tomar uma decisão financeira.`,
        ),
    );
  }

  const projection = result.data;
  if (projection.currencyBlocks.length === 0) {
    return renderShell(
      heading +
        navigation +
        renderFilters(filters.referenceDate, String(filters.horizonDays), filters.profileId) +
        renderState(
          "empty",
          "Nenhuma posição financeira disponível",
          "Cadastre uma conta ou compromisso para iniciar a projeção deste perfil.",
        ),
    );
  }

  return renderShell(
    heading +
      navigation +
      renderFilters(filters.referenceDate, String(filters.horizonDays), filters.profileId) +
      `<div data-report-state="ready" class="cash-flow-report-list">${projection.currencyBlocks
        .map((block) => renderCurrencyBlock(projection, block))
        .join("")}</div>`,
  );
}

function renderFilters(referenceDate: string, horizonDays: string, profileId?: string): string {
  return `
    <section class="panel report-filter-panel">
      <form class="report-filters cash-flow-filters" method="get" action="/relatorios">
        <input type="hidden" name="view" value="cash-flow">
        ${profileId ? `<input type="hidden" name="profileId" value="${escapeHtml(profileId)}">` : ""}
        <label>Data de referência
          <input type="date" name="referenceDate" value="${escapeHtml(referenceDate)}" required>
        </label>
        <label>Horizonte
          <select name="horizonDays">
            ${[30, 60, 90]
              .map(
                (days) =>
                  `<option value="${days}"${String(days) === horizonDays ? " selected" : ""}>${days} dias</option>`,
              )
              .join("")}
          </select>
        </label>
        <button type="submit">Atualizar projeção</button>
      </form>
      <p class="filter-hint">A data de referência compõe o saldo inicial; a série começa no dia seguinte.</p>
    </section>
  `;
}

function renderCurrencyBlock(
  projection: CashFlowProjection,
  block: CashFlowProjectionCurrencyBlock,
): string {
  const key = escapeHtml(block.currency.toLowerCase());
  return `
    <section class="report-analysis-block cash-flow-block" id="cash-flow-${key}" aria-labelledby="cash-flow-title-${key}">
      <div class="report-analysis-heading">
        <div>
          <p class="eyebrow">Moeda</p>
          <h2 id="cash-flow-title-${key}">${escapeHtml(block.currency)}</h2>
          <p class="muted">${projection.horizonDays} dias, de ${escapeHtml(formatDateOnly(projection.from))} a ${escapeHtml(formatDateOnly(projection.to))}.</p>
        </div>
        <span>Referência: ${escapeHtml(formatDateOnly(projection.referenceDate))}</span>
      </div>
      <div class="cash-flow-summary-grid" aria-label="Resumo projetado em ${escapeHtml(block.currency)}">
        <article class="report-summary-metric" data-tone="information">
          <span>Saldo inicial</span>
          <strong>${renderMoney({ amountMinor: block.openingBalanceMinor, currency: block.currency })}</strong>
        </article>
        <article class="report-summary-metric" data-tone="information">
          <span>Saldo no fim do horizonte</span>
          <strong>${renderMoney({ amountMinor: block.closingBalanceMinor, currency: block.currency })}</strong>
        </article>
      </div>
      <div class="report-analysis-layer report-detail-layer">
        <div class="report-layer-heading">
          <p class="eyebrow">Detalhe diário</p>
          <h3>Série contínua</h3>
          <p class="muted">Dias sem movimento repetem o saldo anterior. Os valores abaixo vêm prontos do cálculo canônico.</p>
        </div>
        <div class="evolution-table-scroll" tabindex="0" aria-label="Projeção diária em ${escapeHtml(block.currency)}">
          <table class="cash-flow-table">
            <thead><tr><th scope="col">Data</th><th scope="col">Movimento líquido</th><th scope="col">Saldo projetado</th><th scope="col">Evidências</th></tr></thead>
            <tbody>${block.points.map((point) => renderPoint(point, block.currency)).join("")}</tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

function renderPoint(point: CashFlowProjectionPoint, currency: string): string {
  return `
    <tr>
      <th scope="row"><time datetime="${escapeHtml(point.date)}">${escapeHtml(formatDateOnly(point.date))}</time></th>
      <td>${renderMoney({ amountMinor: point.netMovementMinor, currency })}</td>
      <td><strong>${renderMoney({ amountMinor: point.closingBalanceMinor, currency })}</strong></td>
      <td class="cash-flow-evidence-cell">${renderEvidence(point.movements, currency)}</td>
    </tr>
  `;
}

function renderEvidence(movements: readonly CashFlowProjectionMovement[], currency: string): string {
  if (movements.length === 0) return '<span class="muted">Sem movimento</span>';
  return movements
    .map((movement) => {
      const href = evidenceHref(movement, currency);
      return `<div class="cash-flow-evidence" data-commitment-id="${escapeHtml(movement.commitmentId)}"><span><strong>${escapeHtml(movement.description)}</strong><small>${sourceLabel(movement.source.kind)}</small></span>${
        href ? `<a class="text-link" href="${escapeHtml(href)}">Ver origem</a>` : ""
      }</div>`;
    })
    .join("");
}

function evidenceHref(movement: CashFlowProjectionMovement, currency: string): string | undefined {
  if (movement.source.kind === "invoice" || movement.cardId) return "/cartoes";
  if (!movement.accountId) return undefined;
  const query = new URLSearchParams({ currency, accountId: movement.accountId, evidence: "planned" });
  return `/lancamentos?${query.toString()}`;
}
function sourceLabel(kind: CashFlowProjectionMovement["source"]["kind"]): string {
  switch (kind) {
    case "invoice": return "Fatura prevista";
    case "recurrence_projection": return "Recorrência prevista";
    case "payable_receivable": return "Compromisso financeiro";
    case "transaction": return "Lançamento planejado";
  }
}
function buildApiPath(filters: CashFlowFilters): string {
  const query = new URLSearchParams({
    referenceDate: filters.referenceDate,
    horizonDays: String(filters.horizonDays),
  });
  if (filters.profileId) query.set("profileId", filters.profileId);
  return `/api/cash-flow-projection?${query.toString()}`;
}
function parseReferenceDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Informe uma data de referência válida.");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("Informe uma data de referência válida.");
  }
  return value;
}
function parseHorizon(value: string): 30 | 60 | 90 {
  const parsed = Number(value);
  if (parsed !== 30 && parsed !== 60 && parsed !== 90) {
    throw new Error("Escolha um horizonte de 30, 60 ou 90 dias.");
  }
  return parsed;
}
