import { describe, expect, it } from "vitest";
import { calculateContractPrice } from "./contract-price";

// These 3 cases are real LightReach deals — the formula must match them
// to the penny. Do not adjust the expected values to make a refactor
// pass; if one of these fails, the formula itself is wrong.
describe("calculateContractPrice", () => {
  it("matches real deal 1: 14,997.93 kWh, $0.135/kWh, 0% escalator", () => {
    expect(calculateContractPrice(14997.93, 0.135, 0)).toBe(47694.12);
  });

  it("matches real deal 2: 13,854.99 kWh, $0.115/kWh, 0% escalator", () => {
    expect(calculateContractPrice(13854.99, 0.115, 0)).toBe(37532.28);
  });

  it("matches real deal 3: 16,169.19 kWh, $0.110/kWh, 2.99% escalator", () => {
    expect(calculateContractPrice(16169.19, 0.11, 0.0299)).toBe(60555.48);
  });

  it("matches real deal 4: 12,263.59 kWh, $0.135/kWh, 0% escalator", () => {
    expect(calculateContractPrice(12263.59, 0.135, 0)).toBe(38998.92);
  });

  it("matches real deal 5: 29,174.89 kWh, $0.105/kWh, 2.99% escalator", () => {
    expect(calculateContractPrice(29174.89, 0.105, 0.0299)).toBe(104166.84);
  });

  it("drifts when production is rounded to a whole number (why the form flags it)", () => {
    expect(calculateContractPrice(12264, 0.135, 0)).toBe(39000.36);
    expect(calculateContractPrice(29175, 0.105, 0.0299)).toBe(104167.44);
  });

  it("gives a different (lower) price for whole-number production, per the spec's note", () => {
    // Spec: "14,998 entered without decimals gives $47,694.36" — confirms
    // reps must enter LightReach's exact displayed decimals.
    expect(calculateContractPrice(14998, 0.135, 0)).toBe(47694.36);
  });
});
