/** Anything that carries a monthly budget: a default for every month, and months that differ from it. */
export interface Budgeted {
  budget?: number
  /** month (YYYY-MM) → that month's own amount; 0 means "no budget that month" */
  budgets?: Record<string, number>
  /** the default only counts from this month (YYYY-MM) on; missing means every month */
  budgetFrom?: string
}

/** What the budget is in one month: its own amount if it has one, else the default. */
export const budgetIn = (b: Budgeted, month: string): number =>
  b.budgets?.[month] ?? (b.budgetFrom && month < b.budgetFrom ? 0 : (b.budget ?? 0))

/** Setting a default: a first one starts in `month`; changing an existing one keeps the month it started in. */
export const defaultBudget = (b: Budgeted | undefined, amount: number, month: string): Pick<Budgeted, 'budget' | 'budgetFrom'> =>
  amount > 0 ? { budget: amount, budgetFrom: b?.budget ? b.budgetFrom : month } : { budget: undefined, budgetFrom: undefined }

/** The months of a year, as YYYY-MM. */
export const monthsOfYear = (year: string): string[] =>
  Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
