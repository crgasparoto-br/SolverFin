export interface MaskingOptions {
  preserveLastDigits?: number;
}

export interface MaskedFinancialPayload {
  readonly maskedText: string;
  readonly redactedKinds: readonly SensitiveDataKind[];
}

export type SensitiveDataKind =
  | "card_number"
  | "document"
  | "account_identifier"
  | "bank_message"
  | "token";

const DEFAULT_PRESERVE_LAST_DIGITS = 4;
const CARD_NUMBER_PATTERN = /\b(?:\d[ -]?){13,19}\b/g;
const CPF_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ_PATTERN = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const LONG_IDENTIFIER_PATTERN = /\b\d{6,12}\b/g;
const TOKEN_PATTERN = /\b(?:token|secret|senha|password|authorization)[:=]\s*\S+/gi;

export function maskFinancialIdentifier(value: string, options: MaskingOptions = {}): string {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return normalizedValue;
  }

  if (isAlreadyMasked(normalizedValue)) {
    return normalizedValue;
  }

  const digits = normalizedValue.replace(/\D/g, "");
  const preserveLastDigits = options.preserveLastDigits ?? DEFAULT_PRESERVE_LAST_DIGITS;

  if (digits.length === 0) {
    return normalizedValue;
  }

  const visibleDigits = digits.slice(-Math.min(preserveLastDigits, digits.length));
  const maskedDigits = "*".repeat(Math.max(0, digits.length - visibleDigits.length));

  return `${maskedDigits}${visibleDigits}`;
}

export function maskSensitiveFinancialText(value: string): MaskedFinancialPayload {
  const redactedKinds = new Set<SensitiveDataKind>();
  let maskedText = value;

  maskedText = maskedText.replace(TOKEN_PATTERN, (match) => {
    redactedKinds.add("token");
    const [key] = match.split(/[:=]/);
    return `${key}: ***`;
  });

  maskedText = maskedText.replace(CNPJ_PATTERN, () => {
    redactedKinds.add("document");
    return "**.***.***/****-**";
  });

  maskedText = maskedText.replace(CPF_PATTERN, () => {
    redactedKinds.add("document");
    return "***.***.***-**";
  });

  maskedText = maskedText.replace(CARD_NUMBER_PATTERN, (match) => {
    redactedKinds.add("card_number");
    return maskFinancialIdentifier(match);
  });

  maskedText = maskedText.replace(LONG_IDENTIFIER_PATTERN, (match) => {
    redactedKinds.add("account_identifier");
    return maskFinancialIdentifier(match);
  });

  if (/\b(?:pix|compra|cartao|agencia|conta|transferencia)\b/i.test(value)) {
    redactedKinds.add("bank_message");
  }

  return {
    maskedText,
    redactedKinds: [...redactedKinds],
  };
}

export function assertNoUnmaskedFinancialIdentifier(value: string): void {
  const masked = maskSensitiveFinancialText(value);

  if (masked.maskedText !== value) {
    throw new Error("Financial text contains unmasked sensitive identifiers.");
  }
}

function isAlreadyMasked(value: string): boolean {
  return value.includes("*") || value.includes("•");
}
