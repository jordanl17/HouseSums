/**
 * Example curves for the /styleguide/ chart and table. They are a shape to judge the
 * design against, not output of the model: smooth curves that cross between year 5
 * and year 6 and sit about £30k apart at year 10, to match the example key numbers
 * from the brief's reference mock. Values are £ thousands at each year-end, 0 to 15.
 */
const YEARS = 15;
const at = (f: (year: number) => number) =>
  Array.from({ length: YEARS + 1 }, (_, year) => Math.round(f(year) * 10) / 10);

/** What the buyer would walk away with if they sold at each year-end. */
export const exampleBuy: number[] = at((y) => 16 + 9.2 * y + 0.35 * y * y);

/** What the renter's invested savings would be worth at each year-end. */
export const exampleRent: number[] = at((y) => 38 + 6.5 * y + 0.1 * y * y);
