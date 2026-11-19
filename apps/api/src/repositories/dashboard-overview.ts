import { addSafeMoneyMinor } from "@solverfin/domain/money";
import { financialTodayInSaoPaulo } from "@solverfin/shared";
import { calculateInvoicePeriod, type TenantContext } from "@solverfin/domain";

import { query } from "../db.js";

export interface DashboardAccountBalance {
  id: string;
  name: string;
  kind: string;
  currency: string;
  balanceMinor: number;
}

export interface DashboardCardSpend {
  id: string;
  name: string;
  currency: string;
  spentMinor: number;
}

export interface DashboardCardAdvice {
  id: string;
  name: string;
  currency: string;
  closingOn: string;
  dueOn: string;
  daysUntilPayment: number;
  recommended: boolean;
}

export interface DashboardPayable {
  id: string;
  source: "transaction" | "invoice";
  description: string;
  currency: string;
  dueOn: string;
  amountMinor: number;
  accountId?: string;
  cardId?: string;
  overdue: boolean;
}

export interface DashboardPayableTotal {
  currency: string;
  amountMinor: number;
  overdueMinor: number;
  count: number;
}

export interface DashboardOverview {
  referenceDate: string;
  purchaseToday: string;
  purchaseOn: string;
  periodStartOn: string;
  periodEndOn: string;
  accountBalances: DashboardAccountBalance[];
  cardSpending: DashboardCardSpend[];
  cardSpendingTotals: { currency: string; amountMinor: number; count: number }[];
  cardAdvice: DashboardCardAdvice[];
  payables: DashboardPayable[];
  payableTotals: DashboardPayableTotal[];
  categoryExpenses: { currency: string; category: string; amountMinor: number }[];
  monthlyTrend: { currency: string; month: string; incomeMinor: number; expensesMinor: number }[];
}

interface AccountRow {
  id: string;
  name: string;
  kind: string;
  currency: string;
  opening: string;
  movement: string;
}
interface CardRow {
  id: string;
  name: string;
  currency: string | null;
  status: string;
  closingDay: number;
  dueDay: number;
  activeInstruments: string;
}
interface SpendRow {
  cardId: string;
  currency: string;
  total: string;
}
interface PayableRow {
  id: string;
  source: "transaction" | "invoice";
  description: string;
  currency: string;
  dueOn: string;
  accountId: string | null;
  cardId: string | null;
  amountMinor: string;
  totalMinor: string;
  overdueMinor: string;
  itemCount: number;
}
interface CategoryRow {
  currency: string;
  category: string;
  total: string;
}
interface TrendRow {
  currency: string;
  month: string;
  kind: string;
  total: string;
}

export function rankCardsForPurchase(
  cards: readonly Pick<
    CardRow,
    "id" | "name" | "currency" | "status" | "closingDay" | "dueDay" | "activeInstruments"
  >[],
  purchaseOn: string,
): DashboardCardAdvice[] {
  const eligible = cards.filter(
    (card) => card.status.toLowerCase() === "active" && Number(card.activeInstruments) > 0,
  );
  const ranked = eligible
    .map((card) => {
      const invoice = calculateInvoicePeriod(card, purchaseOn);
      const daysUntilPayment = Math.round(
        (Date.parse(invoice.dueOn + "T00:00:00Z") - Date.parse(purchaseOn + "T00:00:00Z")) /
          86_400_000,
      );
      return {
        id: card.id,
        name: card.name,
        currency: card.currency?.toUpperCase() ?? "Não informada",
        closingOn: invoice.periodEndOn,
        dueOn: invoice.dueOn,
        daysUntilPayment,
      };
    })
    .sort(
      (a, b) =>
        b.daysUntilPayment - a.daysUntilPayment ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
  const maxDays = ranked[0]?.daysUntilPayment;
  return ranked.map((card) => ({ ...card, recommended: card.daysUntilPayment === maxDays }));
}

export function validateDashboardPurchaseDate(
  input: string | null,
  today: string,
): string | undefined {
  if (input === null || input === "") return today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return undefined;
  const parsed = new Date(input + "T00:00:00Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input)
    return undefined;
  const offsetDays = (parsed.getTime() - Date.parse(today + "T00:00:00Z")) / 86_400_000;
  return offsetDays >= 0 && offsetDays <= 365 ? input : undefined;
}

export async function buildDashboardOverview(
  context: TenantContext,
  purchaseOn: string,
  now: Date = new Date(),
): Promise<DashboardOverview> {
  const referenceDate = now.toISOString().slice(0, 10);
  const purchaseToday = financialTodayInSaoPaulo(now);
  const periodStartOn = referenceDate.slice(0, 7) + "-01";
  const [year, month] = periodStartOn.split("-").map(Number) as [number, number];
  const periodEndOn = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const params = [context.organizationId, context.financialProfileId];
  const [accounts, cards, spending, bills, categories, trends] = await Promise.all([
    query<AccountRow>(
      `with legs as (
         select t."accountId" as "accountId",
                case when t."kind" = 'INCOME' then t."amountMinor"
                     when t."kind" in ('EXPENSE', 'TRANSFER') then -t."amountMinor" else 0 end as amount
           from "Transaction" t
          where t."organizationId" = $1 and t."financialProfileId" = $2
            and t."status" in ('POSTED', 'RECONCILED') and t."effectiveOn" <= $3::date
            and t."effectiveOn" is not null and t."accountId" is not null
         union all
         select t."destinationAccountId", coalesce(t."destinationAmountMinor", t."amountMinor")
           from "Transaction" t
          where t."organizationId" = $1 and t."financialProfileId" = $2
            and t."kind" = 'TRANSFER' and t."status" in ('POSTED', 'RECONCILED')
            and t."effectiveOn" <= $3::date and t."effectiveOn" is not null
            and t."destinationAccountId" is not null
       )
       select a."id", a."name", lower(a."kind") as "kind", upper(a."currency") as "currency",
              a."openingBalanceMinor"::text as "opening",
              coalesce(sum(legs.amount), 0)::text as "movement"
         from "Account" a left join legs on legs."accountId" = a."id"
        where a."organizationId" = $1 and a."financialProfileId" = $2
          and a."status" = 'ACTIVE'
        group by a."id", a."name", a."kind", a."currency", a."openingBalanceMinor"
        order by lower(a."name"), a."id"`,
      [...params, referenceDate],
    ),
    query<CardRow>(
      `select c."id", c."name", upper(c."currency") as "currency",
              lower(c."status") as "status", c."closingDay", c."dueDay",
              (select count(*)::text from "CardInstrument" i
                where i."cardId" = c."id" and i."organizationId" = c."organizationId"
                  and i."financialProfileId" = c."financialProfileId" and i."status" = 'ACTIVE'
              ) as "activeInstruments"
         from "Card" c where c."organizationId" = $1 and c."financialProfileId" = $2
           and c."status" = 'ACTIVE' order by lower(c."name"), c."id"`,
      params,
    ),
    query<SpendRow>(
      `select t."cardId", upper(t."currency") as "currency",
              sum(t."amountMinor")::text as "total"
         from "Transaction" t where t."organizationId" = $1 and t."financialProfileId" = $2
           and t."cardId" is not null and t."kind" = 'EXPENSE'
           and t."status" in ('POSTED', 'RECONCILED')
           and t."occurredOn" >= $3::date and t."occurredOn" <= $4::date
           and not exists (select 1 from "Invoice" i
             where i."organizationId" = $1 and i."financialProfileId" = $2
               and i."paymentTransactionId" = t."id")
        group by t."cardId", upper(t."currency")`,
      [...params, periodStartOn, periodEndOn],
    ),
    query<PayableRow>(
      `with commitments as (
         select t."id"::text as "id", 'transaction'::text as "source",
                t."description", upper(t."currency") as "currency",
                t."plannedOn"::date as "dueOn", t."amountMinor" as "amountMinor",
                t."accountId"::text as "accountId", null::text as "cardId"
           from "Transaction" t
          where t."organizationId" = $1 and t."financialProfileId" = $2
            and t."kind" = 'EXPENSE' and t."status" in ('PLANNED','SUGGESTED')
            and t."effectiveOn" is null and t."plannedOn" <= $4::date
            and t."accountId" is not null and t."cardId" is null and t."invoiceId" is null
         union all
         select i."id"::text, 'invoice'::text, c."name",
                upper(i."currency"), i."dueOn"::date, i."totalAmountMinor",
                null::text, i."cardId"::text
           from "Invoice" i join "Card" c on c."id" = i."cardId"
            and c."organizationId" = i."organizationId"
            and c."financialProfileId" = i."financialProfileId"
          where i."organizationId" = $1 and i."financialProfileId" = $2
            and i."status" in ('OPEN', 'CLOSED') and i."dueOn" <= $4::date
       ), ranked as (
         select *, sum("amountMinor") over (partition by "currency")::text as "totalMinor",
           sum(case when "dueOn" < $3::date then "amountMinor" else 0 end)
              over (partition by "currency")::text as "overdueMinor",
           count(*) over (partition by "currency")::int as "itemCount",
           row_number() over (partition by "currency" order by "dueOn", "id") as rn
           from commitments
       )
       select "id", "source", "description", "currency", "dueOn"::text as "dueOn",
              "accountId", "cardId", "amountMinor"::text as "amountMinor",
              "totalMinor", "overdueMinor", "itemCount"
         from ranked where rn <= 10 order by "dueOn", "id"`,
      [...params, referenceDate, periodEndOn],
    ),
    query<CategoryRow>(
      `select upper(t."currency") as "currency",
              coalesce(cat."name", 'Sem categoria') as "category",
              sum(t."amountMinor")::text as "total"
         from "Transaction" t
         left join "Category" cat on cat."id" = t."categoryId"
           and cat."organizationId" = t."organizationId"
           and cat."financialProfileId" = t."financialProfileId"
        where t."organizationId" = $1 and t."financialProfileId" = $2
          and t."kind" = 'EXPENSE' and t."status" in ('POSTED', 'RECONCILED')
          and t."occurredOn" >= $3::date and t."occurredOn" <= $4::date
          and not exists (select 1 from "Invoice" i
            where i."organizationId" = $1 and i."financialProfileId" = $2
              and i."paymentTransactionId" = t."id")
        group by upper(t."currency"), cat."name"
        order by "currency", sum(t."amountMinor") desc`,
      [...params, periodStartOn, periodEndOn],
    ),
    query<TrendRow>(
      `select upper(t."currency") as "currency",
              to_char(date_trunc('month', t."occurredOn"), 'YYYY-MM') as "month",
              t."kind", sum(t."amountMinor")::text as "total"
         from "Transaction" t
        where t."organizationId" = $1 and t."financialProfileId" = $2
          and t."kind" in ('INCOME', 'EXPENSE') and t."status" in ('POSTED', 'RECONCILED')
          and t."occurredOn" >= ($3::date - interval '5 months')
          and t."occurredOn" < ($4::date + interval '1 day')
          and not exists (select 1 from "Invoice" i
            where i."organizationId" = $1 and i."financialProfileId" = $2
              and i."paymentTransactionId" = t."id")
        group by upper(t."currency"), date_trunc('month', t."occurredOn"), t."kind"
        order by "currency", "month"`,
      [...params, periodStartOn, periodEndOn],
    ),
  ]);

  const cardNames = new Map(cards.map((card) => [card.id, card]));
  const spends = spending.filter((row) => cardNames.has(row.cardId));
  const cardSpending = cards
    .flatMap((card) => {
      const currencies = card.currency
        ? [card.currency]
        : [...new Set(spends.filter((row) => row.cardId === card.id).map((row) => row.currency))];
      return currencies.map((currency) => ({
        id: card.id,
        name: card.name,
        currency,
        spentMinor: addSafeMoneyMinor(
          spends
            .filter((row) => row.cardId === card.id && row.currency === currency)
            .map((row) => row.total),
          "dashboard card spending",
        ),
      }));
    })
    .sort((a, b) => b.spentMinor - a.spentMinor || a.name.localeCompare(b.name));
  const cardSpendingTotals = [...new Set(cardSpending.map((card) => card.currency))]
    .sort((a, b) => a.localeCompare(b))
    .map((currency) => ({
      currency,
      amountMinor: addSafeMoneyMinor(
        cardSpending.filter((card) => card.currency === currency).map((card) => card.spentMinor),
        "dashboard monthly card spending total",
      ),
      count: cardSpending.filter((card) => card.currency === currency).length,
    }));
  const seenTotals = new Set<string>();
  const payableTotals: DashboardPayableTotal[] = [];
  for (const bill of bills) {
    if (seenTotals.has(bill.currency)) continue;
    seenTotals.add(bill.currency);
    payableTotals.push({
      currency: bill.currency,
      amountMinor: addSafeMoneyMinor([bill.totalMinor], "dashboard payables"),
      overdueMinor: addSafeMoneyMinor([bill.overdueMinor], "dashboard overdue payables"),
      count: bill.itemCount,
    });
  }

  const monthRows = new Map<
    string,
    { currency: string; month: string; incomeMinor: number; expensesMinor: number }
  >();
  for (const row of trends) {
    const key = row.currency + ":" + row.month;
    const point = monthRows.get(key) ?? {
      currency: row.currency,
      month: row.month,
      incomeMinor: 0,
      expensesMinor: 0,
    };
    const amount = addSafeMoneyMinor([row.total], "dashboard monthly trend");
    if (row.kind === "INCOME") point.incomeMinor = amount;
    if (row.kind === "EXPENSE") point.expensesMinor = amount;
    monthRows.set(key, point);
  }
  return {
    referenceDate,
    purchaseToday,
    purchaseOn,
    periodStartOn,
    periodEndOn,
    accountBalances: accounts.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      currency: row.currency,
      balanceMinor: addSafeMoneyMinor([row.opening, row.movement], "dashboard account balance"),
    })),
    cardSpending,
    cardSpendingTotals,
    cardAdvice: rankCardsForPurchase(cards, purchaseOn),
    payables: bills.map((row) => ({
      id: row.id,
      source: row.source,
      description: row.description,
      currency: row.currency,
      dueOn: row.dueOn,
      amountMinor: addSafeMoneyMinor([row.amountMinor], "dashboard bill"),
      overdue: row.dueOn < referenceDate,
      ...(row.accountId ? { accountId: row.accountId } : {}),
      ...(row.cardId ? { cardId: row.cardId } : {}),
    })),
    payableTotals,
    categoryExpenses: categories.map((row) => ({
      currency: row.currency,
      category: row.category,
      amountMinor: addSafeMoneyMinor([row.total], "dashboard expense category"),
    })),
    monthlyTrend: [...monthRows.values()],
  };
}
