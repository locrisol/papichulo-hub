// The till receipt rows.
//
// These used to be one database column each: cash_sales, card_sales and so on.
// That worked while the till never changed. It stopped working the week the
// till split Outside Catering into Clockmeal, Lunch Team, Feedr and Catering,
// because every change to the till meant a migration and a deploy.
//
// Now the rows are records in sales_tenders, and the amounts live in one field
// on the day, sales_records.tender_sales, keyed by the tender's key. Everything
// in here is the logic that goes with that, kept out of the pages so it can be
// tested on its own.

// Empty boxes count as nothing rather than breaking the sum. The grid holds
// strings because that is what an input gives you.
export function num(v) {
    if (v === '' || v == null) return 0
    const n = parseFloat(v)
    return isNaN(n) ? 0 : n
}

// Which rows to draw, given every tender for the restaurant and the days being
// shown.
//
// The active ones, plus any retired one that any of those days still has a
// figure for. That second half is what lets an old week draw the till as it
// actually was. A March week shows Outside Catering because those days have a
// figure under that key, and August does not because those days never had one.
// Nothing anywhere has to record when the till changed.
//
// It looks across all the days at once, not day by day, because the week grid
// is one set of rows with seven columns. A row that only appeared on the
// Wednesday still needs to exist for the whole week or the grid stops lining up.
//
// `storedDays` is an array of tender_sales objects: seven for the week grid,
// one for the day form.
export function tendersToShow(tenders, storedDays) {
    const seen = new Set()
    for (const stored of storedDays || []) {
        for (const key of Object.keys(stored || {})) seen.add(key)
    }

    return (tenders || [])
        .filter(t => t.is_active || seen.has(t.key))
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
}

// What the day is out by.
//
// What the till took, less what it says it took. A day three euro short reads
// as -3.00, because the money is missing and a shortfall should look like one.
//
// Anything under half a cent is treated as nothing. Adding decimals in binary
// leaves a remainder, so a day that balances to the cent can come out at minus
// two ten-thousandths of a cent, which is nothing at all but carries a minus
// sign and used to show as "-€0.00" beside six days of "€0.00". It also matters
// because the screen turns red on any variance that is not zero, and noise like
// that is not a variance.
//
// The figure itself is not rounded, only the noise removed, so what is shown
// keeps the rounding that toLocaleString does properly.
//
// Only rows marked as counting are included. Every row on the till counts
// today, but a POS that prints a subtotal line would not, and that is a tick
// box rather than another migration.
export function tenderVariance(gross, values, shownTenders) {
    const total = (shownTenders || [])
        .filter(t => t.counts_toward_gross)
        .reduce((sum, t) => sum + num(values?.[t.key]), 0)

    const out = total - num(gross)
    return Math.abs(out) < 0.005 ? 0 : out
}

// What to write back to the database for one day.
//
// Starts from what is already stored and writes the typed values over it, which
// means a key belonging to no row on screen is left exactly as it was. That
// matters: sales_platforms rebuilds its field from the active list instead, so
// re-saving an old week quietly erases the figures of any platform that has
// since been retired. Money that reconciles cannot work that way.
//
// Zeros are written, not skipped. A stored zero says the row was on the till
// that day and took nothing, and a missing key says the row did not exist yet.
// That difference is the only thing tendersToShow has to go on.
export function mergeTenderSales(stored, values, shownTenders) {
    const out = { ...(stored || {}) }
    for (const t of shownTenders || []) {
        out[t.key] = num(values?.[t.key])
    }
    return out
}

// Does a tracking platform belong to a till row?
//
// Since August the till itemises Clockmeal, Lunch Team, Feedr and Catering
// itself, so most Corporate tracking rows now have a till row of the same name.
// The two live in different tables with nothing joining them, so the name is
// all there is to go on. Compared loosely, since a stray capital or a trailing
// space should not break the link.
//
// If they ever stop lining up, nothing breaks: no match simply means no copying
// and the tracking row is typed by hand as it always was.
export function sameLabel(a, b) {
    return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()
}

// What a tracking row should become when a till row is typed into.
//
// Returns the new value to copy across, or null to leave the tracking row
// alone. It copies while the tracking row is still empty or still says what the
// till row said a moment ago. Once something different has been typed into it,
// it is that person's figure and nothing overwrites it: what the till rang up
// and what the platform pays after commission are not always the same, and the
// tracking row is where that difference gets recorded.
export function trackedCopy({ typed, previousTillValue, trackedValue }) {
    const tracked = trackedValue ?? ''
    const previous = previousTillValue ?? ''
    return tracked === '' || tracked === previous ? typed : null
}

// Turns a stored day into what the inputs need, which is strings. A key with no
// figure comes back as an empty box rather than a nought, so nobody has to
// wonder whether a zero was typed or just left.
export function tenderValuesFromRecord(stored) {
    const out = {}
    for (const [key, value] of Object.entries(stored || {})) {
        out[key] = value == null ? '' : String(value)
    }
    return out
}
