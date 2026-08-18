export interface TransactionGroupTemporalFieldsInput {
  date?: string;
  plannedOn?: string;
  effectiveOn?: string | null;
}

export interface TransactionGroupTemporalSnapshot {
  status: string;
  occurredOn: string;
  plannedOn: string;
  effectiveOn: string | null;
}

export interface ResolvedTransactionGroupTemporalFields {
  occurredOn: string;
  plannedOn: string;
  effectiveOn: string | null;
}

export function resolveTransactionGroupUpdateTemporalFields(
  current: TransactionGroupTemporalSnapshot,
  input: TransactionGroupTemporalFieldsInput,
): ResolvedTransactionGroupTemporalFields {
  const plannedOn =
    input.plannedOn ??
    (current.status === "PLANNED" && input.date !== undefined ? input.date : current.plannedOn);
  const effectiveOn =
    current.status === "PLANNED"
      ? null
      : input.effectiveOn !== undefined
        ? input.effectiveOn
        : (input.date ?? current.effectiveOn);

  return {
    occurredOn: current.occurredOn,
    plannedOn,
    effectiveOn,
  };
}

export function resolveTransactionGroupCloneTemporalFields(
  current: TransactionGroupTemporalSnapshot,
  input: TransactionGroupTemporalFieldsInput,
): ResolvedTransactionGroupTemporalFields {
  const realized = current.effectiveOn !== null;
  const occurredOn = input.date ?? current.occurredOn;
  const plannedOn = input.plannedOn ?? input.date ?? current.plannedOn;
  const effectiveOn = realized
    ? input.effectiveOn !== undefined
      ? input.effectiveOn
      : (input.date ?? current.effectiveOn ?? occurredOn)
    : null;

  return { occurredOn, plannedOn, effectiveOn };
}
