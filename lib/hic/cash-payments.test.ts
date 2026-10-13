import { describe, expect, it } from "vitest";
import { calculateCashPayments } from "./cash-payments";

describe("calculateCashPayments", () => {
  it("splits a normal deal into $1,000 / remainder / $1,000", () => {
    expect(calculateCashPayments(30000, 1000)).toEqual({ atSigning: 1000, atInstall: 28000, atPto: 1000 });
  });

  it("recalculates install when the rep overrides the signing amount", () => {
    expect(calculateCashPayments(30000, 2500)).toEqual({ atSigning: 2500, atInstall: 26500, atPto: 1000 });
  });

  it("keeps cents on install", () => {
    expect(calculateCashPayments(25432.17, 1000)).toEqual({ atSigning: 1000, atInstall: 23432.17, atPto: 1000 });
  });

  it("drops the PTO payment on small deals — $1,500 is $1,000 upfront, rest at install", () => {
    expect(calculateCashPayments(1500, 1000)).toEqual({ atSigning: 1000, atInstall: 500, atPto: 0 });
  });

  it("drops PTO when exactly the PTO amount is left after signing", () => {
    expect(calculateCashPayments(2000, 1000)).toEqual({ atSigning: 1000, atInstall: 1000, atPto: 0 });
  });

  it("keeps PTO once more than the PTO amount is left after signing", () => {
    expect(calculateCashPayments(2000.01, 1000)).toEqual({ atSigning: 1000, atInstall: 0.01, atPto: 1000 });
  });

  it("allows the whole price due at signing", () => {
    expect(calculateCashPayments(1000, 1000)).toEqual({ atSigning: 1000, atInstall: 0, atPto: 0 });
  });

  it("rejects a signing amount larger than the contract price", () => {
    expect(calculateCashPayments(800, 1000)).toBeNull();
  });

  it("rejects a missing contract price or negative signing amount", () => {
    expect(calculateCashPayments(0, 1000)).toBeNull();
    expect(calculateCashPayments(30000, -1)).toBeNull();
  });
});
