// Hardcoded Phase 1 defaults for values the spec calls out as
// "editable in settings" — Phase 5 replaces these with real DB-backed
// settings (app_settings rows), read through this same module so no
// call site needs to change when that happens.
export const HIC_ESCALATOR_OPTIONS = [0, 0.0199, 0.0299];
export const HIC_KWH_RATE_OPTIONS = [0, 0.1, 0.105, 0.11, 0.115, 0.12, 0.125, 0.13, 0.135];
export const HIC_DEGRADATION_RATE = 0.005;
export const HIC_TERM_YEARS = 25;
export const HIC_DEFAULT_CONTRACTOR_NAME = "Tempo Solar World";
export const HIC_DEFAULT_TAX_CREDIT = 0;
export const HIC_DEFAULT_AMOUNT_DUE_AT_SIGNING = 0;
// Non-blocking warning when the rep's entered monthly payment differs
// from the computed check by more than this amount.
export const HIC_MONTHLY_PAYMENT_MISMATCH_THRESHOLD = 1;
export const HIC_LINK_EXPIRATION_DAYS = 14;
export const HIC_REMINDER_DAYS_BETWEEN = 3;
export const HIC_REMINDER_MAX_COUNT = 3;
// Sungage Loan — fixed_apr stored as a decimal fraction (0.0599 = 5.99%),
// consistent with HIC_ESCALATOR_OPTIONS above.
export const HIC_APR_OPTIONS = [0.0399, 0.0449, 0.0499, 0.0599, 0.0699, 0.0799, 0.0899, 0.0949, 0.0974];
export const HIC_LOAN_TERM_OPTIONS = [5, 10, 15, 20, 25, 30];
