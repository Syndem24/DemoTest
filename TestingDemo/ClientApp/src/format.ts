const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
})

export function formatMoney(value: number): string {
  return currency.format(value)
}
