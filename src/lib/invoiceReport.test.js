import { describe, it, expect } from 'vitest'
import {
    deliveriesFrom, priceMoves, switchesIn, usualSuggestions, recipeGaps, cameBack, stillOwed,
    newCodes, priceWeek, priceWords, decisionsFrom, reasonsOf, lineageOf, nameOf, unitWord,
    cannotCompare, usualFor, looksRenumbered, claimKey, claimActions, claimLabel, lookBackFrom,
    outOfReason, eachWords, readFrom, notAsRecommended, waitingOnReview, notChecked, backByReason, whyNot,
} from '@/lib/invoiceReport'

// The first real fortnight, cut down to what each rule needs. Sysco is s1.
const WEEK = { weekStart: '2026-09-13', weekEnd: '2026-09-19' }

const TOMATOES = { id: 'tom', name: 'Tomatoes', unit: 'KG' }
const TORTILLA = { id: 'tor', name: 'Flour Tortilla (Burritos)', unit: 'Units' }
const PEPPERS = { id: 'pep', name: 'Green Peppers', unit: 'KG' }
const CABBAGE = { id: 'cab', name: 'White Cabbage', unit: 'KG' }

let n = 0
function line({
    code, product = null, priceId = null, date, number = `inv-${date}`, perCase, units, pack = null,
    cases = 1, loose = 0, value = null, decision = 'matched', description = null, type = 'invoice',
    invoiceId = number, total = null,
}) {
    n += 1
    return {
        id: `l${n}`,
        invoice_id: invoiceId,
        supplier_code: code,
        product_id: product?.id || null,
        products: product,
        price_id: priceId,
        raw_description: description || product?.name?.toUpperCase() || code,
        pack_size: pack,
        units_per_case: units,
        price_per_case: perCase,
        cases,
        units: loose,
        line_no: n,
        line_total: value ?? perCase * cases,
        decision,
        invoices: {
            id: invoiceId, invoice_number: number, invoice_date: date, supplier_id: 's1',
            document_type: type, total_amount: total ?? (value ?? perCase * cases),
        },
    }
}

function price(over) {
    return { supplier_id: 's1', is_preferred: true, purchase_type: 'case', ...over }
}

function code(over) {
    return { supplier_id: 's1', ignored: false, first_seen_on: '2026-09-01', ...over }
}

describe('the deliveries', () => {
    it('works the price of one out from the case, not from a stored unit price', () => {
        const [d] = deliveriesFrom([{ ...line({ code: 'T', date: '2026-09-17', perCase: 8.6, units: 6 }), unit_price: 1.9583 }])
        expect(d.perUnit).toBeCloseTo(1.4333, 4)
    })

    // None of these is evidence of what anything costs.
    it('leaves out credit notes, deliveries reversed in full and lines sent back', () => {
        const kept = line({ code: 'A', date: '2026-09-14', perCase: 10, units: 1, invoiceId: 'i1' })
        const reversed = line({ code: 'B', date: '2026-09-14', perCase: 20, units: 1, invoiceId: 'i2', number: 'N2' })
        const returned = line({ code: 'C', date: '2026-09-14', perCase: 30, units: 1, invoiceId: 'i1' })
        const creditLine = line({ code: 'A', date: '2026-09-15', perCase: 10, units: 1, type: 'credit', invoiceId: 'c9' })
        const credits = [
            { id: 'c1', credit_of_invoice_id: 'i2', total_amount: -20, invoice_lines: [] },
            { id: 'c2', credit_of_invoice_id: 'i1', total_amount: -30, invoice_lines: [{ supplier_code: 'C', line_total: -30 }] },
        ]
        const all = deliveriesFrom([kept, reversed, returned, creditLine], credits)
        expect(all.map(d => d.code)).toEqual(['A'])
    })

    it('leaves out a line somebody set aside', () => {
        expect(deliveriesFrom([line({ code: 'A', date: '2026-09-14', perCase: 10, units: 1, decision: 'ignored' })])).toEqual([])
    })

    it('puts them in the order they were printed', () => {
        const later = line({ code: 'A', date: '2026-09-15', perCase: 10, units: 1 })
        const sooner = line({ code: 'A', date: '2026-09-14', perCase: 10, units: 1 })
        expect(deliveriesFrom([later, sooner]).map(d => d.date)).toEqual(['2026-09-14', '2026-09-15'])
    })
})

describe('same product, new price', () => {
    // His own example: the box goes from 11.75 to 8.60.
    const tomatoes = [
        line({ code: '5017962', product: TOMATOES, date: '2026-09-10', perCase: 11.75, units: 6, pack: '1X6 KG' }),
        line({ code: '5017962', product: TOMATOES, date: '2026-09-16', perCase: 11.75, units: 6, pack: '1X6 KG' }),
        line({ code: '5017962', product: TOMATOES, date: '2026-09-17', number: '45638940', perCase: 8.6, units: 6, pack: '1X6 KG', cases: 6 }),
    ]

    it('is the same code against its own last delivery, dated by the invoice', () => {
        const [move] = priceMoves(deliveriesFrom(tomatoes), WEEK)
        expect(move).toMatchObject({
            name: 'Tomatoes', per: 'a case', was: 11.75, now: 8.6, up: false, on: '2026-09-17', invoice: '45638940',
        })
        expect(move.change).toBe(-26.8)
    })

    // His, 7 October: the chart goes back eight weeks, this week's marked.
    it('carries every delivery of the last eight weeks for the chart', () => {
        const old = line({ code: '5017962', product: TOMATOES, date: '2026-07-01', perCase: 12, units: 6, pack: '1X6 KG' })
        const [move] = priceMoves(deliveriesFrom([old, ...tomatoes]), WEEK)
        expect(move.series).toEqual([['2026-09-10', 1.9583, 0], ['2026-09-16', 1.9583, 1], ['2026-09-17', 1.4333, 1]])
    })

    // His, 7 October: Green Peppers said twice, once for each code.
    it('is one row for codes bought either way, with each code\'s prices in words', () => {
        const codes = [
            code({ supplier_code: '483508', alternate_group: 'g' }),
            code({ supplier_code: '5018758', alternate_group: 'g' }),
        ]
        const box = (c, date, perCase) => line({ code: c, product: PEPPERS, date, perCase, units: 5, pack: '1X5 KG' })
        const all = deliveriesFrom([
            box('483508', '2026-09-10', 11.52), box('483508', '2026-09-15', 13.35),
            box('5018758', '2026-09-11', 12.5), box('5018758', '2026-09-16', 14.33),
        ])
        const moves = priceMoves(all, { ...WEEK, codes })
        expect(moves).toHaveLength(1)
        expect(moves[0]).toMatchObject({
            name: 'Green Peppers', codes: ['483508', '5018758'], effect: 3.66, up: true,
            prices: '€11.52 to €13.35 a case on 483508, €12.50 to €14.33 a case on 5018758',
        })
        expect(moves[0].change).toBe(15.2)
        expect(moves[0].series.map(p => p[0])).toEqual(['2026-09-10', '2026-09-11', '2026-09-15', '2026-09-16'])
    })

    it('says what the week paid less, on what came at the new price', () => {
        const [move] = priceMoves(deliveriesFrom(tomatoes), WEEK)
        expect(move.effect).toBe(-18.9)
    })

    // The real week of 13 September: fourteen cases, eight of them before the
    // price changed. The report said fourteen beside a saving on six, and he
    // could not make the two multiply out.
    it('counts only what came at the new price, and what each one came to', () => {
        const week = [
            line({ code: '5017962', product: TOMATOES, date: '2026-09-13', perCase: 11.75, units: 6, pack: '1X6 KG', cases: 5 }),
            line({ code: '5017962', product: TOMATOES, date: '2026-09-16', perCase: 11.75, units: 6, pack: '1X6 KG', cases: 3 }),
            line({ code: '5017962', product: TOMATOES, date: '2026-09-17', perCase: 8.6, units: 6, pack: '1X6 KG', cases: 4 }),
            line({ code: '5017962', product: TOMATOES, date: '2026-09-19', perCase: 8.6, units: 6, pack: '1X6 KG', cases: 2 }),
        ]
        const [move] = priceMoves(deliveriesFrom(week), WEEK)
        expect(move.effect).toBe(-18.9)
        expect(move.split).toBe('6 cases, €3.15 less each')
    })

    it('gives the average when a week had more than one new price', () => {
        const week = [
            ...tomatoes,
            line({ code: '5017962', product: TOMATOES, date: '2026-09-19', perCase: 9.6, units: 6, pack: '1X6 KG', cases: 2 }),
        ]
        const [move] = priceMoves(deliveriesFrom(week), WEEK)
        // Six at 3.15 less and two at 2.15 less: 23.20 over eight.
        expect(move.effect).toBe(-23.2)
        expect(move.split).toBe('8 cases, €2.90 less each on average')
    })

    it("counts in the product's own unit when the pack changed", () => {
        const week = [
            line({ code: '5017962', product: TOMATOES, date: '2026-09-10', perCase: 11.75, units: 6, pack: '1X6 KG' }),
            line({ code: '5017962', product: TOMATOES, date: '2026-09-17', perCase: 5, units: 4, pack: '1X4 KG', cases: 2 }),
        ]
        const [move] = priceMoves(deliveriesFrom(week), WEEK)
        expect(move.per).toBe('a kg')
        expect(move.split).toMatch(/^8 kg, €0\.71 less a kg$/)
    })

    it('compares with a delivery before the week', () => {
        const [move] = priceMoves(deliveriesFrom(tomatoes.slice(0, 1).concat(tomatoes.slice(2))), WEEK)
        expect(move.since).toBe('2026-09-10')
    })

    it('says nothing about a code that cost the same', () => {
        expect(priceMoves(deliveriesFrom(tomatoes.slice(0, 2)), WEEK)).toEqual([])
    })

    it('says nothing about a price that went up and came back inside the week', () => {
        const back = [
            ...tomatoes,
            line({ code: '5017962', product: TOMATOES, date: '2026-09-18', perCase: 11.75, units: 6, pack: '1X6 KG' }),
        ]
        expect(priceMoves(deliveriesFrom(back), WEEK)).toEqual([])
    })

    // A case of ten and one on its own are the same price.
    it('does not call a case and a loose one a price change', () => {
        const cabbage = [
            line({ code: '5018687', product: CABBAGE, date: '2026-09-14', perCase: 14.33, units: 10, pack: '1X10 EA' }),
            line({ code: '5018687', product: CABBAGE, date: '2026-09-16', perCase: 1.43, units: 1, pack: '1X1 EA' }),
        ]
        expect(priceMoves(deliveriesFrom(cabbage), WEEK)).toEqual([])
    })

    it('quotes per unit when the pack changed', () => {
        const moved = [
            line({ code: 'X', product: PEPPERS, date: '2026-09-14', perCase: 12.5, units: 5, pack: '1X5 KG' }),
            line({ code: 'X', product: PEPPERS, date: '2026-09-16', perCase: 3, units: 1, pack: '1X1 KG' }),
        ]
        const [move] = priceMoves(deliveriesFrom(moved), WEEK)
        expect(move).toMatchObject({ per: 'a kg', was: 2.5, now: 3 })
    })

    // Sysco renumbering: the history carries on under the new code.
    it('follows a code into the one that replaced it', () => {
        const lines = [
            line({ code: 'OLD', product: TOMATOES, date: '2026-09-10', perCase: 11.75, units: 6 }),
            line({ code: 'NEW', product: TOMATOES, date: '2026-09-17', perCase: 8.6, units: 6 }),
        ]
        const codes = [code({ supplier_code: 'NEW', replaces_code: 'OLD' })]
        const [move] = priceMoves(deliveriesFrom(lines), { ...WEEK, codes })
        expect(move).toMatchObject({ code: 'NEW', was: 11.75, now: 8.6 })
    })

    // Two cabbage case lines were stored as one cabbage a case on the first
    // fortnight. Fourteen euro a cabbage against one forty is not a price.
    it('keeps a change too big to be a price apart, and never adds it up', () => {
        const lines = [
            line({ code: '5018687', product: CABBAGE, date: '2026-09-19', perCase: 14.33, units: 1, pack: '1X10 EA' }),
            line({ code: '5018687', product: CABBAGE, date: '2026-09-24', perCase: 1.43, units: 1, pack: '1X1 EA' }),
        ]
        const section = priceWeek({ weekStart: '2026-09-20', weekEnd: '2026-09-26', lines })
        expect(section.moves).toEqual([])
        expect(section.doubtful).toHaveLength(1)
        expect(section.totals.moves).toBe(0)
        expect(section.words[0]).toBe('Left out: White Cabbage, more likely a pack read wrong than a real price.')
    })

    it('treats a code seen for the first time as nothing to compare', () => {
        expect(priceMoves(deliveriesFrom([tomatoes[2]]), WEEK)).toEqual([])
    })
})

// The tortillas: Santa Maria is what recipes cost from, the plain wraps came
// once. The peppers: the five kilo box is usual, five one kilo bags came once.
const TORTILLA_PRICES = [
    price({ id: 'santa', product_id: 'tor', supplier_code: '497870', price_per_case: 30.3, units_per_case: 100, price_per_unit: 0.303 }),
    price({ id: 'plain', product_id: 'tor', supplier_code: '5013972', price_per_case: 33.03, units_per_case: 100, price_per_unit: 0.3303, is_preferred: false }),
]
const TORTILLA_CODES = [
    code({ id: 'c-santa', supplier_code: '497870', price_id: 'santa', last_description: 'SANTA MARIA FLOUR TORTILLA WRAP LONG LIFE 12"', pack_size: '10X10 EA' }),
    code({ id: 'c-plain', supplier_code: '5013972', price_id: 'plain', last_description: 'FLOUR PLAIN WRAPS 12"', pack_size: '10X10 EA' }),
]
const santa = (date, over = {}) => line({
    code: '497870', product: TORTILLA, priceId: 'santa', date, perCase: 30.3, units: 100,
    pack: '10X10 EA', description: 'SANTA MARIA FLOUR TORTILLA WRAP LONG LIFE 12"', ...over,
})
const plain = (date, over = {}) => line({
    code: '5013972', product: TORTILLA, priceId: 'plain', date, perCase: 33.03, units: 100,
    pack: '10X10 EA', description: 'FLOUR PLAIN WRAPS 12"', ...over,
})

describe('bought as something else', () => {
    const scope = { ...WEEK, prices: TORTILLA_PRICES, codes: TORTILLA_CODES }

    it('compares a code that is not the usual one with the usual one, per unit', () => {
        const [s] = switchesIn(deliveriesFrom([santa('2026-09-15'), plain('2026-09-18')]), scope)
        expect(s).toMatchObject({
            name: 'Flour Tortilla (Burritos)', bought: 'Flour Plain Wraps 12"', usualPer: 0.303, per: 0.3303,
            usualFrom: 'delivery', unit: 'each', change: 9,
        })
        expect(s.effect).toBe(2.73)
    })

    it('is never a price rise', () => {
        expect(priceMoves(deliveriesFrom([santa('2026-09-15'), plain('2026-09-18')]), scope)).toEqual([])
    })

    it('leaves the usual one out', () => {
        expect(switchesIn(deliveriesFrom([santa('2026-09-15'), santa('2026-09-17')]), scope)).toEqual([])
    })

    it('uses what recipes cost when the usual one has never come on an invoice', () => {
        const [s] = switchesIn(deliveriesFrom([plain('2026-09-18')]), scope)
        expect(s.usualFrom).toBe('recipes')
        expect(s.usualPer).toBe(0.303)
    })

    // Folding the plain wraps' own price away is only safe when it is theirs
    // and nothing is costed from it.
    it('knows whether the price of the one bought instead is safe to fold away', () => {
        const [s] = switchesIn(deliveriesFrom([plain('2026-09-18')]), scope)
        expect(s).toMatchObject({ ownPriceId: 'plain', ownPriceOk: true })
        const shared = TORTILLA_PRICES.map(p => (p.id === 'plain' ? { ...p, product_id: 'something else' } : p))
        const [t] = switchesIn(deliveriesFrom([plain('2026-09-18')]), { ...scope, prices: shared })
        expect(t.ownPriceOk).toBe(false)
    })

    it('does not look like the same thing renumbered when the words are different', () => {
        const [s] = switchesIn(deliveriesFrom([plain('2026-09-18')]), scope)
        expect(s.renumbered).toBe(false)
    })

    // Ginger typed at a price a gram, bought by the kilo.
    it('will not compare two prices counted different ways', () => {
        const ginger = { id: 'gin', name: 'Ginger', unit: 'KG' }
        const prices = [price({ id: 'g', product_id: 'gin', price_per_case: 4.6, units_per_case: 1000, price_per_unit: 0.0046 })]
        const bought = line({ code: 'G1', product: ginger, date: '2026-09-15', perCase: 2.32, units: 0.5, pack: '1X500 GM' })
        const [s] = switchesIn(deliveriesFrom([bought]), { ...WEEK, prices, codes: [] })
        expect(s).toMatchObject({ cannot: true, why: 'units', change: null, effect: 0 })
    })

    // On the report for an earlier week the new number has not come yet, so
    // only the code table can say which one is newer.
    it('asks the code table which number came first, whatever week it is', () => {
        const codes = [
            { ...TORTILLA_CODES[0], first_seen_on: '2026-09-20' },
            { ...TORTILLA_CODES[1], first_seen_on: '2026-09-01' },
        ]
        const [s] = switchesIn(deliveriesFrom([plain('2026-09-18')]), { ...scope, codes })
        expect(s.newer).toBe(false)
    })

    it('knows which of the two numbers came first', () => {
        const [s] = switchesIn(deliveriesFrom([santa('2026-09-14'), plain('2026-09-18')]), scope)
        expect(s.newer).toBe(true)
        const [t] = switchesIn(deliveriesFrom([plain('2026-09-14'), santa('2026-09-18')]), scope)
        expect(t.newer).toBe(false)
    })

    // Ballygowan instead of River Rock at the same price told nobody anything.
    // Food at the same price is still said, since the allergens can differ.
    it('leaves out a drink, a box or a cleaning product at the same price', () => {
        const drink = { id: 'tor', name: 'PET River Rock Sparkling Water (500ml)', unit: 'Units', category: 'drink' }
        const box = { ...drink, category: 'ingredient', section: 'Packaging' }
        const same = p => deliveriesFrom([santa('2026-09-15', { product: p }), plain('2026-09-18', { product: p, perCase: 30.3 })])
        expect(switchesIn(same(drink), scope)).toEqual([])
        expect(switchesIn(same(box), scope)).toEqual([])
        expect(switchesIn(same(TORTILLA), scope)).toHaveLength(1)
        const dearer = deliveriesFrom([santa('2026-09-15', { product: drink }), plain('2026-09-18', { product: drink })])
        expect(switchesIn(dearer, scope)).toHaveLength(1)
    })

    it('says nothing about a product nothing is costed from yet', () => {
        expect(switchesIn(deliveriesFrom([plain('2026-09-18')]), { ...WEEK, prices: [], codes: [] })).toEqual([])
    })
})

describe('the same thing under a new number', () => {
    const usual = {
        row: { id: 'u', supplier_id: 's1' }, description: 'GREEN PEPPERS 1X5 KG', pack: '1X5 KG',
    }

    it('reads the same and comes in the same pack', () => {
        expect(looksRenumbered({ description: 'GREEN PEPPERS 1X5 KG', pack: '1X5 KG', supplierId: 's1' }, usual)).toBe(true)
    })

    // The words match and the pack does not: five one kilo bags are not the
    // five kilo box under a new number.
    it('is not five bags of one kilo instead of a five kilo box', () => {
        expect(looksRenumbered({ description: 'GREEN PEPPERS 1X1 KG', pack: '5X1 KG', supplierId: 's1' }, usual)).toBe(false)
    })

    // They share sparkling, water, the deposit and the pack, and they are two
    // brands.
    it('is not another brand in the same bottle', () => {
        expect(looksRenumbered(
            { description: 'DRS 15C BALLYGOWAN SPARKLING MINERAL WATER 24X500 ML', pack: '24X500 ML', supplierId: 's1' },
            { ...usual, description: 'DRS 15C RIVERROCK SPARKLING WATER PLASTIC BOTTLE 24X500 ML', pack: '24X500 ML' },
        )).toBe(false)
    })

    it('is not a different product', () => {
        expect(looksRenumbered({ description: 'RED PEPPERS 1X5 KG', pack: '1X5 KG', supplierId: 's1' }, {
            ...usual, description: 'GREEN CHILLIES 1X1 KG',
        })).toBe(false)
    })

    it('is offered as a decision, not done on its own', () => {
        const prices = [
            price({ id: 'box', product_id: 'pep', supplier_code: '5018758', price_per_case: 12.5, units_per_case: 5, price_per_unit: 2.5 }),
            price({ id: 'box2', product_id: 'pep', supplier_code: '483508', price_per_case: 11.52, units_per_case: 5, price_per_unit: 2.304, is_preferred: false }),
        ]
        const codes = [
            code({ id: 'c1', supplier_code: '5018758', price_id: 'box', last_description: 'GREEN PEPPERS 1X5 KG', pack_size: '1X5 KG' }),
            code({ id: 'c2', supplier_code: '483508', price_id: 'box2', last_description: 'GREEN PEPPERS 1X5 KG', pack_size: '1X5 KG' }),
        ]
        const lines = [
            line({ code: '5018758', product: PEPPERS, priceId: 'box', date: '2026-09-14', perCase: 12.5, units: 5, pack: '1X5 KG', description: 'GREEN PEPPERS 1X5 KG' }),
            line({ code: '483508', product: PEPPERS, priceId: 'box2', date: '2026-09-17', perCase: 11.52, units: 5, pack: '1X5 KG', description: 'GREEN PEPPERS 1X5 KG' }),
        ]
        const section = priceWeek({ ...WEEK, lines, prices, codes })
        const asked = decisionsFrom(section).filter(d => d.kind === 'renumbered')
        expect(asked).toHaveLength(1)
        expect(asked[0]).toMatchObject({
            code: '483508', codeRowId: 'c2', ownPriceId: 'box2', usualPriceId: 'box', usualCodeRowId: 'c1', usualCode: '5018758',
        })
    })
})

// The green peppers come as 483508 or 5018758 depending on what Sysco has.
// Put in one group, neither is ever bought instead of the other, and recipes
// are checked against what the group cost on average.
describe('codes bought either way', () => {
    const GROUP = 'g1'
    const prices = [
        price({ id: 'box', product_id: 'pep', supplier_code: '483508', price_per_case: 11.52, units_per_case: 5, price_per_unit: 2.304 }),
        price({ id: 'box2', product_id: 'pep', supplier_code: '5018758', price_per_case: 12.5, units_per_case: 5, price_per_unit: 2.5, is_preferred: false }),
    ]
    const codes = [
        code({ id: 'c1', supplier_code: '483508', price_id: 'box', alternate_group: GROUP, first_seen_on: '2026-09-20' }),
        code({ id: 'c2', supplier_code: '5018758', price_id: 'box2', alternate_group: GROUP, first_seen_on: '2026-09-14' }),
    ]
    const box = (codeNo, priceId, date, perCase) => line({
        code: codeNo, product: PEPPERS, priceId, date, perCase, units: 5, pack: '1X5 KG', description: 'GREEN PEPPERS 1X5 KG',
    })
    const WEEK20 = { weekStart: '2026-09-20', weekEnd: '2026-09-26' }

    it('never lists one of them as bought instead of the other', () => {
        const all = deliveriesFrom([box('483508', 'box', '2026-09-21', 11.52), box('5018758', 'box2', '2026-09-23', 12.5)])
        expect(switchesIn(all, { ...WEEK20, prices, codes })).toEqual([])
    })

    it('never calls a swap between them a price change', () => {
        const all = deliveriesFrom([
            box('483508', 'box', '2026-09-14', 11.52), box('5018758', 'box2', '2026-09-21', 12.5),
            box('483508', 'box', '2026-09-23', 11.52),
        ])
        expect(priceMoves(all, { ...WEEK20, codes })).toEqual([])
    })

    it('checks recipes against what the group cost on average, weighted by what came', () => {
        const all = deliveriesFrom([
            box('483508', 'box', '2026-09-21', 11.52), box('5018758', 'box2', '2026-09-23', 12.5),
        ])
        const dear = prices.map(p => (p.id === 'box' ? { ...p, price_per_unit: 3.326, price_per_case: 16.63 } : p))
        const [gap] = recipeGaps(all, { ...WEEK20, prices: dear, codes, threshold: 5 })
        expect(gap.paid).toBe(2.402)
        expect(gap.averaged).toEqual({ deliveries: 2, since: '2026-09-21' })
        expect(gap.newCase).toBe(12.01)
    })

    // The whole point: one then the other must not put it on the report and
    // off it again.
    it('leaves a group off the report when the average is close to what recipes say', () => {
        const all = deliveriesFrom([
            box('483508', 'box', '2026-09-21', 11.52), box('5018758', 'box2', '2026-09-23', 12.5),
        ])
        const middle = prices.map(p => (p.id === 'box' ? { ...p, price_per_unit: 2.4, price_per_case: 12 } : p))
        expect(recipeGaps(all, { ...WEEK20, prices: middle, codes, threshold: 5 })).toEqual([])
    })

    it('never suggests the other one as the usual after three in a row', () => {
        const all = deliveriesFrom([
            box('5018758', 'box2', '2026-09-20', 12.5), box('5018758', 'box2', '2026-09-22', 12.5),
            box('5018758', 'box2', '2026-09-24', 12.5),
        ])
        expect(usualSuggestions(all, { ...WEEK20, prices, codes })).toEqual([])
    })

    it('carries each code on its own, one at a time, when nobody has grouped them', () => {
        const all = deliveriesFrom([box('483508', 'box', '2026-09-21', 11.52), box('5018758', 'box2', '2026-09-23', 12.5)])
        const apart = codes.map(c => ({ ...c, alternate_group: null }))
        const [s] = switchesIn(all, { ...WEEK20, prices, codes: apart })
        expect(s).toMatchObject({ code: '5018758', codeRowId: 'c2', usualCodeRowId: 'c1', group: null, usualGroup: null })
    })
})

describe('three in a row', () => {
    const scope = { ...WEEK, prices: TORTILLA_PRICES, codes: TORTILLA_CODES }

    it('asks whether the other one is the usual one now', () => {
        const all = deliveriesFrom([santa('2026-09-08'), plain('2026-09-10'), plain('2026-09-14'), plain('2026-09-17')])
        const [s] = usualSuggestions(all, scope)
        expect(s).toMatchObject({ productId: 'tor', code: '5013972', priceId: 'plain', fromPriceId: 'santa' })
    })

    it('counts deliveries, not lines', () => {
        const all = deliveriesFrom([
            santa('2026-09-08'), plain('2026-09-14', { invoiceId: 'x', number: 'x' }),
            plain('2026-09-14', { invoiceId: 'x', number: 'x' }), plain('2026-09-17'),
        ])
        expect(usualSuggestions(all, scope)).toEqual([])
    })

    it('does not ask when the usual one came in between', () => {
        const all = deliveriesFrom([plain('2026-09-10'), santa('2026-09-12'), plain('2026-09-14'), plain('2026-09-17')])
        expect(usualSuggestions(all, scope)).toEqual([])
    })

    it('never offers a version counted a different way from the one recipes use', () => {
        const dear = TORTILLA_PRICES.map(p => (p.id === 'santa' ? { ...p, price_per_unit: 0.003 } : p))
        const all = deliveriesFrom([santa('2026-09-08'), plain('2026-09-10'), plain('2026-09-14'), plain('2026-09-17')])
        expect(usualSuggestions(all, { ...scope, prices: dear })).toEqual([])
    })

    // Recipes would cost from that price, so it has to have one, and a second
    // price already marked preferred is a muddle to sort out by hand.
    it('never offers a price with nothing on it, or one already preferred', () => {
        const all = deliveriesFrom([santa('2026-09-08'), plain('2026-09-10'), plain('2026-09-14'), plain('2026-09-17')])
        const empty = TORTILLA_PRICES.map(p => (p.id === 'plain' ? { ...p, price_per_unit: null } : p))
        expect(usualSuggestions(all, { ...scope, prices: empty })).toEqual([])
        const both = TORTILLA_PRICES.map(p => (p.id === 'plain' ? { ...p, is_preferred: true } : p))
        expect(usualSuggestions(all, { ...scope, prices: both })).toEqual([])
    })

    it('says what the Hub would cost it at', () => {
        const all = deliveriesFrom([santa('2026-09-08'), plain('2026-09-10'), plain('2026-09-14'), plain('2026-09-17')])
        expect(usualSuggestions(all, scope)[0].rowPer).toBe(0.3303)
    })

    it('only asks about now', () => {
        const all = deliveriesFrom([plain('2026-09-01'), plain('2026-09-03'), plain('2026-09-05')])
        expect(usualSuggestions(all, scope)).toEqual([])
    })
})

describe('recipes not costing what we pay', () => {
    const avocado = { id: 'avo', name: 'Avocado', unit: 'Units' }
    const prices = [price({ id: 'avo-18', product_id: 'avo', supplier_code: '5018435', price_per_case: 16.5, units_per_case: 18, price_per_unit: 0.9167 })]
    const codes = [code({ id: 'c-avo', supplier_code: '5018435', price_id: 'avo-18' })]
    const box = (date, over = {}) => line({
        code: '5018435', product: avocado, priceId: 'avo-18', date, perCase: 23.29, units: 18, pack: '1X18 EA', ...over,
    })

    it('lists a product more than the threshold off what was last paid for the usual one', () => {
        const [gap] = recipeGaps(deliveriesFrom([box('2026-09-15')]), { ...WEEK, prices, codes, threshold: 5 })
        expect(gap).toMatchObject({ name: 'Avocado', state: 'behind', recipe: 0.9167, paid: 1.2939, newCase: 23.29, priceId: 'avo-18' })
        expect(gap.gap).toBe(41.1)
        expect(gap.effect).toBe(6.79)
    })

    // Keeping the old price is "not now", never "do not tell me".
    it('stays on the report in a week it was not bought, with nothing on the week', () => {
        const [gap] = recipeGaps(deliveriesFrom([box('2026-09-01')]), { ...WEEK, prices, codes })
        expect(gap.state).toBe('behind')
        expect(gap.effect).toBe(0)
    })

    it('leaves it off once the two are within the threshold', () => {
        const near = [price({ ...prices[0], price_per_unit: 1.25 })]
        expect(recipeGaps(deliveriesFrom([box('2026-09-15')]), { ...WEEK, prices: near, codes, threshold: 5 })).toEqual([])
    })

    it('follows the restaurant\'s own threshold', () => {
        const near = [price({ ...prices[0], price_per_unit: 1.25 })]
        expect(recipeGaps(deliveriesFrom([box('2026-09-15')]), { ...WEEK, prices: near, codes, threshold: 2 })).toHaveLength(1)
    })

    it('has no case price to offer for a price kept per loose unit', () => {
        const loose = [price({ ...prices[0], units_per_case: null, price_per_case: null })]
        const [gap] = recipeGaps(deliveriesFrom([box('2026-09-15')]), { ...WEEK, prices: loose, codes, threshold: 5 })
        expect(gap.newCase).toBeNull()
    })

    it('says when recipes cost more than we pay', () => {
        const dear = [price({ ...prices[0], price_per_unit: 1.6 })]
        const [gap] = recipeGaps(deliveriesFrom([box('2026-09-15')]), { ...WEEK, prices: dear, codes })
        expect(gap.state).toBe('high')
    })

    it('carries a different pack up to the row\'s own when recipes are to cost from it', () => {
        const [gap] = recipeGaps(deliveriesFrom([box('2026-09-15', { perCase: 2.59, units: 2, pack: '1X2 EA' })]), { ...WEEK, prices, codes })
        expect(gap.newCase).toBe(23.31)
    })

    it('is only the usual one, never something bought instead', () => {
        const other = line({ code: 'OTHER', product: avocado, date: '2026-09-15', perCase: 30, units: 18, pack: '1X18 EA' })
        expect(recipeGaps(deliveriesFrom([other]), { ...WEEK, prices, codes })).toEqual([])
    })

    // Recipes count it in kilos and Sysco sells it one at a time.
    it('says a product cannot be compared, in a week it was bought', () => {
        const cabbagePrices = [price({ id: 'cab-1', product_id: 'cab', supplier_code: '5018687', price_per_case: 1.43, units_per_case: 1, price_per_unit: 1.43 })]
        const cabbageCodes = [code({ supplier_code: '5018687', price_id: 'cab-1' })]
        const bought = line({ code: '5018687', product: CABBAGE, priceId: 'cab-1', date: '2026-09-16', perCase: 1.43, units: 1, pack: '1X1 EA' })
        const [gap] = recipeGaps(deliveriesFrom([bought]), { ...WEEK, prices: cabbagePrices, codes: cabbageCodes })
        expect(gap.state).toBe('cannot')
        expect(recipeGaps(deliveriesFrom([{ ...bought, invoices: { ...bought.invoices, invoice_date: '2026-09-01' } }]),
            { ...WEEK, prices: cabbagePrices, codes: cabbageCodes })).toEqual([])
    })
})

describe('what is too far apart to be a price', () => {
    it('is four times either way, or nothing to compare with', () => {
        expect(outOfReason(1.43, 14.33)).toBe(true)
        expect(outOfReason(4.64, 0.0046)).toBe(true)
        expect(outOfReason(3.33, 2.3)).toBe(false)
        expect(outOfReason(1, null)).toBe(true)
    })
})

// Once the product says what one weighs, a case of ten cabbages is priced by
// the kilo and can be checked against recipes like anything else.
describe('something sold by the piece once its weight is known', () => {
    const WEIGHED = { ...CABBAGE, piece_weight: 1.2 }

    it('prices a case of pieces by the kilo', () => {
        const [d] = deliveriesFrom([line({ code: '5018687', product: WEIGHED, date: '2026-09-15', perCase: 14.33, units: 10, pack: '1X10 EA' })])
        expect(d.units).toBe(12)
        expect(d.perUnit).toBeCloseTo(1.1942, 4)
    })

    it('reads a case and a single one as the same price a kilo', () => {
        const all = deliveriesFrom([
            line({ code: '5018687', product: WEIGHED, date: '2026-09-14', perCase: 14.33, units: 1, pack: '1X10 EA' }),
            line({ code: '5018687', product: WEIGHED, date: '2026-09-16', perCase: 1.43, units: 1, pack: '1X1 EA' }),
        ])
        expect(priceMoves(all, WEEK)).toEqual([])
    })

    it('can be compared once the weight is known', () => {
        expect(cannotCompare({ perUnit: 1.19, pack: '1X10 EA', product: WEIGHED })).toBe(false)
    })
})

describe('what cannot be compared', () => {
    it('is something counted by weight and sold by the each', () => {
        expect(cannotCompare({ perUnit: 1.43, pack: '1X10 EA', product: CABBAGE })).toBe(true)
        expect(cannotCompare({ perUnit: 1.43, pack: '1X6 KG', product: TOMATOES })).toBe(false)
        expect(cannotCompare({ perUnit: 0.3, pack: '10X10 EA', product: TORTILLA })).toBe(false)
    })

    it('is anything with no price for one', () => {
        expect(cannotCompare({ perUnit: null, pack: '1X6 KG', product: TOMATOES })).toBe(true)
    })
})

describe('came back, and why', () => {
    const invoices = [{ id: 'i1', invoice_number: '45612214', invoice_date: '2026-09-14', total_amount: 120.5 }]
    const credit = (over = {}) => ({
        id: 'c1', invoice_number: 'C45627506', invoice_date: '2026-09-14', total_amount: -120.5,
        credit_of_invoice_id: 'i1', credit_reason: null,
        invoice_lines: [{ raw_description: 'RED ONIONS 1X10 KG', products: null }],
        ...over,
    })

    it('says so when nothing was logged, and counts the money as waiting for a reason', () => {
        const [row] = cameBack([credit()], [], { ...WEEK, invoices })
        expect(row.parts).toEqual([{ kind: 'other', label: 'No reason logged', colour: '#9CA3AF', money: 120.5, what: 'Red Onions 1x10 Kg' }])
        expect(row.unexplained).toBe(120.5)
    })

    // Sysco never delivered them and credited all three.
    // His, 7 October: "Paprika, Chorizo" under short and under wrong item.
    it('names under each reason only the lines it was for', () => {
        const two = credit({
            credit_of_invoice_id: null, total_amount: -37.04,
            invoice_lines: [
                { raw_description: 'SYSCO CLASSIC PAPRIKA PEPPER 1X480 GM', line_total: -16.05, products: null },
                { raw_description: 'CHORIZO CUBES 1X500 GM', line_total: -20.99, products: null },
            ],
        })
        const claims = [
            { id: 'k1', credit_invoice_id: 'c1', kind: 'short', what: '1 Unit of Chorizo delivered instead of 1 case.', credited_amount: 20.99, status: 'settled' },
            { id: 'k2', credit_invoice_id: 'c1', kind: 'wrong_item', what: 'Delivered red chili powder', credited_amount: 16.05, status: 'settled' },
        ]
        const [row] = cameBack([two], claims, WEEK)
        expect(row.parts.map(p => [p.kind, p.what])).toEqual([
            ['short', 'Chorizo Cubes 1x500 Gm'], ['wrong_item', 'Sysco Classic Paprika Pepper 1x480 Gm'],
        ])
        const rows = backByReason(reasonsOf([row]), [row]).flatMap(r => r.rows.map(x => x.what))
        expect(rows).toEqual(['Chorizo Cubes 1x500 Gm', 'Sysco Classic Paprika Pepper 1x480 Gm'])
    })

    it('says a whole delivery came back', () => {
        const [row] = cameBack([credit()], [], { ...WEEK, invoices })
        expect(row.whole).toBe(true)
        expect(row.what).toBe('The whole delivery of 14 September')
        expect(row.against).toEqual({ number: '45612214', date: '2026-09-14' })
    })

    it('takes the reason given afterwards, as a label only', () => {
        const [row] = cameBack([credit({ credit_reason: 'not_delivered' })], [], { ...WEEK, invoices })
        expect(row.parts[0]).toMatchObject({ kind: 'not_delivered', label: 'Not delivered', money: 120.5 })
        expect(row.unexplained).toBe(0)
    })

    it('takes the reason from the claim logged at the door, and the rest has none', () => {
        const claims = [
            { id: 'k1', credit_invoice_id: 'c1', kind: 'damaged', credited_amount: 35.84, status: 'settled' },
            { id: 'k2', credit_invoice_id: 'c1', kind: 'other', credited_amount: 84.66, status: 'settled' },
        ]
        const [row] = cameBack([credit({ credit_of_invoice_id: null })], claims, WEEK)
        expect(row.parts).toEqual([
            { kind: 'damaged', label: 'Damaged', colour: '#F97316', money: 35.84, what: 'Red Onions 1x10 Kg' },
            { kind: 'other', label: 'No reason logged', colour: '#9CA3AF', money: 84.66, what: null },
        ])
        expect(row.logged).toBe(true)
        expect(row.what).toBe('Red Onions 1x10 Kg')
    })

    it('only takes this week\'s credit notes', () => {
        expect(cameBack([credit({ invoice_date: '2026-09-20' })], [], WEEK)).toEqual([])
    })

    it('adds the reasons up across the week, biggest first', () => {
        const rows = [
            { parts: [{ kind: 'damaged', label: 'Damaged', colour: '#F97316', money: 35.84 }] },
            { parts: [{ kind: 'not_delivered', label: 'Not delivered', colour: '#64748B', money: 378.4 }] },
            { parts: [{ kind: 'damaged', label: 'Damaged', colour: '#F97316', money: 4.16 }] },
        ]
        expect(reasonsOf(rows).map(r => [r.kind, r.money])).toEqual([['not_delivered', 378.4], ['damaged', 40]])
    })
})

describe('still owed', () => {
    it('is every open claim, oldest first, whatever week it came from', () => {
        const owed = stillOwed([
            { id: 'b', what: 'bowls', kind: 'price', amount: 24.75, credited_amount: 0, status: 'open', raised_on: '2026-09-24' },
            { id: 'a', what: 'chicken', kind: 'short', amount: 20, credited_amount: 0, status: 'open', raised_on: '2026-09-02' },
            { id: 'c', what: 'done', kind: 'short', amount: 5, credited_amount: 5, status: 'settled', raised_on: '2026-09-01' },
        ])
        expect(owed.map(o => o.id)).toEqual(['a', 'b'])
        expect(owed[1]).toMatchObject({ label: 'Price query', money: 24.75, since: '2026-09-24' })
    })
})

describe('new to the Hub', () => {
    it('is a code delivered for the first time this week', () => {
        const all = deliveriesFrom([
            line({ code: 'OLD', date: '2026-09-05', perCase: 1, units: 1 }),
            line({ code: 'OLD', date: '2026-09-15', perCase: 1, units: 1 }),
            line({ code: 'FRESH', date: '2026-09-15', perCase: 1, units: 1, description: 'NEW THING' }),
        ])
        expect(newCodes(all, WEEK)).toEqual([{ code: 'FRESH', name: 'New Thing', matched: false, on: '2026-09-15', invoice: 'inv-2026-09-15' }])
    })

    it('is not a code that replaced another', () => {
        const all = deliveriesFrom([line({ code: 'NEW', date: '2026-09-15', perCase: 1, units: 1 })])
        expect(newCodes(all, { ...WEEK, codes: [code({ supplier_code: 'NEW', replaces_code: 'OLD' })] })).toEqual([])
    })
})

describe('the whole section', () => {
    const lines = [
        line({ code: '5017962', product: TOMATOES, date: '2026-09-10', perCase: 11.75, units: 6, pack: '1X6 KG' }),
        line({ code: '5017962', product: TOMATOES, date: '2026-09-17', perCase: 8.6, units: 6, pack: '1X6 KG', cases: 6 }),
        santa('2026-09-15'),
        plain('2026-09-18'),
    ]
    const section = priceWeek({
        ...WEEK, lines, prices: TORTILLA_PRICES, codes: TORTILLA_CODES, threshold: 5, today: '2026-09-25',
    })

    it('adds up the four figures on top', () => {
        expect(section.totals).toMatchObject({
            moves: -18.9, movesDown: 1, movesUp: 0, switches: 2.73, recipes: 0, back: 0, owedCount: 0,
        })
        expect(section).toMatchObject({ checkedOn: '2026-09-25', threshold: 5 })
    })

    // A headline a kind, what kind of thing it is before the colon: his
    // choice for the mail on 26 September.
    it('says the week as a headline a kind, once, for the mail', () => {
        expect(section.words[0]).toBe('Cheaper on the same code: Tomatoes, €18.90 less this week.')
        expect(section.words[1]).toBe('Bought as something else: Flour Plain Wraps 12" for Flour Tortilla (Burritos), €2.73 more than the usual one.')
    })

    it('is plain figures and words, so it can be frozen', () => {
        expect(JSON.parse(JSON.stringify(section))).toEqual(section)
    })
})

describe('the words', () => {
    it('has something to say about a quiet week', () => {
        expect(priceWords({})).toEqual(['Nothing moved on prices this week and nothing came back.'])
    })

    it('says what came back by reason', () => {
        const back = [{ money: 387.67, parts: [
            { kind: 'not_delivered', label: 'Not delivered', money: 378.4 },
            { kind: 'other', label: 'No reason logged', money: 9.27 },
        ] }]
        expect(priceWords({ back, totals: { back: 387.67 } })).toEqual([
            'Came back: €387.67 on 1 credit note, €378.40 of it not delivered.',
        ])
    })

    it('says so when nobody has given a reason yet', () => {
        const back = [{ money: 97.42, parts: [{ kind: 'other', label: 'No reason logged', money: 97.42 }] }]
        expect(priceWords({ back, totals: { back: 97.42 } })).toEqual([
            'Came back: €97.42 on 1 credit note, all of it with no reason logged yet.',
        ])
    })

    it('names three and counts the rest', () => {
        const moves = ['Tomatoes', 'Coke Zero', 'Coca-Cola', 'Limes', 'Mango'].map(name => ({ name }))
        expect(priceWords({ moves, totals: { moves: -30, movesDown: 5 } })[0])
            .toBe('Cheaper on the same code: Tomatoes, Coke Zero, Coca-Cola and 2 others, €30.00 less this week.')
    })

    it('says when prices went both ways', () => {
        const moves = [{ name: 'Tomatoes' }, { name: 'Limes' }]
        expect(priceWords({ moves, totals: { moves: 2.5, movesUp: 1, movesDown: 1 } })[0])
            .toBe('New prices on the same code: 1 up and 1 down, Tomatoes and Limes, €2.50 more this week.')
    })

    it('says what is still owed', () => {
        const owed = [{ money: 24.75 }]
        expect(priceWords({ owed, totals: { owed: 24.75 } })).toEqual(['Still owed: €24.75 on 1 delivery problem.'])
    })

    it('says what cannot be checked', () => {
        expect(priceWords({ recipes: [{ name: 'White Cabbage', state: 'cannot' }] })).toEqual([
            'Cannot be checked: White Cabbage.',
        ])
    })

    it('says which way recipes are out', () => {
        const recipes = [
            { name: 'Avocado', state: 'behind', gap: 41.2 },
            { name: 'Green Peppers', state: 'high', gap: -24.8 },
        ]
        expect(priceWords({ recipes, threshold: 5 })[0]).toBe(
            'Recipes out of line: Avocado (costed 41% under what we pay) and Green Peppers (costed 25% over what we pay).',
        )
    })
})

// His decision of 1 October: a claim on a delivery whose report had already
// gone out comes off the first week still open, and that week's report says
// which delivery it is from, or its food cost is lower with nothing saying why.
describe('from an earlier week', () => {
    const claims = [
        {
            id: 'm', what: 'COKE ZERO 24X330ML', kind: 'short', amount: 22.34, credited_amount: 0, status: 'open',
            raised_on: '2026-09-11', counted_week: '2026-09-13', invoice_id: 'i0',
        },
        {
            id: 'h', what: 'chicken', kind: 'short', amount: 20, credited_amount: 0, status: 'open',
            raised_on: '2026-09-14', counted_week: '2026-09-13', invoice_id: 'i1',
        },
    ]
    const invoices = [{ id: 'i0', invoice_date: '2026-09-11' }, { id: 'i1', invoice_date: '2026-09-14' }]
    const section = priceWeek({ ...WEEK, claims, invoices, today: '2026-09-25' })

    it('lists the claim taken off this week for an earlier delivery, and only that one', () => {
        expect(section.earlier).toEqual([expect.objectContaining({ id: 'm', delivered: '2026-09-06', money: 22.34 })])
        expect(section.totals).toMatchObject({ earlier: 22.34, earlierCount: 1 })
    })

    it('says so in the words, with the week it is from', () => {
        expect(section.words).toContain(
            'From an earlier week: €22.34 on COKE ZERO 24X330ML, from the delivery in the week of 6 September, '
            + 'whose report had already been sent.',
        )
    })

    it('counts several, and names their weeks', () => {
        const more = [
            { money: 22.34, what: 'a', delivered: '2026-09-06' },
            { money: 10, what: 'b', delivered: '2026-08-30' },
        ]
        expect(priceWords({ earlier: more, totals: { earlier: 32.34 } })).toEqual([
            'From earlier weeks: €32.34 on 2 delivery problems, from the deliveries in the weeks of 30 August and 6 September, '
            + 'whose reports had already been sent.',
        ])
    })
})

describe('what somebody has to decide', () => {
    it('is recipes that are off, three in a row, and a credit nobody explained', () => {
        const section = {
            recipes: [{ state: 'behind', productId: 'a' }, { state: 'cannot', productId: 'b' }],
            suggestions: [{ productId: 'c', code: 'X' }],
            back: [{ id: 'k', unexplained: 9.27 }, { id: 'j', unexplained: 0 }],
            switches: [],
        }
        expect(decisionsFrom(section).map(d => d.kind)).toEqual(['recipe', 'usual', 'reason'])
    })

    it('is nothing for a quiet week', () => {
        expect(decisionsFrom(null)).toEqual([])
    })

    // Its button would change today's prices, which have moved on already.
    it('leaves out what today\'s prices have moved past', () => {
        const since = { per: 1.2939, usual: false }
        const section = {
            recipes: [{ state: 'behind', productId: 'a', since }],
            suggestions: [{ productId: 'c', code: 'X', since }],
            switches: [{ productId: 'd', code: 'Y', renumbered: true, usualPriceId: 'p', codeRowId: 'k', since }],
            back: [],
        }
        expect(decisionsFrom(section)).toEqual([])
    })
})

// His, 5 October: accepting week 39's invoices changed week 38's report.
describe('a week read as it stood', () => {
    const WEEK38 = { weekStart: '2026-09-20', weekEnd: '2026-09-26' }
    const avocado = { id: 'avo', name: 'Avocado', unit: 'Units' }
    const codes = [code({ id: 'c-avo', supplier_code: '5018435', price_id: 'avo-18' })]
    const box = date => line({
        code: '5018435', product: avocado, priceId: 'avo-18', date, perCase: 23.29, units: 18, pack: '1X18 EA',
    })
    // Today's: recipes cost it at `per`, after a decision on 4 October.
    const today = per => [price({ id: 'avo-18', product_id: 'avo', supplier_code: '5018435', price_per_case: per * 18, units_per_case: 18, price_per_unit: per })]
    const created = { product_id: 'avo', price_id: 'avo-18', reason: 'created', price_per_unit: 0.9167, at: '2026-08-30T12:00:00+00:00' }
    const acceptedOn = (day, per = 1.2939) => ({
        product_id: 'avo', price_id: 'avo-18', reason: 'invoice', price_per_unit: per, previous_per_unit: 0.9167,
        at: '2026-10-04T12:00:00+00:00', invoice_lines: { invoices: { invoice_date: day } },
    })
    const week38 = (events, per = 1.2939) => priceWeek({
        ...WEEK38, lines: [box('2026-09-22')], prices: today(per), codes, events, threshold: 5, today: '2026-10-05',
    })

    it('is not moved by a decision on the next week\'s invoice', () => {
        const section = week38([created, acceptedOn('2026-09-29', 1.1)], 1.1)
        expect(section.recipes).toHaveLength(1)
        expect(section.recipes[0]).toMatchObject({ recipe: 0.9167, paid: 1.2939, state: 'behind' })
        expect(section.checkedOn).toBe('2026-09-26')
    })

    // Its button would act on today's price, which has moved on already.
    it('says what recipes cost now and asks nothing', () => {
        const section = week38([created, acceptedOn('2026-09-29', 1.1)], 1.1)
        expect(section.recipes[0].since).toEqual({ per: 1.1, usual: true })
        expect(decisionsFrom(section)).toEqual([])
    })

    // His, 7 October: fixed already is not news.
    it('says nothing once recipes cost what the week paid', () => {
        const section = week38([created, acceptedOn('2026-09-29')])
        expect(section.recipes).toEqual([])
        expect(section.totals.recipes).toBe(0)
    })

    it('is moved by a late decision on its own invoice', () => {
        expect(week38([created, acceptedOn('2026-09-22')]).recipes).toEqual([])
    })

    it('reads today\'s prices without the events', () => {
        expect(week38(null).recipes).toEqual([])
    })
})

describe('the helpers', () => {
    it('follows a chain of renumberings', () => {
        const lineage = lineageOf([
            code({ supplier_code: 'C', replaces_code: 'B' }),
            code({ supplier_code: 'B', replaces_code: 'A' }),
        ])
        expect(lineage('s1|C')).toEqual(['s1|C', 's1|B', 's1|A'])
    })

    it('does not go round in circles', () => {
        const lineage = lineageOf([
            code({ supplier_code: 'A', replaces_code: 'B' }),
            code({ supplier_code: 'B', replaces_code: 'A' }),
        ])
        expect(lineage('s1|A')).toEqual(['s1|A', 's1|B'])
    })

    it('calls a thing by its name in the Hub, or tidies the supplier\'s', () => {
        expect(nameOf({ product: { name: 'Tomatoes' } })).toBe('Tomatoes')
        expect(nameOf({ description: 'FLOUR PLAIN WRAPS' })).toBe('Flour Plain Wraps')
        expect(nameOf({ description: 'CONTAINER NO.1 (9X50Â€™S)' })).toBe("Container No.1 (9x50's)")
    })

    it('says a unit the way a price is said', () => {
        expect(unitWord('KG')).toBe('a kg')
        expect(unitWord('Litre')).toBe('a litre')
        expect(unitWord('Units')).toBe('each')
    })

    it('finds the one recipes cost from and its code', () => {
        const usual = usualFor('tor', TORTILLA_PRICES, TORTILLA_CODES)
        expect(usual).toMatchObject({ code: '497870', codeRowId: 'c-santa', pack: '10X10 EA' })
        expect(usual.row.id).toBe('santa')
    })

    it('reads half a year back', () => {
        expect(lookBackFrom('2026-09-13')).toBe('2026-03-15')
    })
})

describe('the key a claim gets on the list', () => {
    it('is the claim itself', () => {
        expect(claimKey({ id: 'c1' })).toBe('claim:c1')
    })
})

function claim(over = {}) {
    return {
        id: 'c1',
        kind: 'short',
        what: 'two trays of chicken',
        amount: 69.98,
        credited_amount: 0,
        status: 'open',
        raised_on: '2026-09-14',
        counted_week: '2026-09-13',
        ...over,
    }
}

describe('the claims that belong on the list of jobs', () => {
    it('adds an open claim that is not on the list yet', () => {
        const { add } = claimActions([claim()], [], '2026-09-13')
        expect(add).toHaveLength(1)
        expect(add[0]).toMatchObject({ kind: 'action', key: 'claim:c1', opened_on: '2026-09-13' })
        expect(add[0].label).toContain('two trays of chicken')
    })

    it('never adds the same claim twice', () => {
        const items = [{ kind: 'action', key: 'claim:c1', done_on: null }]
        expect(claimActions([claim()], items, '2026-09-13').add).toEqual([])
    })

    it('ticks off one that has been settled since', () => {
        const items = [{ kind: 'action', key: 'claim:c1', done_on: null }]
        const settled = claim({ status: 'settled', credited_amount: 69.98 })
        expect(claimActions([settled], items, '2026-09-13').tick).toHaveLength(1)
    })

    it('leaves one already ticked alone', () => {
        const items = [{ kind: 'action', key: 'claim:c1', done_on: '2026-09-20' }]
        expect(claimActions([claim({ status: 'settled' })], items, '2026-09-13').tick).toEqual([])
    })

    it('ignores the other kinds of line on the section', () => {
        const items = [{ kind: 'comment', key: 'claim:c1' }, { kind: 'action', key: 'call the landlord' }]
        const { add, tick } = claimActions([claim()], items, '2026-09-13')
        expect(add).toHaveLength(1)
        expect(tick).toEqual([])
    })

    // Crossed off when they said no, and asked again the same week. Nothing
    // offered to put it back, so the list stopped chasing a claim that was
    // still owed.
    it('puts back a job crossed off whose claim is open again, with its money brought up to date', () => {
        const items = [{
            id: 'a1', kind: 'action', key: 'claim:c1', done_on: '2026-09-20',
            label: 'Chase the credit for two trays of chicken (short) (69.98)',
        }]
        const { add, tick, reopen } = claimActions([claim({ credited_amount: 20 })], items, '2026-09-13')
        expect(add).toEqual([])
        expect(tick).toEqual([])
        expect(reopen).toEqual([{
            id: 'a1', patch: { done_on: null, label: 'Chase the credit for two trays of chicken (short) (€49.98)' },
        }])
    })

    it('leaves a crossed off job alone while its claim stays closed', () => {
        const items = [{ id: 'a1', kind: 'action', key: 'claim:c1', done_on: '2026-09-20', label: 'Chase it' }]
        expect(claimActions([claim({ status: 'refused' })], items, '2026-09-13').reopen).toEqual([])
    })

    // A tick by hand is dated the report's own week, and the Hub's the day
    // its button was pressed. Somebody who rang them and ticked it while the
    // claim is still open had it unticked by the next press of the button.
    it('leaves a job ticked by hand alone while its claim is still open', () => {
        const items = [{ id: 'a1', kind: 'action', key: 'claim:c1', done_on: '2026-09-13', label: claimLabel(claim()) }]
        expect(claimActions([claim()], items, '2026-09-13').reopen).toEqual([])
    })

    // Changed, put on its line, or part credited, the money in the words goes
    // stale while the claim is still being chased.
    it('brings the words up to date on a job still open', () => {
        const items = [{
            id: 'a1', kind: 'action', key: 'claim:c1', done_on: null,
            label: 'Chase the credit for 3 cases of chorizo (short)',
        }]
        expect(claimActions([claim({ what: 'Chorizo', amount: 21 })], items, '2026-09-13').relabel).toEqual([{
            id: 'a1', patch: { label: 'Chase the credit for Chorizo (short) (€21.00)' },
        }])
    })

    it('has nothing to bring up to date when the words are right', () => {
        const items = [{ id: 'a1', kind: 'action', key: 'claim:c1', done_on: null, label: claimLabel(claim()) }]
        expect(claimActions([claim()], items, '2026-09-13').relabel).toEqual([])
    })

    // The words can be typed over on the report, and what somebody wrote is
    // theirs.
    it('leaves words somebody typed over alone', () => {
        const typed = 'Chase the credit for two trays of chicken (short) (69.98), rang them Tuesday'
        const open = [{ id: 'a1', kind: 'action', key: 'claim:c1', done_on: null, label: typed }]
        expect(claimActions([claim({ amount: 21 })], open, '2026-09-13').relabel).toEqual([])
        const done = [{ ...open[0], done_on: '2026-09-20' }]
        expect(claimActions([claim({ amount: 21 })], done, '2026-09-13').reopen).toEqual([
            { id: 'a1', patch: { done_on: null } },
        ])
    })

    // A remark in brackets on the end was read as the reason, and the
    // remark went when the words were brought up to date.
    it('leaves a remark typed in brackets on the end alone', () => {
        for (const typed of [
            'Chase the credit for two trays of chicken (short) (69.98) (rang Tuesday)',
            'Chase the credit for two trays of chicken (rang them, said Friday)',
        ]) {
            const open = [{ id: 'a1', kind: 'action', key: 'claim:c1', done_on: null, label: typed }]
            expect(claimActions([claim({ amount: 21 })], open, '2026-09-13').relabel).toEqual([])
            const done = [{ ...open[0], done_on: '2026-09-20' }]
            expect(claimActions([claim({ amount: 21 })], done, '2026-09-13').reopen).toEqual([
                { id: 'a1', patch: { done_on: null } },
            ])
        }
    })

    // A claim's reason can be changed, and the words the Hub wrote for the
    // old one are still its own. Brackets in what it was are its own too.
    it('still brings its own words up to date after the reason changed', () => {
        const items = [{
            id: 'a1', kind: 'action', key: 'claim:c1', done_on: null,
            label: 'Chase the credit for Chorizo (sliced) (no reason logged) (41.99)',
        }]
        expect(claimActions([claim({ what: 'Chorizo (sliced)', amount: 21 })], items, '2026-09-13').relabel).toEqual([{
            id: 'a1', patch: { label: 'Chase the credit for Chorizo (sliced) (short) (€21.00)' },
        }])
    })

    it('brings up to date words it wrote with the euro sign on', () => {
        const items = [{
            id: 'a1', kind: 'action', key: 'claim:c1', done_on: null,
            label: 'Chase the credit for Chorizo (short) (€1,250.00)',
        }]
        expect(claimActions([claim({ what: 'Chorizo', amount: 21 })], items, '2026-09-13').relabel).toEqual([{
            id: 'a1', patch: { label: 'Chase the credit for Chorizo (short) (€21.00)' },
        }])
    })

    it('says what is being chased and what it is worth', () => {
        expect(claimLabel(claim({ credited_amount: 20 }))).toBe(
            'Chase the credit for two trays of chicken (short) (€49.98)',
        )
    })

    it('leaves the money out of a claim nobody has priced yet', () => {
        expect(claimLabel(claim({ amount: null }))).toBe('Chase the credit for two trays of chicken (short)')
    })
})

describe('eachWords', () => {
    it('says a case, a kilo, a litre or a unit', () => {
        expect(eachWords({ quantity: 1, each: -3.15, unit: 'a case' })).toBe('1 case, €3.15 less each')
        expect(eachWords({ quantity: 2.5, each: 0.4, unit: 'a kg' })).toBe('2.5 kg, €0.40 more a kg')
        expect(eachWords({ quantity: 3, each: 0.2, unit: 'a litre' })).toBe('3 litres, €0.20 more a litre')
        expect(eachWords({ quantity: 12, each: -0.1, unit: 'each' })).toBe('12 units, €0.10 less each')
    })

    // Never past two places.
    it('gives only the count when one of them moved by less than a cent', () => {
        expect(eachWords({ quantity: 1000, each: -0.004, unit: 'each' })).toBe('1,000 units at the new price')
    })

    it('says nothing when nothing came at the new price', () => {
        expect(eachWords({ quantity: 0, each: null, unit: 'a case' })).toBe('')
    })
})

// His choice on 27 September: say once which suppliers the section was read
// from and which are only a typed total, rather than a section per supplier.
describe('readFrom', () => {
    const doc = (name, lines, total, type = 'invoice') => ({
        document_type: type, total_amount: total, suppliers: { name }, invoice_lines: [{ count: lines }],
    })

    // The real week of 13 September.
    it('names what was read and what was only typed in, with the money that was not checked', () => {
        const week = [
            ...Array.from({ length: 18 }, () => doc('Sysco Ireland', 12, 200)),
            ...Array.from({ length: 5 }, () => doc('Sysco Ireland', 2, -80, 'credit')),
            doc('BWG Foodservice', 0, 98.5),
            doc('Cullen and Bohan', 0, 169.27),
            doc('Deli Meats Ireland', 0, 800), doc('Deli Meats Ireland', 0, 821.5),
            doc('Henderson Foodservice', 0, 200), doc('Henderson Foodservice', 0, 169.16),
        ]
        expect(readFrom(week).words).toBe(
            'Read from: Sysco Ireland (18 invoices and 5 credit notes). BWG Foodservice, Cullen and Bohan, '
            + 'Deli Meats Ireland and Henderson Foodservice were typed in as totals (6 invoices, €2,258.43), '
            + 'so their prices are not checked here.')
    })

    it('says it once for one supplier typed in once', () => {
        expect(readFrom([doc('Sysco Ireland', 3, 50), doc('BWG Foodservice', 0, 98.5)]).words).toBe(
            'Read from: Sysco Ireland (1 invoice). BWG Foodservice was typed in as a total (1 invoice, €98.50), '
            + 'so its prices are not checked here.')
    })

    it('says only where it was read from when nothing was typed in', () => {
        expect(readFrom([doc('Sysco Ireland', 3, 50)]).words).toBe('Read from: Sysco Ireland (1 invoice).')
    })

    // The next supplier the reader learns is one more name in the same line.
    it('lists every supplier read, the one with the most money first', () => {
        const words = readFrom([doc('Henderson Foodservice', 4, 120), doc('Sysco Ireland', 3, 900), doc('Sysco Ireland', 3, 50)]).words
        expect(words).toBe('Read from: Sysco Ireland (2 invoices) and Henderson Foodservice (1 invoice).')
    })

    it('says so when nothing was read', () => {
        expect(readFrom([doc('BWG Foodservice', 0, 98.5)]).words).toMatch(/^Read from: none of this week's invoices\. BWG/)
        expect(readFrom([]).words).toBe('Read from: no invoices this week.')
    })
})

// His design of 4 October, layout D: what was bought beside what the brand
// recommends, each product once, each at its price per unit here.
describe('not as the brand recommends', () => {
    const SANTA = { id: 'v-santa', product_id: 'tor', name: 'Santa Maria wrap 12"', is_recommended: true, is_active: true }
    const PLAIN = { id: 'v-plain', product_id: 'tor', name: 'Plain wraps 12"', is_recommended: false, is_active: true }
    const prices = [
        price({ id: 'p-santa', product_id: 'tor', version_id: 'v-santa', price_per_unit: 0.303 }),
        price({ id: 'p-plain', product_id: 'tor', version_id: 'v-plain', price_per_unit: 0.3303, is_preferred: false }),
    ]
    const wraps = (date, cases = 1) => line({ code: '5013972', product: TORTILLA, priceId: 'p-plain', date, perCase: 33.03, units: 100, cases })

    it('sets what was bought beside what the brand recommends, once a product', () => {
        const all = deliveriesFrom([wraps('2026-09-14'), wraps('2026-09-17', 2)])
        expect(notAsRecommended(all, { ...WEEK, prices, versions: [SANTA, PLAIN] })).toEqual([{
            name: 'Flour Tortilla (Burritos)',
            unit: 'each',
            bought: { name: 'Plain wraps 12"', per: expect.closeTo(0.3303, 4) },
            recommended: { name: 'Santa Maria wrap 12"', per: 0.303 },
            others: 0,
            cases: 3,
            money: 99.09,
        }])
    })

    it('says nothing of a recommended version, a product left free, or one with nothing recommended', () => {
        const all = deliveriesFrom([wraps('2026-09-14')])
        expect(notAsRecommended(all, { ...WEEK, prices, versions: [SANTA, { ...PLAIN, is_recommended: true }] })).toEqual([])
        const free = deliveriesFrom([{ ...wraps('2026-09-14'), products: { ...TORTILLA, recommends: 'any' } }])
        expect(notAsRecommended(free, { ...WEEK, prices, versions: [SANTA, PLAIN] })).toEqual([])
        expect(notAsRecommended(all, { ...WEEK, prices, versions: [{ ...SANTA, is_recommended: false }, PLAIN] })).toEqual([])
    })

    it('leaves a line waiting on a review to that card', () => {
        const all = deliveriesFrom([wraps('2026-09-14')])
        const requests = [{ supplier_id: 's1', supplier_code: '5013972', answer: null }]
        expect(notAsRecommended(all, { ...WEEK, prices, versions: [SANTA, PLAIN], requests })).toEqual([])
    })

    it('only looks at the week', () => {
        const all = deliveriesFrom([wraps('2026-09-07')])
        expect(notAsRecommended(all, { ...WEEK, prices, versions: [SANTA, PLAIN] })).toEqual([])
    })

    it('has no price for the recommended one when this restaurant does not buy it', () => {
        const all = deliveriesFrom([wraps('2026-09-14')])
        const [row] = notAsRecommended(all, { ...WEEK, prices: [prices[1]], versions: [SANTA, PLAIN] })
        expect(row.recommended).toEqual({ name: 'Santa Maria wrap 12"', per: null })
    })
})

describe('waiting on a review', () => {
    const corn = line({ code: '5019120', date: '2026-09-17', perCase: 41.8, units: null, description: 'MISSION CORN TORTILLA 6" 12X30 EA', decision: null })

    it('lists what was bought this week under a code sent for review', () => {
        const all = deliveriesFrom([corn])
        const requests = [{ supplier_id: 's1', supplier_code: '5019120', name: 'Corn Tortilla 6 inch', sent_at: '2026-09-18T10:00:00Z', answer: null }]
        expect(waitingOnReview(all, requests, WEEK)).toEqual([
            { name: 'Corn Tortilla 6 inch', cases: 1, loose: 0, money: 41.8, sent: '2026-09-18' },
        ])
    })

    it('leaves out one answered, one with no lines this week, and one asked for from Products', () => {
        const all = deliveriesFrom([corn])
        expect(waitingOnReview(all, [
            { supplier_id: 's1', supplier_code: '5019120', name: 'Corn', sent_at: '2026-09-18T10:00:00Z', answer: 'version' },
            { supplier_id: 's1', supplier_code: '999', name: 'Other', sent_at: '2026-09-18T10:00:00Z', answer: null },
            { supplier_id: 's1', supplier_code: null, name: 'Oat milk', sent_at: '2026-09-18T10:00:00Z', answer: null },
        ], WEEK)).toEqual([])
    })
})

describe('not checked', () => {
    it('is every supplier typed in as a total, saying why', () => {
        const read = readFrom([
            { document_type: 'invoice', total_amount: 312.4, suppliers: { name: 'Henderson Foodservice' }, invoice_lines: [{ count: 0 }] },
            { document_type: 'invoice', total_amount: 48, suppliers: { name: 'Local', works_without_codes: true }, invoice_lines: [{ count: 0 }] },
            { document_type: 'invoice', total_amount: 900, suppliers: { name: 'Sysco Ireland' }, invoice_lines: [{ count: 20 }] },
        ])
        expect(notChecked(read)).toEqual([
            { name: 'Henderson Foodservice', money: 312.4, why: 'not read line by line yet' },
            { name: 'Local', money: 48, why: 'works without codes' },
        ])
        expect(read.readWords).toBe('Read from: Sysco Ireland (1 invoice).')
    })
})

// His, 7 October: Eggs, counted one at a time, were said to be weighed.
describe('a price that cannot be compared', () => {
    const EGGS = { id: 'egg', name: 'Eggs', unit: 'Units' }

    it('reads a line stored without its units again from its pack', () => {
        const [d] = deliveriesFrom([line({ code: '5015724', product: EGGS, date: '2026-09-29', perCase: 41.12, units: null, pack: '1X15 DZ' })])
        expect(d.perUnit).toBeCloseTo(0.2284, 4)
    })

    it('says the invoice did not say how many, not that it is weighed', () => {
        expect(whyNot({ perUnit: null }, true)).toBe('pack')
        expect(whyNot({ perUnit: 1 }, true)).toBe('weight')
        expect(whyNot({ perUnit: 1 }, false)).toBe('units')
    })
})

// His, 7 October: Eggs and Sides Box, two versions the brand recommends both of.
describe('a version the brand recommends', () => {
    const EGGS = { id: 'egg', name: 'Eggs', unit: 'Units' }
    const prices = [
        price({ id: 'typed', product_id: 'egg', supplier_code: 'EG219', price_per_case: 7.12, units_per_case: 30, price_per_unit: 0.2373, version_id: 'v1' }),
        price({ id: 'sysco', product_id: 'egg', supplier_code: '5015724', price_per_case: 41.12, units_per_case: 180, price_per_unit: 0.2284, is_preferred: false, version_id: 'v2' }),
    ]
    const codes = [code({ supplier_code: '5015724', price_id: 'sysco' })]
    const all = deliveriesFrom([line({ code: '5015724', product: EGGS, priceId: 'sysco', date: '2026-09-15', perCase: 41.12, units: 180, pack: '1X15 DZ', description: 'BALLYGARVEY EGGS' })])
    const versions = recommended => [
        { id: 'v1', product_id: 'egg', is_recommended: true, is_active: true },
        { id: 'v2', product_id: 'egg', is_recommended: recommended, is_active: true },
    ]

    it('is not bought as something else', () => {
        expect(switchesIn(all, { ...WEEK, prices, codes, versions: versions(true) })).toEqual([])
    })

    it('one the brand does not recommend still is', () => {
        expect(switchesIn(all, { ...WEEK, prices, codes, versions: versions(false) })).toHaveLength(1)
    })

    // His, 8 October: a product the brand leaves free has no version to stray from.
    it('nor is any version of a product set to any version', () => {
        const free = all.map(d => ({ ...d, product: { ...d.product, recommends: 'any' } }))
        expect(switchesIn(free, { ...WEEK, prices, codes, versions: versions(false) })).toEqual([])
    })
})
