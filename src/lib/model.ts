/**
 * The rent v buy model: a pure monthly simulation of two households, as in the brief's
 * "Calculation spec". No DOM, no JSON imports, no figures: everything comes from `inputs` and
 * `taxRules`.
 *
 * Owner: model teammate. STUB (phase 3 contracts): signatures only.
 */
import type {
  Inputs,
  ModelOptions,
  ModelResult,
  SellingBreakdown,
  TaxRules,
  UpfrontBreakdown,
} from './types';

const notImplemented = (name: string): never => {
  throw new Error(`${name} is not implemented yet (phase 3 stub)`);
};

/**
 * Standard repayment formula M = L·r / (1 − (1 + r)^−n), r = annualRate / 12, n = months.
 * Returns 0 when principal is 0, and principal / months when the rate is 0.
 */
export function monthlyPayment(principal: number, annualRate: number, months: number): number {
  return notImplemented(`monthlyPayment(${principal}, ${annualRate}, ${months})`);
}

/** Upfront costs on day one: tax + legal + survey + moving + product fee (only with a loan). */
export function upfrontCosts(inputs: Inputs, taxRules: TaxRules): UpfrontBreakdown {
  return notImplemented(`upfrontCosts(${inputs.price}, ${taxRules.taxYear})`);
}

/** S(V) = V × agent fee + selling legal fees + Home Report (Scotland only). */
export function sellingCosts(value: number, year: number, inputs: Inputs): SellingBreakdown {
  return notImplemented(`sellingCosts(${value}, ${year}, ${inputs.nation})`);
}

/** Run the simulation for inputs.years years. Sensitivity rows are included unless turned off. */
export function runModel(inputs: Inputs, taxRules: TaxRules, options?: ModelOptions): ModelResult {
  return notImplemented(`runModel(${inputs.years}, ${taxRules.taxYear}, ${String(options)})`);
}
