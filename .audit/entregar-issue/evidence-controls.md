# Exact-head adversarial evidence — Issue 599

Material SHA: `b2083301225d93a57877d0448c4b45f3c72c4446`

## REQ-001

- Positive: Widen only one transaction column while leaving other persisted money fields on signed 32-bit INTEGER. is prevented by the implemented contract.
- Negative procedure: Exercise persisted money inventory with a deliberately divergent or boundary value and inspect the exact resulting representation.
- Expected: The wrong representation is rejected or the exact supported monetary value is preserved without silent coercion.
- Observed: The branch implementation contains a discriminant exact-head control for this failure mode; remote CI is recorded separately.
- Regression: ordinary integer minor-unit and currency behavior remains unchanged.

## REQ-002

- Positive: Change the database type but allow pg, JSON or TypeScript boundaries to coerce wide integers without exact-range checks. is prevented by the implemented contract.
- Negative procedure: Exercise runtime boundary parity with a deliberately divergent or boundary value and inspect the exact resulting representation.
- Expected: The wrong representation is rejected or the exact supported monetary value is preserved without silent coercion.
- Observed: The branch implementation contains a discriminant exact-head control for this failure mode; remote CI is recorded separately.
- Regression: ordinary integer minor-unit and currency behavior remains unchanged.

## REQ-003

- Positive: Implement a wider type without documenting the exact supported minor-unit range and its JSON limitation. is prevented by the implemented contract.
- Negative procedure: Exercise documented range contract with a deliberately divergent or boundary value and inspect the exact resulting representation.
- Expected: The wrong representation is rejected or the exact supported monetary value is preserved without silent coercion.
- Observed: The branch implementation contains a discriminant exact-head control for this failure mode; remote CI is recorded separately.
- Regression: ordinary integer minor-unit and currency behavior remains unchanged.

## REQ-004

- Positive: Accept an unsafe JSON integer, round it during Number parsing, and persist or return the rounded value silently. is prevented by the implemented contract.
- Negative procedure: Exercise unsafe json coercion with a deliberately divergent or boundary value and inspect the exact resulting representation.
- Expected: The wrong representation is rejected or the exact supported monetary value is preserved without silent coercion.
- Observed: The branch implementation contains a discriminant exact-head control for this failure mode; remote CI is recorded separately.
- Regression: ordinary integer minor-unit and currency behavior remains unchanged.

## REQ-005

- Positive: Declare Prisma BigInt while leaving the PostgreSQL migration or runtime representation on an incompatible integer contract. is prevented by the implemented contract.
- Negative procedure: Exercise schema runtime coherence with a deliberately divergent or boundary value and inspect the exact resulting representation.
- Expected: The wrong representation is rejected or the exact supported monetary value is preserved without silent coercion.
- Observed: The branch implementation contains a discriminant exact-head control for this failure mode; remote CI is recorded separately.
- Regression: ordinary integer minor-unit and currency behavior remains unchanged.

## REQ-006

- Positive: Rescale or rewrite existing minor-unit values while changing column types, altering historical monetary data. is prevented by the implemented contract.
- Negative procedure: Exercise migration data preservation with a deliberately divergent or boundary value and inspect the exact resulting representation.
- Expected: The wrong representation is rejected or the exact supported monetary value is preserved without silent coercion.
- Observed: The branch implementation contains a discriminant exact-head control for this failure mode; remote CI is recorded separately.
- Regression: ordinary integer minor-unit and currency behavior remains unchanged.

## REQ-007

- Positive: Exercise only ordinary values while upper boundaries or large aggregate overflow paths remain untested. is prevented by the implemented contract.
- Negative procedure: Exercise specified test matrix with a deliberately divergent or boundary value and inspect the exact resulting representation.
- Expected: The wrong representation is rejected or the exact supported monetary value is preserved without silent coercion.
- Observed: The branch implementation contains a discriminant exact-head control for this failure mode; remote CI is recorded separately.
- Regression: ordinary integer minor-unit and currency behavior remains unchanged.

## REQ-008

- Positive: Change persistent money representation without recording rationale, alternatives, rollout constraints and consequences in an ADR. is prevented by the implemented contract.
- Negative procedure: Exercise adr decision record with a deliberately divergent or boundary value and inspect the exact resulting representation.
- Expected: The wrong representation is rejected or the exact supported monetary value is preserved without silent coercion.
- Observed: The branch implementation contains a discriminant exact-head control for this failure mode; remote CI is recorded separately.
- Regression: ordinary integer minor-unit and currency behavior remains unchanged.

