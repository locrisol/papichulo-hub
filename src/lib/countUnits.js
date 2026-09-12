// The order pack formats are listed in.
//
// Biggest first, always. A product can be bought in a bag of 0.17 KG and in a
// box holding six of those bags, and whichever was added second used to sit
// second, because the order was the order they were typed in and there was no
// way to change it afterwards.
//
// Worked out from the size rather than remembered, so it is right the moment a
// format is added and cannot drift. It also matches how you count: the big
// packs first, then the small ones, then whatever is loose. Loose is not in
// here because it is not a format, it is the product's own unit, and every
// screen already puts it last.
//
// sort_order is still written when a format is created, and is used here only
// to break a tie between two formats of the same size, so they at least stay
// in the order they were added rather than swapping about.

export function orderFormats(formats) {
    return (formats || []).slice().sort((a, b) => {
        const size = Number(b.factor) - Number(a.factor)
        if (size) return size

        const added = Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)
        if (added) return added

        return String(a.label ?? '').localeCompare(String(b.label ?? ''))
    })
}
