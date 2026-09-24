import { describe, it, expect } from 'vitest'
import {
    whereItGoes, placeDocument, lineCategory, SECTION_CATEGORY, similarWords,
    codeSuccessor, unitsWanted, matchLines, pilesOf, documentTotals,
    linePayload, invoicePayload, documentBlocks, storedLine,
    fillInPlan, fillInPayload, fillInClaim, creditOnHandEntry, documentTotal, lineCost,
} from '@/lib/invoiceImport'

const SUPPLIER = { id: 's1', name: 'Test Supplier', category: 'food' }
const EQUIPMENT = { id: 's2', name: 'Equipment People', category: 'other' }

function line(over = {}) {
    return {
        line_no: 1,
        code: '497870',
        description: 'FLOUR TORTILLA 12IN',
        pack_size: '4X2.5 KG',
        pack: { count: 4, size: 2.5, unit: 'KG', total: 10, printed: '4X2.5 KG' },
        cases: 2,
        units: 0,
        price_per_case: 30.3,
        value: 60.6,
        storage: 'ambient',
        ...over,
    }
}

const TORTILLA = { id: 'p1', name: 'Flour Tortilla', section: 'Dry', unit: 'KG' }

function price(over = {}) {
    return {
        id: 'pr1',
        product_id: 'p1',
        products: TORTILLA,
        supplier_code: '497870',
        price_per_case: 30.3,
        units_per_case: 10,
        price_per_unit: 3.03,
        is_preferred: true,
        purchase_type: 'case',
        ...over,
    }
}

describe('whose invoice this is', () => {
    const accounts = [{ account_no: '9900001', supplier_id: 's1', restaurant_id: 'r1' }]

    // The worst failure in the whole feature. Suppliers are shared between
    // restaurants, so the account number is the only thing on the paper that
    // says whose costs it belongs in.
    it('reads the account number off the paper', () => {
        expect(whereItGoes('9900001', accounts)).toEqual({
            what: 'known', accountNo: '9900001', supplierId: 's1', restaurantId: 'r1',
        })
    })

    it('stops on an account nobody has claimed rather than guessing', () => {
        expect(whereItGoes('9900002', accounts).what).toBe('unknown')
    })

    it('stops when two suppliers print the same number', () => {
        const both = [...accounts, { account_no: '9900001', supplier_id: 's2', restaurant_id: 'r2' }]
        expect(whereItGoes('9900001', both).what).toBe('ambiguous')
    })

    it('stops when there is no account number at all', () => {
        expect(whereItGoes(null, accounts).what).toBe('no_account')
        expect(whereItGoes('  ', accounts).what).toBe('no_account')
    })
})

describe('where a document goes', () => {
    const doc = { number: '45448455', date: '2026-08-23', goodsTotal: 163.03 }

    it('is new when nothing matches', () => {
        expect(placeDocument(doc, []).what).toBe('new')
    })

    it('is already here when the number matches', () => {
        const held = [{ id: 'i1', invoice_number: '45448455' }]
        expect(placeDocument(doc, held)).toEqual({ what: 'already_here', invoice: held[0] })
    })

    // The fill in path. A hand entered total is net, because a shortage was
    // deducted before it was typed, and the document is gross. Matching on the
    // total would miss exactly the invoices that most need filling in.
    it('finds one entered by hand on the same day even when the total differs', () => {
        const held = [{ id: 'i1', invoice_number: null, invoice_date: '2026-08-23', total_amount: 140 }]
        const found = placeDocument(doc, held)
        expect(found.what).toBe('by_hand')
        expect(found.candidates[0].id).toBe('i1')
    })

    it('puts the nearest total first when there are several that day', () => {
        const held = [
            { id: 'far', invoice_number: null, invoice_date: '2026-08-23', total_amount: 20 },
            { id: 'near', invoice_number: null, invoice_date: '2026-08-23', total_amount: 160 },
        ]
        expect(placeDocument(doc, held).candidates.map(c => c.id)).toEqual(['near', 'far'])
    })
})

describe('what kind of cost a line is', () => {
    // Nobody is asked. Both columns already exist and are already constrained.
    it.each([
        ['Freezer', 'food'], ['Cold Room', 'food'], ['Dry', 'food'],
        ['Packaging', 'packaging'], ['Cleaning', 'cleaning'],
    ])('reads %s as %s', (section, category) => {
        expect(lineCategory({ section }, SUPPLIER)).toBe(category)
        expect(SECTION_CATEGORY[section]).toBe(category)
    })

    it('falls back to the supplier when there is no product', () => {
        expect(lineCategory(null, SUPPLIER)).toBe('food')
        expect(lineCategory(null, EQUIPMENT)).toBe('other')
    })

    it('is other when there is neither', () => {
        expect(lineCategory(null, null)).toBe('other')
    })

    // The first real week put foil, mops, bowls and lids on the food cost,
    // because none of their codes were saved and the supplier is a food
    // supplier. Food is zero rated; a taxed line with no deposit is not food.
    it('does not call a taxed line food when the Hub does not know it yet', () => {
        const foil = { value: 13.18, vat: 3.03, deposit: 0 }
        expect(lineCategory(null, SUPPLIER, foil)).toBe('packaging')
    })

    it('still calls zero rated lines and drinks with a deposit food', () => {
        expect(lineCategory(null, SUPPLIER, { value: 41.12, vat: 0, deposit: 0 })).toBe('food')
        expect(lineCategory(null, SUPPLIER, { value: 18.54, vat: 4.26, deposit: 3.6 })).toBe('food')
    })

    it('works the same way round on a credit note', () => {
        expect(lineCategory(null, SUPPLIER, { value: -13.18, vat: -3.03, deposit: 0 })).toBe('packaging')
    })

    // A product the Hub knows always decides, and a supplier who is not a food
    // supplier keeps its own category, taxed or not.
    it('lets a known product or a non food supplier decide', () => {
        expect(lineCategory({ section: 'Cleaning' }, SUPPLIER, { vat: 3, deposit: 0 })).toBe('cleaning')
        expect(lineCategory({ section: 'Dry' }, SUPPLIER, { vat: 3, deposit: 0 })).toBe('food')
        expect(lineCategory(null, EQUIPMENT, { vat: 50, deposit: 0 })).toBe('other')
    })

    it('files the lines on a real non food invoice as packaging, not food', () => {
        const matched = matchLines({
            lines: [
                line({ code: '497248', description: 'POP UP FOIL 30X27CM 1X200 EA', value: 13.18, vat: 3.03 }),
                line({ line_no: 2, code: '5017616', description: 'ROUND KRAFT BOWL 750ML 1X300 EA', value: 29.61, vat: 6.81 }),
            ],
            supplier: SUPPLIER,
        })
        expect(matched.map(r => r.category)).toEqual(['packaging', 'packaging'])
    })

    // A new number for something already bought is the same kind of thing.
    it('takes a moved code from the product under its old number', () => {
        const oldBowl = price({
            id: 'pr9', supplier_code: '5017616',
            products: { id: 'p9', name: 'Burrito Bowl', section: 'Packaging', unit: 'Units' },
        })
        const matched = matchLines({
            lines: [line({ code: '5034636', description: 'ROUND KRAFT BOWL 750ML 1X300 EA', vat: 0 })],
            codes: [{
                supplier_code: '5017616', last_description: 'ROUND KRAFT BOWL 750ML 1X300 EA',
                price_id: 'pr9', last_seen_on: '2026-09-01',
            }],
            prices: [oldBowl],
            supplier: SUPPLIER,
            date: '2026-09-24',
        })
        expect(matched[0].pile).toBe('new_code')
        expect(matched[0].category).toBe('packaging')
    })
})

describe('telling whether one code became another', () => {
    it('scores a longer name that contains the shorter one as the same thing', () => {
        expect(similarWords('SANTA MARIA FLOUR TORTILLA', 'SANTA MARIA FLOUR TORTILLA 12IN')).toBe(1)
    })

    it('scores two different products low', () => {
        expect(similarWords('FLOUR TORTILLA', 'CHICKEN BREAST')).toBe(0)
    })

    it('says nothing about an empty description', () => {
        expect(similarWords('', 'FLOUR TORTILLA')).toBe(0)
    })

    const codes = [{
        supplier_code: '497869',
        price_id: 'pr1',
        last_description: 'SANTA MARIA FLOUR TORTILLA',
        pack_size: '4X2.5 KG',
        last_seen_on: '2026-08-12',
        ignored: false,
    }]

    // The supplier renumbering something is otherwise a new product appearing
    // beside an old one that quietly stops, and nobody notices for a year.
    // Deliveries come two or three times a week, so a code seen three days ago
    // has not gone anywhere. Without a quiet period, anything not on the
    // document in front of you looks discontinued.
    it("never suggests a code that was on last week's delivery", () => {
        const live = [{ ...codes[0], last_seen_on: '2026-09-11' }]
        expect(codeSuccessor(
            line({ code: '497871', description: 'SANTA MARIA FLOUR TORTILLA' }),
            live,
            { onThisDocument: ['497871'], date: '2026-09-14' },
        )).toBeNull()
    })

    it('suggests the code that stopped appearing', () => {
        const found = codeSuccessor(
            line({ code: '497871', description: 'SANTA MARIA FLOUR TORTILLA' }),
            codes,
            { onThisDocument: ['497871'], date: '2026-09-14' },
        )
        expect(found.supplier_code).toBe('497869')
    })

    // A code on the same document has not stopped appearing, it is right there.
    it('never suggests a code that is on this very document', () => {
        expect(codeSuccessor(
            line({ code: '497871', description: 'SANTA MARIA FLOUR TORTILLA' }),
            codes,
            { onThisDocument: ['497871', '497869'], date: '2026-09-14' },
        )).toBeNull()
    })

    it('says nothing when the descriptions are not alike', () => {
        expect(codeSuccessor(
            line({ code: '497871', description: 'CHICKEN BREAST DICED' }),
            codes,
            { onThisDocument: ['497871'], date: '2026-09-14' },
        )).toBeNull()
    })

    it('leaves out a code nobody ever matched to a price', () => {
        const loose = [{ ...codes[0], price_id: null }]
        expect(codeSuccessor(
            line({ code: '497871', description: 'SANTA MARIA FLOUR TORTILLA' }),
            loose,
            { onThisDocument: ['497871'], date: '2026-09-14' },
        )).toBeNull()
    })
})

describe('how many units are in a case', () => {
    const pack = { count: 4, size: 2.5, unit: 'KG', total: 10 }

    // The invoice cannot say. Ten is right for something counted in kilos and
    // four is right for something counted in bags.
    it('is the whole weight for something counted in kilos', () => {
        expect(unitsWanted(pack, { unit: 'KG' })).toBe(10)
    })

    it('is the number of packs for something counted in units', () => {
        expect(unitsWanted(pack, { unit: 'Units' })).toBe(4)
    })

    it('leans on the pack when there is no product yet', () => {
        expect(unitsWanted(pack, null)).toBe(10)
        expect(unitsWanted({ count: 24, size: null, unit: null, total: 24 }, null)).toBe(24)
    })

    it('says nothing when the pack size could not be read', () => {
        expect(unitsWanted(null, { unit: 'KG' })).toBeNull()
    })
})

describe('the four piles', () => {
    it('puts a line nobody has ever bought in new to us', () => {
        const [row] = matchLines({ lines: [line({ code: '999999' })], supplier: SUPPLIER })
        expect(row.pile).toBe('new_to_us')
        // The band off the page comes with it, so the creation flow already
        // knows where the thing is kept.
        expect(row.line.storage).toBe('ambient')
        expect(row.category).toBe('food')
    })

    it('puts a familiar product under a moved code in new code', () => {
        const codes = [{
            supplier_code: '497869', price_id: 'pr1', last_description: 'FLOUR TORTILLA 12IN',
            pack_size: '4X2.5 KG', last_seen_on: '2026-08-12', ignored: false,
        }]
        const [row] = matchLines({
            lines: [line({ code: '497871' })], codes, prices: [price()], supplier: SUPPLIER,
            date: '2026-09-14',
        })
        expect(row.pile).toBe('new_code')
        expect(row.successor.supplier_code).toBe('497869')
    })

    it('leaves a line whose price has not moved alone', () => {
        const [row] = matchLines({ lines: [line()], prices: [price()], supplier: SUPPLIER })
        expect(row.pile).toBe('unchanged')
        expect(row.category).toBe('food')
    })

    it('flags a price that went up, with both figures', () => {
        const [row] = matchLines({
            lines: [line({ price_per_case: 32.1 })], prices: [price()], supplier: SUPPLIER,
        })
        expect(row.pile).toBe('price_changed')
        expect(row.was).toBe(30.3)
        expect(row.now).toBe(32.1)
    })

    // Prices are stored to four places and printed to two.
    it('does not call a rounding difference a price change', () => {
        const [row] = matchLines({
            lines: [line({ price_per_case: 30.302 })], prices: [price()], supplier: SUPPLIER,
        })
        expect(row.pile).toBe('unchanged')
    })

    // The trap. The unique key on a price row includes units_per_case, so a new
    // pack is a new row, and is_preferred stays on the discontinued one unless
    // somebody moves it. The app then quietly costs from a case nobody can buy.
    it('says when the pack size moved, not just the price', () => {
        const [row] = matchLines({
            lines: [line({
                pack_size: '6X2.5 KG',
                pack: { count: 6, size: 2.5, unit: 'KG', total: 15, printed: '6X2.5 KG' },
                price_per_case: 45.45,
            })],
            prices: [price()],
            supplier: SUPPLIER,
        })
        expect(row.packMoved).toBe(true)
        expect(row.pile).toBe('price_changed')
        expect(row.wantedUnits).toBe(15)
    })

    // A delivery charge or a crate deposit has a code and would turn up in the
    // new pile every single week until somebody could say no.
    it('keeps a code somebody said is not stock out of every pile that needs a decision', () => {
        const codes = [{ supplier_code: '497870', ignored: true, ignored_reason: 'Delivery charge' }]
        const [row] = matchLines({ lines: [line()], codes, prices: [price()], supplier: SUPPLIER })
        expect(row.pile).toBe('ignored')
    })

    // supplier_codes is the authority once it has anything in it, and the
    // column on the price row seeds it the first time.
    it('matches off the price row the first time, before any code is recorded', () => {
        const [row] = matchLines({ lines: [line()], codes: [], prices: [price()], supplier: SUPPLIER })
        expect(row.price.id).toBe('pr1')
    })

    it('groups them, and every pile exists even when it is empty', () => {
        const piles = pilesOf(matchLines({ lines: [line()], prices: [price()], supplier: SUPPLIER }))
        expect(piles.unchanged).toHaveLength(1)
        expect(piles.new_to_us).toEqual([])
        expect(piles.price_changed).toEqual([])
    })
})

describe('what the document comes to', () => {
    // The one thing worth checking before anything is written is that a
    // delivery of food is not about to land against the cleaning target.
    it('splits the total the way the money actually went', () => {
        const matched = matchLines({
            lines: [
                line({ code: '497870', value: 60.6 }),
                line({ line_no: 2, code: '800001', value: 20, description: 'NAPKINS' }),
            ],
            prices: [
                price(),
                price({
                    id: 'pr2', supplier_code: '800001',
                    products: { id: 'p2', name: 'Napkins', section: 'Packaging', unit: 'Units' },
                }),
            ],
            supplier: SUPPLIER,
        })

        expect(documentTotals(matched)).toEqual([
            { category: 'food', amount: 60.6 },
            { category: 'packaging', amount: 20 },
        ])
    })

    // The VAT on the napkins belongs to packaging, not spread over the food.
    it('counts each line with its own VAT and deposit on', () => {
        const matched = matchLines({
            lines: [
                line({ code: '497870', value: 60.6 }),
                line({ line_no: 2, code: '800001', value: 20, vat: 4.6, description: 'NAPKINS' }),
            ],
            prices: [
                price(),
                price({
                    id: 'pr2', supplier_code: '800001',
                    products: { id: 'p2', name: 'Napkins', section: 'Packaging', unit: 'Units' },
                }),
            ],
            supplier: SUPPLIER,
        })

        expect(documentTotals(matched)).toEqual([
            { category: 'food', amount: 60.6 },
            { category: 'packaging', amount: 24.6 },
        ])
    })
})

describe('what a document costs', () => {
    // Decided on 24 September: what it charges, VAT and deposit included, the
    // way every invoice typed in by hand was entered.
    it('is the amount payable', () => {
        expect(documentTotal({ goodsTotal: 418.23, payable: 442.46 })).toBe(442.46)
    })

    it('is the goods total for a reader that has never met VAT', () => {
        expect(documentTotal({ goodsTotal: 163.03 })).toBe(163.03)
    })

    it('puts a line at its value with its VAT and deposit on', () => {
        expect(lineCost({ value: 35.22, vat: 8.1, deposit: 7.2 })).toBeCloseTo(50.52, 2)
        expect(lineCost({ value: 60.6 })).toBe(60.6)
    })
})

describe('what gets written', () => {
    it('turns a line into a row', () => {
        const [row] = matchLines({ lines: [line()], prices: [price()], supplier: SUPPLIER })
        expect(linePayload(row, 'i1')).toEqual({
            invoice_id: 'i1',
            line_no: 1,
            supplier_code: '497870',
            raw_description: 'FLOUR TORTILLA 12IN',
            pack_size: '4X2.5 KG',
            units_per_case: 10,
            cases: 2,
            units: 0,
            quantity: 20,
            price_per_case: 30.3,
            unit_price: 3.03,
            line_total: 60.6,
            vat_amount: 0,
            deposit_amount: 0,
            storage: 'ambient',
            category: 'food',
            product_id: 'p1',
            price_id: 'pr1',
            decision: 'matched',
        })
    })

    // The price stays as printed and the charges on it go beside it, so a
    // price is still compared against a price.
    it('keeps the VAT and deposit beside the printed value', () => {
        const [row] = matchLines({
            lines: [line({ value: 35.22, vat: 8.1, deposit: 7.2 })], prices: [price()], supplier: SUPPLIER,
        })
        const payload = linePayload(row, 'i1')
        expect(payload).toMatchObject({ line_total: 35.22, vat_amount: 8.1, deposit_amount: 7.2 })
        expect(storedLine(payload)).toMatchObject({ value: 35.22, vat: 8.1, deposit: 7.2 })
    })

    // On a twenty document week the review would otherwise open with two
    // hundred lines on it, nearly all of them exactly like last week's.
    it('settles the lines nobody needs to look at as it writes them', () => {
        const same = matchLines({ lines: [line()], prices: [price()], supplier: SUPPLIER })
        expect(linePayload(same[0], 'i1').decision).toBe('matched')

        const moved = matchLines({
            lines: [line({ price_per_case: 32.1 })], prices: [price()], supplier: SUPPLIER,
        })
        expect(linePayload(moved[0], 'i1').decision).toBeNull()

        const fresh = matchLines({ lines: [line({ code: '999999' })], supplier: SUPPLIER })
        expect(linePayload(fresh[0], 'i1').decision).toBeNull()
    })

    // The review runs over lines written days ago and has to reach exactly the
    // same answer as the import did, or the two screens disagree about the same
    // piece of paper.
    it('reads a stored line back into the shape the matching works in', () => {
        const [written] = matchLines({ lines: [line()], prices: [price()], supplier: SUPPLIER })
        const stored = linePayload(written, 'i1')
        const [again] = matchLines({
            lines: [storedLine(stored)], prices: [price()], supplier: SUPPLIER,
        })

        expect(again.pile).toBe('unchanged')
        expect(again.packMoved).toBe(false)
        expect(again.price.id).toBe('pr1')
    })

    it('says nothing rather than guessing when the pack size could not be read', () => {
        const [row] = matchLines({
            lines: [line({ pack_size: null, pack: null })], supplier: SUPPLIER,
        })
        const payload = linePayload(row, 'i1')
        expect(payload.units_per_case).toBeNull()
        expect(payload.quantity).toBeNull()
        expect(payload.unit_price).toBeNull()
    })

    // A credit note is an invoice row with a negative total, which is what lets
    // a week's cost read it without knowing there are two kinds of document.
    it('writes a credit note as a negative invoice', () => {
        const payload = invoicePayload(
            { number: 'C45485340', kind: 'credit', date: '2026-08-27', goodsTotal: -74.26 },
            { restaurantId: 'r1', supplierId: 's1', weekStart: '2026-08-23', createdBy: 'me' },
        )
        expect(payload.document_type).toBe('credit')
        expect(payload.total_amount).toBe(-74.26)
        expect(payload.entry_method).toBe('parsed')
    })

    // The header is what the cost view falls back on when an invoice has no
    // lines at all, which is every invoice from somebody who sells equipment.
    // Food would put a new till against the food target.
    it('writes the amount payable as the total', () => {
        const payload = invoicePayload(
            { number: '45690932', kind: 'invoice', date: '2026-09-24', goodsTotal: 418.23, payable: 442.46 },
            { restaurantId: 'r1', supplierId: 's1', weekStart: '2026-09-20' },
        )
        expect(payload.total_amount).toBe(442.46)
    })

    it('takes the header category from the supplier', () => {
        const payload = invoicePayload(
            { number: '1', kind: 'invoice', date: '2026-08-27', goodsTotal: 400 },
            { restaurantId: 'r1', supplierId: 's2', weekStart: '2026-08-23', category: 'other' },
        )
        expect(payload.category).toBe('other')
    })
})

describe('what stops a document being written', () => {
    const good = {
        number: '45448455',
        date: '2026-08-23',
        lines: [line()],
        checks: { values: { ok: true }, cases: { ok: true }, ok: true },
    }

    it('lets a document that adds up through', () => {
        expect(documentBlocks(good)).toEqual([])
    })

    it('refuses a file it could not read at all', () => {
        expect(documentBlocks(null)).toHaveLength(1)
    })

    // Half a document in the food cost looks exactly like a quiet week.
    it('says both figures when the values do not add up', () => {
        const out = documentBlocks({
            ...good,
            checks: { values: { ok: false, got: 163.03, expected: 170 }, cases: { ok: true } },
        })
        expect(out[0]).toContain('163.03')
        expect(out[0]).toContain('170.00')
    })

    // The goods total includes the deposit and the lines never do, so the
    // figure the lines are measured against is said with the deposit beside it.
    it('says the deposit when there is one', () => {
        const out = documentBlocks({
            ...good,
            deposits: 21.6,
            checks: { values: { ok: false, got: 390, expected: 396.63 }, cases: { ok: true } },
        })
        expect(out[0]).toBe('The lines come to 390.00 and the goods come to 396.63 before the '
            + '21.60 container deposit, so something on it was not read.')
    })

    it('says which part of the charges did not add up', () => {
        const unread = documentBlocks({
            ...good,
            checks: { values: { ok: true }, cases: { ok: true }, payable: { ok: false, expected: null, got: 10 } },
        })
        expect(unread[0]).toBe('The amount payable at the foot could not be read.')

        const codes = documentBlocks({
            ...good,
            checks: { values: { ok: true }, cases: { ok: true }, payable: { ok: false, expected: 10, got: 10, codes: false } },
        })
        expect(codes[0]).toContain('VAT codes on the lines')

        const short = documentBlocks({
            ...good,
            checks: { values: { ok: true }, cases: { ok: true }, payable: { ok: false, expected: 442.46, got: 418.23, codes: true } },
        })
        expect(short[0]).toContain('418.23')
        expect(short[0]).toContain('442.46')
    })

    it('says so when the deposit box could not be read', () => {
        const out = documentBlocks({
            ...good,
            deposits: null,
            checks: { values: { ok: false, got: 396.63, expected: null }, cases: { ok: true } },
        })
        expect(out[0]).toContain('container deposit on it could not be read')
    })

    it('says so when the case counts do not add up', () => {
        const out = documentBlocks({
            ...good,
            checks: { values: { ok: true }, cases: { ok: false, got: 5, expected: 6 } },
        })
        expect(out[0]).toContain('cases')
    })

    it('refuses one with no number, no date or no lines', () => {
        expect(documentBlocks({ ...good, number: null })).toHaveLength(1)
        expect(documentBlocks({ ...good, date: null })).toHaveLength(1)
        expect(documentBlocks({ ...good, lines: [] })).toHaveLength(1)
    })
})

describe('filling in an invoice somebody typed off a total', () => {
    const doc = { number: '45448455', kind: 'invoice', date: '2026-08-23', goodsTotal: 163.03 }

    // He takes a shortage off before typing it in, so filling one in almost
    // always raises the total, and raising the total would move the food cost
    // of a week that has already been reported.
    it('reads the difference as a deduction made by hand', () => {
        const plan = fillInPlan(doc, { total_amount: 140 })
        expect(plan).toMatchObject({ gross: 163.03, net: 140, difference: 23.03, deducted: 23.03, over: 0 })
    })

    // The gross goes up and the claim takes the difference back off, so the
    // week ends up on the figure it has always been on.
    it('turns the deduction into a claim of the same amount', () => {
        const plan = fillInPlan(doc, { total_amount: 140 })
        const made = fillInClaim(plan, {
            plan, doc, invoice: { id: 'i1' }, restaurantId: 'r1', supplierId: 's1', raisedBy: 'u1',
        })
        expect(made).toMatchObject({
            amount: 23.03, status: 'open', kind: 'short',
            counted_week: '2026-08-23', docket_number: '45448455',
        })
        expect(made.note).toContain('140.00')
        expect(made.note).toContain('163.03')
    })

    it('has nothing to claim when the two agree', () => {
        const plan = fillInPlan(doc, { total_amount: 163.03 })
        expect(plan.same).toBe(true)
        expect(fillInClaim(plan, { doc, invoice: { id: 'i1' } })).toBeNull()
    })

    // A difference nobody can account for is exactly the thing worth looking
    // at, so it is shown rather than absorbed.
    it('says so rather than claiming when more was typed than the document says', () => {
        const plan = fillInPlan(doc, { total_amount: 200 })
        expect(plan.over).toBe(36.97)
        expect(plan.deducted).toBe(0)
        expect(fillInClaim(plan, { doc, invoice: { id: 'i1' } })).toBeNull()
    })

    it('puts the document total on the invoice, because that is what was charged', () => {
        expect(fillInPayload(doc, { createdBy: 'u1' })).toMatchObject({
            invoice_number: '45448455', total_amount: 163.03, entry_method: 'parsed',
        })
    })

    // Everything typed by hand was the amount payable, VAT included: 45612214
    // was typed as 102.43 and its goods come to 83.28. Measured against the
    // goods, the VAT would have looked like 19.15 nobody could account for.
    it('measures a typed total against the amount payable, VAT and all', () => {
        const drinks = { number: '45612214', kind: 'invoice', date: '2026-09-14', goodsTotal: 83.28, payable: 102.43 }
        const plan = fillInPlan(drinks, { total_amount: 102.43 })
        expect(plan.same).toBe(true)
        expect(fillInPayload(drinks, {}).total_amount).toBe(102.43)
    })
})

describe('a credit for an invoice typed in by hand', () => {
    // 325.95 delivered, 74.26 of it credited, and 251.69 typed in by hand: the
    // credit was taken off before the total was typed.
    const credit = { kind: 'credit', number: 'C45485340', orderReference: '45480809', date: '2026-08-27', goodsTotal: -74.26 }
    const typedNet = { id: 'h1', invoice_number: null, invoice_date: '2026-08-27', total_amount: 251.69 }
    const typedGross = { id: 'h2', invoice_number: null, invoice_date: '2026-08-27', total_amount: 325.95 }
    const listed = [{
        document_id: '45480809', order_reference: null, document_date: '2026-08-27',
        document_type: 'invoice', value: 325.95,
    }]

    // Importing it would take the same money off a second time.
    it('is held back when the supplier list says it was taken off by hand', () => {
        expect(creditOnHandEntry(credit, { held: [typedNet], documents: listed }))
            .toMatchObject({ sure: true, invoiceNumber: '45480809', typed: { id: 'h1' } })
    })

    // Typed at its full price, so the credit was not in it and has to count.
    it('goes in when the invoice was typed at its full price', () => {
        expect(creditOnHandEntry(credit, { held: [typedGross], documents: listed })).toBeNull()
    })

    // Without the supplier list there is only the day to go on, so it asks
    // rather than decides.
    it('asks when there is no list and something was typed in around then', () => {
        expect(creditOnHandEntry(credit, { held: [typedNet] }))
            .toMatchObject({ sure: false, invoiceNumber: '45480809' })
    })

    it('says nothing when the invoice it credits is in the Hub by its number', () => {
        const held = [typedNet, { id: 'i1', invoice_number: '45480809' }]
        expect(creditOnHandEntry(credit, { held, documents: listed })).toBeNull()
    })

    it('says nothing when the invoice it credits is in the same batch', () => {
        expect(creditOnHandEntry(credit, { held: [typedNet], batch: [{ number: '45480809' }] })).toBeNull()
    })

    it('says nothing about an invoice, or a credit with nothing typed near it', () => {
        expect(creditOnHandEntry({ ...credit, kind: 'invoice' }, { held: [typedNet] })).toBeNull()
        const weekEarlier = { ...typedNet, invoice_date: '2026-08-20' }
        expect(creditOnHandEntry(credit, { held: [weekEarlier] })).toBeNull()
    })
})
