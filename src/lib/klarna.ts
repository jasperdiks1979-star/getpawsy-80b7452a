/**
 * Klarna "Pay in 4" installment helpers.
 *
 * Splits a total into 4 equal installments using minor-unit (cents) math
 * to avoid float drift, then formats per the requested ISO 4217 currency
 * with locale-correct decimals (e.g. JPY=0, USD=2, BHD=3).
 *
 * Stripe Klarna "Pay in 4" rounds each installment to the nearest minor
 * unit; any rounding remainder is absorbed by the FIRST installment.
 * The user-facing label shows the smaller (per-payment) figure so the
 * total quoted is never higher than what Klarna actually charges.
 */

const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW",
  "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);

const THREE_DECIMAL_CURRENCIES = new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);

export function getCurrencyMinorDigits(currency: string): number {
  const c = currency.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(c)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(c)) return 3;
  return 2;
}

function toMinorUnits(amount: number, digits: number): number {
  // Use Math.round to avoid float drift like 0.1+0.2.
  return Math.round(amount * Math.pow(10, digits));
}

function fromMinorUnits(minor: number, digits: number): number {
  return minor / Math.pow(10, digits);
}

export interface KlarnaSplit {
  /** Per-installment amount shown to the user (smaller of the two). */
  perInstallment: number;
  /** First installment that absorbs the rounding remainder. */
  firstInstallment: number;
  /** Total used for the split (echoed back, normalised to currency precision). */
  total: number;
  /** Currency minor-unit digits (0/2/3). */
  digits: number;
  /** Rounding remainder spread to the first payment, in major units. */
  remainder: number;
}

export function splitKlarnaInstallments(total: number, currency: string): KlarnaSplit {
  const digits = getCurrencyMinorDigits(currency);
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
  const totalMinor = toMinorUnits(safeTotal, digits);
  const baseMinor = Math.floor(totalMinor / 4);
  const remainderMinor = totalMinor - baseMinor * 4; // 0..3
  const firstMinor = baseMinor + remainderMinor;
  return {
    perInstallment: fromMinorUnits(baseMinor, digits),
    firstInstallment: fromMinorUnits(firstMinor, digits),
    total: fromMinorUnits(totalMinor, digits),
    digits,
    remainder: fromMinorUnits(remainderMinor, digits),
  };
}

export function formatCurrency(
  amount: number,
  currency: string,
  locale: string = "en-US",
): string {
  const digits = getCurrencyMinorDigits(currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount);
  } catch {
    // Unknown currency code — fall back to a safe representation.
    return `${currency.toUpperCase()} ${amount.toFixed(digits)}`;
  }
}

/**
 * Convenience: returns the formatted per-installment string for the
 * Klarna BNPL message ("4 interest-free payments of $X.XX").
 */
export function formatKlarnaInstallment(
  total: number,
  currency: string = "USD",
  locale: string = "en-US",
): string {
  const { perInstallment } = splitKlarnaInstallments(total, currency);
  return formatCurrency(perInstallment, currency, locale);
}
