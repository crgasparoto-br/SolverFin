# Change summary - issue #598

Material head: `88116871f5e28668f6cc7daa1902b5e18119c880`
Base: `901fe39e8c2e6756dc551ff739d710394b985b02`
Pull request: #631

- Added `apps/api/src/financial-invariants-e2e.integration.test.ts`.
- Added named invariant coverage `FIN-E2E-001` through `FIN-E2E-009`.
- Updated `docs/STATUS_MATRIX.md` to record the protected Phase 3A invariant suite.
- Remediated predecessor CI findings: TypeScript narrowing, formatting, and the over-specific absolute-count assumption in FIN-E2E-009.
- FIN-E2E-009 still proves retry rejection, stable payment transaction identity, no growth in invoice-linked rows, and unchanged financial summary.
- No production financial implementation file changed.
