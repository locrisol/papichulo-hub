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

// The cost of one unit, to four decimals. e.g. 6.4875 → "€6.4875"
//
// A separate helper because two decimals is genuinely not enough here and
// rounding to it would be wrong, not just coarse. A tortilla at €0.3033 each
// reads as €0.30, and a dish using thirty of them is then costed eleven cent
// light every time. Four decimals is what the prices are stored at.
//
// It exists mainly so nothing is tempted to write the euro sign by hand again.
// Five files were building their own money with a template string, which is how
// the app ended up printing €1,234.56 on the dashboard and €1234.56 on a menu
// item: toFixed has no thousands separator and nobody notices until the figures
// get big enough to need one.
export function fmtUnitCost(n) {
  if (n == null || isNaN(n)) return '—'
  const value = Number(n)
  const text = Math.abs(value).toLocaleString('en-IE', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
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
// A percentage. e.g. 28.4 → "28.4%", null → "—"
//
// Fourteen places were doing this by hand and they did not agree. Two precisions,
// and three of them used a hyphen for "no answer" where everything else uses an
// em dash, which on a screen full of figures reads as a minus sign rather than
// as a blank.
export function fmtPct(n, places = 1) {
  if (n == null || isNaN(n)) return '—'
  return `${Number(n).toFixed(places)}%`
}

// Whatever came out of the database, as a number we can add up.
//
// This was written out eleven times across the app in two spellings, one using
// Number and one using parseFloat with an extra check for the empty string.
// They behave identically: Number('') is 0, so the extra branch never did
// anything. The point of it is that nothing coming back from Postgres is
// trusted to be a number, because a numeric column arrives as a string, an
// empty box arrives as '', and a missing row arrives as null. All three have to
// add up to zero rather than to NaN, because one NaN makes a whole week's total
// disappear.
export function num(v) {
  if (v == null) return 0
  const n = Number(v)
  return isNaN(n) ? 0 : n
}
