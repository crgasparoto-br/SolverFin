export function readCreateTransactionOccurredOn(body: Readonly<Record<string, unknown>>): string {
  const value = body.occurredOn;

  return value === undefined || value === null ? "" : String(value);
}
