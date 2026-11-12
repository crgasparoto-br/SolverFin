# Frontend view-model/presenter boundary

This document defines the frontend boundary introduced by issue #603 for SSR screens in `apps/web/src/dev-server`.

## Purpose

Renderers must consume an explicit screen view-model instead of raw domain or API payloads. The boundary keeps presentation concerns in the frontend without making the frontend a second source of truth for financial rules.

The flow is:

```text
API/domain contract -> screen loader -> presenter -> ScreenViewModel -> renderer
```

The presenter may map labels, select records for display, order presentation data, and build navigation copy. It must not recompute balances, invoice totals, budgets, exchange values, or other financial values that belong to the domain/API contract.

## Canonical screen contract

`apps/web/src/dev-server/screen-view-model.ts` defines the reusable contract:

- `ScreenViewModel<TContent>` is a discriminated union with `loading`, `success`, `empty`, and `error` states;
- every state carries `ScreenViewContext`;
- `ScreenViewContext.filters` preserves the filters that produced the screen;
- `ScreenViewContext.provenance` identifies the domain/API sources and whether each source was available;
- `MoneyViewModel` always carries both `amountMinor` and `currency`.

A renderer must switch on `model.status`. It must not infer states from nullable payloads or sentinel monetary values.

## Monetary values

Presenters must map canonical monetary values without arithmetic:

```ts
const amount: MoneyViewModel = {
  amountMinor: apiValue.amountMinor,
  currency: apiValue.currency,
};
```

Formatting for locale is a renderer concern. Financial calculation is not. A renderer may call `formatMinorCurrency(amount.amountMinor, { currency: amount.currency })`, but it must not add, subtract, aggregate, prorate, convert, or otherwise reinterpret financial values.

If an upstream contract does not provide the currency required to create a `MoneyViewModel`, fix or adapt the upstream contract before migrating that monetary field. Do not silently assume BRL inside a presenter.

## Data provenance and degraded sources

Each source used to build a screen should be represented in `context.provenance` with:

- `source`: `api` or `domain`;
- `resource`: stable resource/contract identifier;
- `availability`: `available` or `unavailable`.

A mandatory source failure should normally produce the typed `error` state. Optional sources may degrade to a successful screen only when the existing product contract already permits that behavior; their unavailable status must remain visible in provenance.

## Pilot adoption

The Dashboard is the first integration of the boundary:

- `dashboard-page.ts` loads transport data and renders only `DashboardScreenViewModel`;
- `dashboard-presenter.ts` maps API contracts into presentation-only data;
- financial summary amounts are copied exactly from `/api/financial-summary` and remain currency-aware;
- optional action sources preserve the current degraded behavior and are recorded in provenance.

The broader pilot sequence remains Dashboard -> Extrato -> Cartões as defined by ADR 0014 and epic #591. Migrating Extrato or Cartões must not move their legacy financial calculations into a presenter. Those screens should adopt this boundary only after the relevant canonical domain/API contract supplies the financial values needed by the renderer.

## Migration checklist

1. Identify the canonical domain/API contracts used by the screen.
2. Confirm every monetary field has an explicit currency upstream.
3. Define a screen-specific content view-model composed from the shared `ScreenViewModel` and `MoneyViewModel` contracts.
4. Keep transport calls in the screen loader and mapping/selection in a pure presenter.
5. Copy canonical financial values into the view-model without arithmetic or fallback calculations.
6. Record active filters and source provenance in `ScreenViewContext`.
7. Make the renderer switch exhaustively on `loading`, `success`, `empty`, and `error`.
8. Add presenter tests for monetary pass-through, currency, filters, provenance, and failure/degraded behavior.
9. Keep visual behavior stable unless the migration issue explicitly includes redesign.
