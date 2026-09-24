import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { closePool } from "./db.js";
import { handleMvpApiRequest } from "./mvp.js";
import { createAccountForContext } from "./repositories/accounts.js";
import { buildFinancialSummary } from "./repositories/dashboard.js";
import {
  createTransactionForContext,
  voidTransactionForContext,
} from "./repositories/transactions.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

const CONTEXT: TenantContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333331",
  financialProfileKind: "personal",
  userId: "11111111-1111-4111-8111-111111111111",
};
const REFERENCE_DATE = "2037-11-10";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for the integration test.");
  const token = await loginAndReadToken();
  const suffix = `${Date.now().toString(36)}${process.pid.toString(36)}`;
  const brl = await createAccountForContext(CONTEXT, {
    name: `Projection BRL ${suffix}`,
    kind: "checking",
    currency: "BRL",
    openingBalanceMinor: 100_000,
  });
  const usd = await createAccountForContext(CONTEXT, {
    name: `Projection USD ${suffix}`,
    kind: "checking",
    currency: "USD",
    openingBalanceMinor: 20_000,
  });

  await createTransactionForContext(CONTEXT, {
    accountId: brl.id,
    kind: "expense",
    status: "posted",
    amountMinor: 10_000,
    currency: "BRL",
    occurredOn: REFERENCE_DATE,
    plannedOn: REFERENCE_DATE,
    effectiveOn: REFERENCE_DATE,
    description: `Reference date expense ${suffix}`,
  });

  const summary = await buildFinancialSummary(
    CONTEXT,
    new Date(`${REFERENCE_DATE}T00:00:00.000Z`),
  );
  const baselineBrl = financialSummaryBlock(summary, "BRL").availableBalanceMinor;
  const baselineUsd = financialSummaryBlock(summary, "USD").availableBalanceMinor;

  const transfer = await createTransactionForContext(CONTEXT, {
    accountId: brl.id,
    destinationAccountId: usd.id,
    kind: "transfer",
    status: "planned",
    amountMinor: 53_832,
    destinationAmountMinor: 10_000,
    currency: "BRL",
    occurredOn: "2037-11-11",
    plannedOn: "2037-11-11",
    description: `Projection cross currency ${suffix}`,
  });

  const projection30 = await getProjection(token, 30);
  const projection60 = await getProjection(token, 60);
  const projection90 = await getProjection(token, 90);
  const brl30 = projectionBlock(projection30, "BRL");
  const usd30 = projectionBlock(projection30, "USD");

  assert.equal(projection30.referenceDate, REFERENCE_DATE);
  assert.equal(projection30.from, "2037-11-11");
  assert.equal(projection30.to, "2037-12-10");
  assert.equal(brl30.points.length, 30);
  assert.equal(projectionBlock(projection60, "BRL").points.length, 60);
  assert.equal(projectionBlock(projection90, "BRL").points.length, 90);
  assert.equal(brl30.openingBalanceMinor, baselineBrl);
  assert.equal(usd30.openingBalanceMinor, baselineUsd);

  const brlMovement = findMovement(brl30, `transaction:${transfer.id}`);
  const usdMovement = findMovement(usd30, `transaction:${transfer.id}`);
  assert.equal(brlMovement.amountMinor, -53_832);
  assert.equal(brlMovement.currency, "BRL");
  assert.equal(usdMovement.amountMinor, 10_000);
  assert.equal(usdMovement.currency, "USD");
  assert.equal(brlMovement.commitmentId, usdMovement.commitmentId);
  assert.equal(brl30.points[0]?.closingBalanceMinor, baselineBrl - 53_832);
  assert.equal(usd30.points[0]?.closingBalanceMinor, baselineUsd + 10_000);

  await voidTransactionForContext(CONTEXT, transfer.id);
  const afterVoid = await getProjection(token, 30);
  assert.equal(
    afterVoid.currencyBlocks.some((block) =>
      block.points.some((point) =>
        point.movements.some(
          (movement) => movement.commitmentId === `transaction:${transfer.id}`,
        ),
      ),
    ),
    false,
  );

  const invalid = await apiRequest(
    token,
    "GET",
    `/api/cash-flow-projection?referenceDate=${REFERENCE_DATE}&horizonDays=45`,
  );
  assert.equal(invalid.statusCode, 400);
  assert.equal(readErrorCode(invalid), "CASH_FLOW_PROJECTION_HORIZON_INVALID");
}

async function getProjection(token: string, horizonDays: number): Promise<ApiCashFlowProjection> {
  const response = await apiRequest(
    token,
    "GET",
    `/api/cash-flow-projection?referenceDate=${REFERENCE_DATE}&horizonDays=${horizonDays}`,
  );
  assert.equal(response.statusCode, 200);
  return readBody<ApiCashFlowProjection>(response);
}

async function loginAndReadToken(): Promise<string> {
  const response = await handleMvpApiRequest({
    method: "POST",
    path: "/api/session",
    body: {
      email: "demo@solverfin.example.invalid",
      password: "SolverFinDemo!2026",
    },
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ session: { token: string } }>(response).session.token;
}

async function apiRequest(token: string, method: string, path: string): Promise<ApiResponse> {
  const url = new URL(path, "http://solverfin.integration.test");
  const request: ApiRequest = {
    method,
    pathname: url.pathname,
    query: url.searchParams,
    headers: { authorization: `Bearer ${token}` },
    body: undefined,
  };
  const response = await handleApiRequest(request);
  assert.ok(response, `${method} ${path} should be handled by the API router`);
  return response;
}

function financialSummaryBlock(
  summary: Awaited<ReturnType<typeof buildFinancialSummary>>,
  currency: string,
) {
  const result = summary.currencyBlocks.find((block) => block.currency === currency);
  assert.ok(result, `expected financial summary block ${currency}`);
  return result;
}

function projectionBlock(projection: ApiCashFlowProjection, currency: string) {
  const result = projection.currencyBlocks.find((block) => block.currency === currency);
  assert.ok(result, `expected cash flow projection block ${currency}`);
  return result;
}

function findMovement(
  block: ApiCashFlowProjection["currencyBlocks"][number],
  commitmentId: string,
) {
  const movement = block.points
    .flatMap((point) => point.movements)
    .find((candidate) => candidate.commitmentId === commitmentId);
  assert.ok(movement, `expected movement ${commitmentId}`);
  return movement;
}

function readBody<TBody>(response: Pick<ApiResponse, "body">): TBody {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);
  return response.body as TBody;
}

function readErrorCode(response: ApiResponse): string | undefined {
  return readBody<{ error?: { code?: string } }>(response).error?.code;
}

interface ApiCashFlowProjection {
  referenceDate: string;
  from: string;
  to: string;
  currencyBlocks: Array<{
    currency: string;
    openingBalanceMinor: number;
    closingBalanceMinor: number;
    points: Array<{
      date: string;
      closingBalanceMinor: number;
      movements: Array<{
        commitmentId: string;
        amountMinor: number;
        currency: string;
      }>;
    }>;
  }>;
}
