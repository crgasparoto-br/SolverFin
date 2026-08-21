# Change summary - issue #598

Material head: `478ec624ff18ce88858bf77c33f9886014d5bb44`

- preserves FIN-E2E-001 through FIN-E2E-009 and their public repository/PostgreSQL contracts;
- adds a tenant/profile-scoped `try/finally` cleanup so the suite does not contaminate later integration tests or depend on execution order;
- handles the Invoice/Transaction circular FK by clearing test invoice payment links before removing test transactions;
- normalizes formatter-sensitive layout in the authored test file;
- changes no production financial implementation.
