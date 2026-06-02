// Shared formatting helpers used across the app.

// Currency: € with thousands separators and exactly 2 decimals.
// e.g. 2355.11 → "€2,355.11", 8 → "€8.00", null → "—"
export function fmtMoney(n) {
  if (n == null || isNaN(n)) return '—'
  return '€' + Number(n).toLocaleString('en-IE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Quantity: up to 3 decimals, trailing zeros stripped, with thousands
// separators. e.g. 11.799999 → "11.8", 1200 → "1,200", 100 → "100"
export function fmtQty(n) {
  const rounded = parseFloat(Number(n).toFixed(3))
  return rounded.toLocaleString('en-IE', { maximumFractionDigits: 3 })
}