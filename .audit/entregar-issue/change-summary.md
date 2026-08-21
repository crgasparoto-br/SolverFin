# Issue 599 change summary

Material candidate: `b2083301225d93a57877d0448c4b45f3c72c4446`
Base: `6ef67c78db224d87559086ec53b6258e49de9aef`
PR: #636

- Widened all nine persisted monetary minor-unit fields from PostgreSQL INTEGER / Prisma Int to BIGINT / BigInt.
- Enforced the public exact JSON-number range with database CHECK constraints and a fail-closed pg int8 parser.
- Added domain helpers for exact safe-integer parsing and aggregation, and removed lossy dashboard Number coercion.
- Made currency formatting exact at Number.MAX_SAFE_INTEGER by formatting an exact decimal StringNumericLiteral instead of dividing by 100 as binary floating point.
- Added unit, integration and rendered-statement tests for values above the former signed-32-bit ceiling, exact safe boundaries, unsafe rejection and large aggregates.
- Added ADR 0015 and indexed it.
