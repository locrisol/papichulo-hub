import { describe, it, expect } from 'vitest'
import {
    deliveriesFrom, priceMoves, switchesIn, usualSuggestions, recipeGaps, cameBack, stillOwed,
    newCodes, priceWeek, priceWords, decisionsFrom, reasonsOf, lineageOf, nameOf, unitWord,
    cannotCompare, usualFor, looksRenumbered, claimKey, claimActions, claimLabel, lookBackFrom,
    outOfReason, eachWords, readFrom,
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
        expect(row.parts).toEqual([{ kind: 'other', label: 'No reason logged', colour: '#9CA3AF', money: 120.5 }])
        expect(row.unexplained).toBe(120.5)
    })

    // Sysco never delivered them and credited all three.
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
            { kind: 'damaged', label: 'Damaged', colour: '#F97316', money: 35.84 },
            { kind: 'other', label: 'No reason logged', colour: '#9CA3AF', money: 84.66 },
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
        expect(priceWords({ owed, totals: { owed: 24.75 } })).toEqual(['Still owed: €24.75 on 1 claim.'])
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

    it('says what is being chased and what it is worth', () => {
        expect(claimLabel(claim({ credited_amount: 20 }))).toBe(
            'Chase the credit for two trays of chicken (short) (49.98)',
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
