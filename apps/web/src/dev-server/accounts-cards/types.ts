export interface AccountRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
  openingBalanceMinor?: number;
  currency?: string;
  agencyIdentifier?: string;
  accountIdentifier?: string;
  maskedIdentifier?: string;
  institutionKey?: string;
}

export interface CreditCardAccountRecord {
  id: string;
  name: string;
  status: string;
  closingDay: number;
  dueDay: number;
  creditLimitMinor?: number;
  institutionKey?: string;
  brandKey?: string;
  paymentAccountId?: string;
  instruments: CardInstrumentRecord[];
}

export interface CardInstrumentRecord {
  id: string;
  type: string;
  holder: string;
  status: string;
  isDefault: boolean;
  name?: string;
  maskedIdentifier?: string;
  creditLimitMinor?: number;
}
