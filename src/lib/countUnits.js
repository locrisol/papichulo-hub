import { fmtQty } from '@/lib/format'

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

// The packs to save, with the one still in the boxes when somebody presses
// Save or Close without pressing Add pack first.
//
// Add pack reads as "add another one", so a pack typed and left in the boxes
// was meant to be kept. It used to be dropped without a word. Typed whole, it
// goes in with the rest; typed half, it is a question rather than a guess.
// `problem` is a sentence, or '' when it can be saved.
export function packsToSave(packs, draft, unit) {
    const list = packs || []
    const label = String(draft?.label ?? '').trim()
    const typed = String(draft?.factor ?? '').trim()
    if (!label && !typed) return { packs: list, problem: '' }
    const factor = parseFloat(typed)
    if (!label) return { packs: list, problem: 'Give the pack a name, like Box, Bag or Tin, or clear its boxes.' }
    if (!(factor > 0)) return { packs: list, problem: `Enter how many ${unit || 'units'} are in one ${label}, or clear its boxes.` }
    if (list.some(p => p.label === label)) return { packs: list, problem: `There is already a pack called ${label}.` }
    return { packs: [...list, { label, factor }], problem: '' }
}

// A product's unit as a word in a sentence: "10 kg", "1 litre", "12 units".
export function unitWords(unit, amount) {
    const one = Number(amount) === 1
    if (unit === 'KG') return 'kg'
    if (unit === 'Litre') return one ? 'litre' : 'litres'
    return one ? 'unit' : 'units'
}

// What a pack box on the count is labelled: the pack and what one holds,
// "Box, 10 kg each". The pack boxes sit in a panel of their own, apart from
// the loose box, so nobody types kilos into a box meant for boxes (his
// choice, 5 October 2026).
export function packLabel(format, unit) {
    const holds = fmtQty(format?.factor)
    return `${format?.label || 'Pack'}, ${holds} ${unitWords(unit, format?.factor)} each`
}
