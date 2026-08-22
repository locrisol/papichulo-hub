// What an invoice can be filed under, and the colour that goes with each.
//
// The colours are not decoration. Invoices get entered in batches, ten at a
// time from the same delivery, and the one mistake that actually costs anything
// is filing one under the wrong heading: food and packaging are measured
// against two different targets, so a packaging invoice booked as food moves
// money between them and both percentages on the cost dashboard come out wrong.
// A colour is quicker to check than a word.
//
// Packaging is red and cleaning is purple because that is what those two
// sections already are on the stock take screens. Reusing them means one colour
// means one thing across the app rather than each screen inventing its own.
//
// Kept out of the pages because the entry screen and the history screen both
// need them and they cannot be allowed to drift apart.
export const INVOICE_CATEGORIES = [
    {
        value: 'food',
        label: 'Food',
        // `soft` is for a row or a pill sitting on white, `solid` for the
        // selected state, `dot` for the little square beside a name.
        soft: 'bg-green-50 text-green-800 border-green-200',
        solid: 'bg-green-600 text-white border-green-600',
        dot: 'bg-green-600',
        stripe: 'border-l-green-500',
    },
    {
        value: 'packaging',
        label: 'Packaging',
        soft: 'bg-red-50 text-red-800 border-red-200',
        solid: 'bg-red-600 text-white border-red-600',
        dot: 'bg-red-600',
        stripe: 'border-l-red-500',
    },
    {
        value: 'cleaning',
        label: 'Cleaning',
        soft: 'bg-purple-50 text-purple-800 border-purple-200',
        solid: 'bg-purple-600 text-white border-purple-600',
        dot: 'bg-purple-600',
        stripe: 'border-l-purple-500',
    },
    {
        value: 'other',
        label: 'Other',
        soft: 'bg-gray-100 text-gray-700 border-gray-300',
        solid: 'bg-gray-600 text-white border-gray-600',
        dot: 'bg-gray-500',
        stripe: 'border-l-gray-400',
    },
]

// Falls back rather than returning nothing, so a category that only exists in
// old data cannot leave a row with no colour and no label at all.
export function invoiceCategory(value) {
    return INVOICE_CATEGORIES.find(c => c.value === value) || {
        value,
        label: value || 'Uncategorised',
        soft: 'bg-gray-100 text-gray-700 border-gray-300',
        solid: 'bg-gray-600 text-white border-gray-600',
        dot: 'bg-gray-500',
        stripe: 'border-l-gray-400',
    }
}

// The summary cards at the top of both invoice screens.
//
// They carry the same colours as the buttons and the rows, so the eye can go
// from a card straight to the invoices that made it up without reading a word.
//
// Packaging and cleaning is two categories in one card, because the weekly
// report measures them together against a single target, so it is split down
// the middle rather than picking one of the two colours and being half wrong.
// The hex values are the same red-50 and purple-50 the pills use; a gradient
// cannot be written in Tailwind classes, so it goes in as a style.
export const INVOICE_SUMMARY_CARDS = [
    {
        label: 'Food',
        cats: ['food'],
        tint: 'bg-green-50',
        labelText: 'text-green-800',
    },
    {
        label: 'Packaging and cleaning',
        cats: ['packaging', 'cleaning'],
        // Corner to corner: the dividing line runs from the top right corner
        // down to the bottom left, so red sits above it and purple below.
        split: 'linear-gradient(to bottom right, #fef2f2 0 50%, #faf5ff 50% 100%)',
        labelText: 'text-gray-700',
    },
    {
        label: 'Other',
        cats: ['other'],
        tint: 'bg-gray-100',
        labelText: 'text-gray-700',
    },
]

// The week's invoices, split into days, newest day first.
//
// The list used to be one run of rows, so on a busy week you could not see
// where Monday's delivery ended and Tuesday's began without reading every date.
// Grouping is done here rather than in the page so it can be tested.
export function groupByDay(invoices) {
    const days = new Map()
    for (const inv of invoices || []) {
        const date = inv.invoice_date
        if (!days.has(date)) days.set(date, [])
        days.get(date).push(inv)
    }

    return [...days.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, rows]) => ({
            date,
            rows,
            total: rows.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0),
        }))
}
