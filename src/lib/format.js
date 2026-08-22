// Shared formatting helpers used across the app.

// Currency: € with thousands separators and exactly 2 decimals.
// e.g. 2355.11 → "€2,355.11", 8 → "€8.00", null → "—"
//
// The minus goes before the € rather than after it, so a till that is three
// euro short reads "-€3.00" and not "€-3.00".
//
// The number is formatted first and the sign decided from what came out, which
// is what stops "-€0.00" appearing. Adding decimals in binary leaves a
// remainder, so a day that balances exactly can come out at minus two
// ten-thousandths of a cent: nothing at all, but enough to carry a minus sign.
// If it rounds away to zero it is not negative.
//
// The rounding is left to toLocaleString rather than done here. Math.round on
// the cents gets 1.005 wrong, because 1.005 times 100 is 100.49999999999999 in
// binary and rounds down to €1.00.
export function fmtMoney(n) {
  if (n == null || isNaN(n)) return '—'
  const value = Number(n)
  const text = Math.abs(value).toLocaleString('en-IE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const roundsToNothing = /^[0.,\s]*$/.test(text)
  return (value < 0 && !roundsToNothing ? '-' : '') + '€' + text
}

// Quantity: up to 3 decimals, trailing zeros stripped, with thousands
// separators. e.g. 11.799999 → "11.8", 1200 → "1,200", 100 → "100"
export function fmtQty(n) {
  const rounded = parseFloat(Number(n).toFixed(3))
  return rounded.toLocaleString('en-IE', { maximumFractionDigits: 3 })
}