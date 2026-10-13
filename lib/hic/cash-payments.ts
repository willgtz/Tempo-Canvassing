import Decimal from "decimal.js";

// Cash deals split the contract price into three payments: an upfront
// amount at signing (prefilled with this default, rep-editable per deal),
// the bulk at install, and a fixed amount at PTO. Shared by the form's
// live preview, server-side validation, and the PDF field resolver so
// all three always agree on the split.
export const CASH_DEFAULT_AMOUNT_DUE_AT_SIGNING = 1000;
export const CASH_AMOUNT_DUE_AT_PTO = 1000;

export type CashPayments = { atSigning: number; atInstall: number; atPto: number };

// Small deals skip the PTO payment entirely rather than going below a
// minimum: once what's left after signing is no more than the PTO amount,
// all of it is due at install instead (e.g. $1,500 contract → $1,000 at
// signing, $500 at install, $0 at PTO). Returns null when the inputs
// can't produce a valid split (signing > contract price, negatives).
export function calculateCashPayments(contractPrice: number, amountDueAtSigning: number): CashPayments | null {
  if (!(contractPrice > 0) || !(amountDueAtSigning >= 0)) return null;
  const price = new Decimal(contractPrice);
  const signing = new Decimal(amountDueAtSigning);
  if (signing.greaterThan(price)) return null;

  const remainder = price.minus(signing);
  const pto = remainder.greaterThan(CASH_AMOUNT_DUE_AT_PTO) ? new Decimal(CASH_AMOUNT_DUE_AT_PTO) : new Decimal(0);
  return {
    atSigning: signing.toDecimalPlaces(2).toNumber(),
    atInstall: remainder.minus(pto).toDecimalPlaces(2).toNumber(),
    atPto: pto.toNumber(),
  };
}
