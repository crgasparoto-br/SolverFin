# Issue 662 — material candidate summary

- Material head: `e8d828bdab40a73183c4387dbd7064925795c5a0`
- Pull request: `#664`
- Persisted explicit purchase and invoice links for new manual card installments without legacy backfill.
- Projected one installment occurrence per invoice in API summaries and the SSR card page.
- Protected installment structure at the API boundary and made instrument propagation atomic across the schedule.
- Added domain, API integration and web discriminant tests and updated canonical documentation.
- Local aggregate gate passed; the single allowed CI snapshot found both applicable workflows in progress.
