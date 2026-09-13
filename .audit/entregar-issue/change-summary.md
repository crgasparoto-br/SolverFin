# Issue 662 — material candidate summary

- Material head: `4e91bf5c36b76d5ca1e03d74d8c345bce9ce3c7f`
- Pull request: `#664`
- Persisted explicit purchase and invoice links for new manual card installments without legacy backfill.
- Projected one installment occurrence per invoice in API summaries and the SSR card page.
- Protected installment structure at the API boundary and made instrument propagation atomic across the schedule.
- Added domain, API integration and web discriminant tests and updated canonical documentation.
- Remediated CI by isolating locked-invoice fixtures, cleaning linked installments before transactions, and preserving explicit category clearing in the occurrence read model.
- Local aggregate gate and exact-head CI, PostgreSQL integration, and Chrome visual validation passed.
