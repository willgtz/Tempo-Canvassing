// LightReach's 25-year contract price, reverse-engineered from real
// payment schedules (see lib/hic/contract-price.test.ts for the 3
// verified real-deal test cases this must match to the penny). Pure
// math, no I/O — safe to import from both server actions and tests.
// Uses decimal.js throughout rather than floating point, since these
// are legally binding dollar figures on a signed contract.
import Decimal from "decimal.js";

const DEFAULT_DEGRADATION = 0.005;
const DEFAULT_TERM_YEARS = 25;

export type ContractPriceYear = {
  year: number;
  rate: number;
  production: number;
  monthlyPayment: number;
};

function round(value: Decimal, decimalPlaces: number): Decimal {
  return value.toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP);
}

// production[t] is deliberately never rounded (only the monthly payment
// and the escalated rate are, per the verified formula) — rounding
// production would compound error across 25 years and drift away from
// LightReach's own real schedules this was reverse-engineered from.
export function calculateContractPriceSchedule(
  firstYearProductionKwh: number,
  firstYearKwhRate: number,
  annualEscalator: number,
  options?: { degradation?: number; termYears?: number }
): ContractPriceYear[] {
  const degradation = new Decimal(options?.degradation ?? DEFAULT_DEGRADATION);
  const termYears = options?.termYears ?? DEFAULT_TERM_YEARS;
  const p1 = new Decimal(firstYearProductionKwh);
  const esc = new Decimal(annualEscalator);
  const retentionFactor = new Decimal(1).minus(degradation);

  const schedule: ContractPriceYear[] = [];
  let rate = new Decimal(firstYearKwhRate);

  for (let t = 1; t <= termYears; t++) {
    const production = p1.times(retentionFactor.pow(t - 1));
    const monthlyPayment = round(production.times(rate).dividedBy(12), 2);
    schedule.push({
      year: t,
      rate: rate.toNumber(),
      production: production.toNumber(),
      monthlyPayment: monthlyPayment.toNumber(),
    });
    rate = round(rate.times(new Decimal(1).plus(esc)), 4);
  }

  return schedule;
}

export function calculateContractPrice(
  firstYearProductionKwh: number,
  firstYearKwhRate: number,
  annualEscalator: number,
  options?: { degradation?: number; termYears?: number }
): number {
  const schedule = calculateContractPriceSchedule(
    firstYearProductionKwh,
    firstYearKwhRate,
    annualEscalator,
    options
  );
  const total = schedule.reduce(
    (sum, year) => sum.plus(new Decimal(year.monthlyPayment).times(12)),
    new Decimal(0)
  );
  return round(total, 2).toNumber();
}

// Non-blocking "does the rep's entered monthly payment look right" check
// — same single-year math as schedule[0], exposed standalone so the form
// doesn't need the full 25-year schedule just to show this warning.
export function calculateMonthlyPaymentCheck(productionKwh: number, kwhRate: number): number {
  return round(new Decimal(productionKwh).times(kwhRate).dividedBy(12), 2).toNumber();
}
