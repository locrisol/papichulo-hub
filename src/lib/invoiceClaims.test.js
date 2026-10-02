import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
    CLAIM_KINDS, NOT_LOGGED, claimKind, emptyDoorClaim, doorClaimProblem, doorClaimPayload,
    claimAmount, claimBalance, claimIsOpen, claimTakesOff, claimCandidates, claimMatch,
    creditSettles, creditTakenBack, voidedBy, sentBack, chasingList, isLate, claimsForWeek, bySupplier,
    claimWeek, sentWeeks, fromEarlierWeeks, otherDeliveries, byInvoice, claimWorking, notTheDocket,
} from '@/lib/invoiceClaims'

const LINE = {
    id: 'l1',
    raw_description: 'CHICKEN BREAST DICED',
    price_per_case: 34.99,
    units_per_case: 10,
    unit_price: 3.499,
}

function claim(over = {}) {
    return {
        id: 'c1',
        restaurant_id: 'r1',
        supplier_id: 's1',
        kind: 'short',
        what: 'two trays of chicken',
        cases: 2,
        units: 0,
        amount: 69.98,
        credited_amount: 0,
        status: 'open',
        raised_on: '2026-09-14',
        counted_week: '2026-09-13',
        ...over,
    }
}

describe('what can be wrong with a delivery', () => {
    // Theirs first, then ours, then anything else. Not delivered is the one
    // the first real fortnight added: three deliveries that never came.
    it('is a different conversation each, theirs first and then ours', () => {
        expect(CLAIM_KINDS.map(k => k.value)).toEqual([
            'not_delivered', 'short', 'damaged', 'quality', 'out_of_date', 'warm',
            'wrong_item', 'price', 'mistake', 'something_else',
        ])
    })

    // The database refuses anything else, so the two lists have to agree.
    it('offers only what the database will take', () => {
        const schema = readFileSync('supabase/schema.sql', 'utf8')
        const check = /"invoice_line_claims_kind_check" CHECK \(\("kind" IN \(([^)]*)\)/.exec(schema)
        expect(check).not.toBeNull()
        const allowed = check[1].split(',').map(v => v.trim().replace(/'/g, ''))
        expect(allowed).toEqual([...CLAIM_KINDS.map(k => k.value), NOT_LOGGED.value])
    })

    it('gives every reason a colour the report and the mail can draw with', () => {
        for (const kind of [...CLAIM_KINDS, NOT_LOGGED]) {
            expect(kind.colour).toMatch(/^#[0-9A-F]{6}$/)
        }
        expect(new Set(CLAIM_KINDS.map(k => k.colour)).size).toBe(CLAIM_KINDS.length)
    })

    it('calls quality what it is, now that everything in came back was sent back', () => {
        expect(claimKind('quality').label).toBe('Bad quality')
    })

    it('says so when nothing was logged, rather than guessing', () => {
        expect(claimKind('other').label).toBe('No reason logged')
        expect(claimKind(null).label).toBe('No reason logged')
    })

    it('says what each one means at the door', () => {
        expect(claimKind('short').at_door).toBe('It did not all turn up')
    })

    it('falls back rather than leaving a row with no words on it', () => {
        expect(claimKind('something').label).toBe('something')
    })
})

describe('taking the note at the door', () => {
    const filled = { ...emptyDoorClaim(), supplierId: 's1', kind: 'short', what: 'two trays', cases: '2' }

    it('asks for as little as it can get away with', () => {
        expect(doorClaimProblem(filled)).toBeNull()
    })

    it.each([
        [{ supplierId: '' }, 'who delivered'],
        [{ kind: '' }, 'what was wrong'],
        [{ what: '  ' }, 'in your own words'],
        [{ cases: '', units: '' }, 'how many'],
    ])('says what is missing', (over, said) => {
        expect(doorClaimProblem({ ...filled, ...over })).toContain(said)
    })

    // The docket number is what turns a note into an exact match later, and it
    // is still not required: a note with no number is worth far more than no
    // note at all.
    it('wants the note when the reason is something else', () => {
        expect(doorClaimProblem({ ...filled, kind: 'something_else' })).toContain('under Anything else')
        expect(doorClaimProblem({ ...filled, kind: 'something_else', note: 'Box soaked through' })).toBeNull()
    })

    it('does not insist on the docket number', () => {
        expect(doorClaimProblem({ ...filled, docket: '' })).toBeNull()
    })

    // Whoever is at the door knows how many trays and has no business knowing
    // what a tray costs. The policy that lets an employee write this refuses a
    // row with an amount on it.
    it('writes no money on the row', () => {
        const payload = doorClaimPayload(filled, { restaurantId: 'r1', raisedBy: 'u1', today: '2026-09-15' })
        expect(payload.amount).toBeUndefined()
        expect(payload.status).toBe('open')
        expect(payload.raised_by).toBe('u1')
    })

    // A week is open until its report is published, so the note belongs to the
    // week it happened in even if the credit turns up in the next one.
    it('stamps the week it happened in', () => {
        const payload = doorClaimPayload(filled, { restaurantId: 'r1', raisedBy: 'u1', today: '2026-09-15' })
        expect(payload.raised_on).toBe('2026-09-15')
        expect(payload.counted_week).toBe('2026-09-13')
    })
})

describe('what a claim is worth', () => {
    // Claims are quantities, not amounts: one case ordered and one unit
    // delivered, four trays with one returned, three boxes with one back.
    it('works the money out from the line price', () => {
        expect(claimAmount({ cases: 2, units: 0 }, LINE)).toBe(69.98)
    })

    it('counts loose units off the price per unit', () => {
        expect(claimAmount({ cases: 0, units: 3 }, LINE)).toBe(10.5)
    })

    it('counts a mixture of both', () => {
        expect(claimAmount({ cases: 1, units: 5 }, LINE)).toBe(52.49)
    })

    // A credit note's quantities are negative and the ask is not.
    it('reads a negative quantity as the same ask', () => {
        expect(claimAmount({ cases: -2, units: 0 }, LINE)).toBe(69.98)
    })

    it('says nothing when there is no line to price it against', () => {
        expect(claimAmount({ cases: 2 }, null)).toBeNull()
    })

    // The line cost what it charged, VAT and deposit included, so a case of
    // Coke sent back takes all of that off, not only the printed price. One
    // case at 18.54 with 4.26 VAT and a 3.60 deposit on it cost 26.40.
    it('takes the VAT and deposit off with it, in the same share as the line', () => {
        const coke = {
            price_per_case: 18.54, units_per_case: 24, line_total: 37.08, vat_amount: 8.52, deposit_amount: 7.2,
        }
        expect(claimAmount({ cases: 1, units: 0 }, coke)).toBe(26.4)
        expect(claimAmount({ cases: 2, units: 0 }, coke)).toBe(52.8)
    })
})

// The Chorizo of 2 October: a case of four 500 g bags ordered, one bag came,
// three logged as single items. The product is counted in kilos, so
// units_per_case is 2 and a single item was priced as a kilo, 41.99 for what
// Sysco credits at 7.00 a bag.
describe('what a single item out of a case is worth', () => {
    const chorizo = {
        pack_size: '4X500 GM', units_per_case: 2, price_per_case: 27.99, unit_price: 13.995,
        line_total: 55.98, vat_amount: 0, deposit_amount: 0,
    }

    it('is one item of the pack, at the price they split it at', () => {
        expect(claimAmount({ cases: 0, units: 3 }, chorizo)).toBe(21)
        expect(claimAmount({ cases: 1, units: 0 }, chorizo)).toBe(27.99)
    })

    // Four bags at 7.00 would be 28.00, more than the case cost.
    it('counts a whole case of single items as the case', () => {
        expect(claimAmount({ cases: 0, units: 4 }, chorizo)).toBe(27.99)
    })

    it('does not move with the unit the product is counted in', () => {
        expect(claimAmount({ cases: 0, units: 3 }, { ...chorizo, units_per_case: 4 })).toBe(21)
    })

    // Sysco prints a loose sale or credit as its own line with a one item pack.
    it('prices a line of single bags at its own price each', () => {
        const loose = { pack_size: '1X500 GM', units_per_case: 0.5, price_per_case: 7, line_total: 7 }
        expect(claimAmount({ cases: 0, units: 3 }, loose)).toBe(21)
    })

    it('counts eaches when the case is one pack of them', () => {
        const cabbage = { pack_size: '1X10 EA', units_per_case: 12, price_per_case: 14.33, line_total: 14.33 }
        expect(claimAmount({ cases: 0, units: 3 }, cabbage)).toBe(4.29)
        const tortillas = { pack_size: '10X10 EA', units_per_case: 100, price_per_case: 30.3, line_total: 30.3 }
        expect(claimAmount({ cases: 0, units: 3 }, tortillas)).toBe(9.09)
    })

    it('takes a single item of a one item case as the case', () => {
        expect(claimAmount({ cases: 0, units: 1 }, { pack_size: '1X5 KG', units_per_case: 5, price_per_case: 14.5 }))
            .toBe(14.5)
    })

    it('still takes the VAT and deposit off in the same share as the line', () => {
        const coke = {
            pack_size: '24X330 ML', price_per_case: 18.54, units_per_case: 24,
            line_total: 37.08, vat_amount: 8.52, deposit_amount: 7.2,
        }
        expect(claimAmount({ cases: 0, units: 6 }, coke)).toBe(6.58)
    })

    // A typed line, or a pack nobody can read, has only units_per_case.
    it('goes by units_per_case when the pack cannot be read', () => {
        expect(claimAmount({ cases: 0, units: 3 }, { ...chorizo, pack_size: null })).toBe(41.99)
        expect(claimAmount({ cases: 0, units: 3 }, { ...LINE, pack_size: '6X4' })).toBe(10.5)
    })

    it('prices a price query on single items per item too', () => {
        const over = { ...chorizo, price_per_case: 31.99, line_total: 31.99 }
        expect(claimAmount({ kind: 'price', cases: 0, units: 3 }, over, { agreedPerCase: 27.99 })).toBe(3)
    })

    // Ten cents over on a case of 24 is under half a cent a can. Rounded per
    // can first, six cans came to nothing.
    it('does not round a small price query on single items to nothing', () => {
        const coke = {
            pack_size: '24X330 ML', price_per_case: 18.54, units_per_case: 24,
            line_total: 37.08, vat_amount: 8.52, deposit_amount: 7.2,
        }
        expect(claimAmount({ kind: 'price', cases: 0, units: 6 }, coke, { agreedPerCase: 18.44 })).toBe(0.03)
        expect(claimAmount({ kind: 'price', cases: 0, units: 23 }, { ...coke, vat_amount: 0 }, { agreedPerCase: 18.24 }))
            .toBe(0.29)
    })
})

// What is shown before a claim is put on a line, so a wrong reading of the
// numbers is seen before any money moves.
describe('the working shown before a claim goes on a line', () => {
    const chorizo = {
        raw_description: 'CHORIZO CUBES', pack_size: '4X500 GM', units_per_case: 2, price_per_case: 27.99,
        line_total: 27.99, vat_amount: 0, deposit_amount: 0, cases: 1, units: 0,
    }

    it('says it in the pack\'s own words', () => {
        expect(claimWorking({ cases: 0, units: 3 }, chorizo)).toEqual({
            amount: 21, words: '3 of the 4 x 500 g in a case at €27.99 a case: €21.00', problem: null,
        })
    })

    it('names whole cases and both together', () => {
        const two = { ...chorizo, cases: 2, line_total: 55.98 }
        expect(claimWorking({ cases: 1, units: 0 }, two).words).toBe('1 case at €27.99 a case: €27.99')
        expect(claimWorking({ cases: 1, units: 1 }, two).words)
            .toBe('1 case and 1 of the 4 x 500 g in a case at €27.99 a case: €34.99')
    })

    it('says when the VAT and the deposit come off with it', () => {
        const coke = {
            pack_size: '24X330 ML', price_per_case: 18.54, units_per_case: 24,
            line_total: 37.08, vat_amount: 8.52, deposit_amount: 7.2, cases: 2, units: 0,
        }
        expect(claimWorking({ cases: 0, units: 6 }, coke).words)
            .toBe('6 of the 24 x 330 ml in a case at €18.54 a case, with its VAT and deposit: €6.58')
    })

    // Where the pack cannot be read, it says what it took a case to be, so a
    // case of kilos is seen for what it is.
    it('says what a case was taken as when the pack cannot be read', () => {
        expect(claimWorking({ cases: 0, units: 3 }, { ...chorizo, pack_size: null, cases: 2 }).words)
            .toBe('3 single items, taking a case as 2 of them, at €27.99 a case: €41.99')
    })

    it('says what was charged over on a price query', () => {
        const over = { ...chorizo, price_per_case: 31.99, line_total: 31.99 }
        expect(claimWorking({ kind: 'price', cases: 0, units: 3 }, over, { agreedPerCase: 27.99 }).words)
            .toBe('3 of the 4 x 500 g in a case, €4.00 a case over the agreed price: €3.00')
    })

    // Against the right docket, the old kilo reading would have claimed more
    // than the whole line, and nothing said so.
    it('refuses a claim for more than the line billed, and says what the line had', () => {
        const out = claimWorking({ cases: 2, units: 0 }, chorizo)
        expect(out.problem).toBe('That line only billed 1 case, less than this claim. '
            + 'Pick another line, or check the numbers on the note.')
        expect(claimWorking({ cases: 0, units: 5 }, chorizo).problem).toMatch(/^That line only billed 1 case,/)
        expect(claimWorking({ cases: 0, units: 4 }, chorizo).problem).toBeNull()
    })

    // Sysco prints a loose sale as a one item pack with the count under UNIT,
    // so the working says single items too, the way the paper does.
    it('keeps to single items on a line of one item packs', () => {
        const loose = {
            pack_size: '1X500 GM', units_per_case: 0.5, price_per_case: 7, line_total: 7,
            vat_amount: 0, deposit_amount: 0, cases: 0, units: 3,
        }
        expect(claimWorking({ cases: 0, units: 3 }, loose)).toEqual({
            amount: 21, words: '3 single items at €7.00 each: €21.00', problem: null,
        })
        expect(claimWorking({ cases: 0, units: 4 }, loose).problem).toMatch(/^That line only billed 3 single items,/)
    })

    it('says why when there is nothing to work it out from', () => {
        expect(claimWorking({ cases: 1 }, { ...chorizo, price_per_case: 0, units_per_case: 0 }).problem)
            .toBe('That line has no price on it to work the claim out from.')
        expect(claimWorking({ kind: 'price', cases: 1 }, chorizo).problem)
            .toBe('Say what they should have charged a case, and it has to be less than what they did.')
    })

    // Lower than they charged, and still nothing once split over the cans.
    it('says when a price query comes to less than a cent', () => {
        const coke = { pack_size: '24X330 ML', price_per_case: 18.54, units_per_case: 24, line_total: 18.54, cases: 1, units: 0 }
        expect(claimWorking({ kind: 'price', cases: 0, units: 1 }, coke, { agreedPerCase: 18.53 }).problem)
            .toBe('That difference comes to less than a cent.')
    })
})

describe('a docket that is not the invoice', () => {
    it('is only when a docket was written and the numbers differ', () => {
        expect(notTheDocket({ docket_number: '45747318' }, { invoice_number: '45607444' })).toBe(true)
        expect(notTheDocket({ docket_number: '45747318' }, { invoice_number: '45747318' })).toBe(false)
        expect(notTheDocket({ docket_number: null }, { invoice_number: '45607444' })).toBe(false)
    })
})

describe('what a price query is worth', () => {
    // The real case that prompted it: a bowl moved to a new code, came in at
    // 49.00 a case instead of 29.00, and the supplier is crediting the
    // difference. The bowls arrived and were kept.
    const bowls = { price_per_case: 49, units_per_case: 50 }

    it('is the difference, not the whole line', () => {
        expect(claimAmount({ kind: 'price', cases: 2, units: 0 }, bowls, { agreedPerCase: 29 })).toBe(40)
    })

    it('prices loose units at the difference per unit', () => {
        expect(claimAmount({ kind: 'price', cases: 0, units: 10 }, bowls, { agreedPerCase: 29 })).toBe(4)
    })

    // Without the price that should have been charged there is nothing to work
    // it out from, and guessing the whole line would take the bowls themselves
    // off the food cost.
    it('says nothing until it knows what the price should have been', () => {
        expect(claimAmount({ kind: 'price', cases: 2 }, bowls)).toBeNull()
    })

    it('says nothing when they did not charge more than agreed', () => {
        expect(claimAmount({ kind: 'price', cases: 2 }, bowls, { agreedPerCase: 49 })).toBeNull()
    })

    // The VAT on the overcharge comes back with it. Nothing was sent back, so
    // no deposit does.
    it('adds the VAT on the difference and no deposit', () => {
        const taxed = { ...bowls, line_total: 98, vat_amount: 22.54, deposit_amount: 0 }
        expect(claimAmount({ kind: 'price', cases: 2, units: 0 }, taxed, { agreedPerCase: 29 })).toBe(49.2)

        const drinks = { price_per_case: 20, units_per_case: 24, line_total: 20, vat_amount: 4.6, deposit_amount: 3.6 }
        expect(claimAmount({ kind: 'price', cases: 1, units: 0 }, drinks, { agreedPerCase: 18 })).toBe(2.46)
    })
})

describe('the balance', () => {
    it('is what is still being chased', () => {
        expect(claimBalance(claim({ credited_amount: 20 }))).toBe(49.98)
    })

    // A credit can settle part of an ask, which is why this is a balance rather
    // than a flag.
    it('is nothing once it is fully credited', () => {
        expect(claimBalance(claim({ credited_amount: 69.98 }))).toBe(0)
        expect(claimIsOpen(claim({ credited_amount: 69.98 }))).toBe(false)
    })

    // They never credit more than was asked, and a negative balance would show
    // as money owed to the supplier on the week.
    it('never goes below nothing', () => {
        expect(claimBalance(claim({ credited_amount: 90 }))).toBe(0)
    })

    it('is unknown until the claim has been matched to a line', () => {
        expect(claimBalance(claim({ amount: null }))).toBeNull()
        expect(claimIsOpen(claim({ amount: null }))).toBe(true)
    })
})

// What a claim takes off the week of its delivery, which the delete dialog on
// the Invoices page counts. It has to be the view's own rule, or the dialog
// says money still comes off when it does not.
describe('what a claim takes off its week', () => {
    it('is the whole ask while it is open, and what came back once it is not', () => {
        expect(claimTakesOff(claim())).toBe(69.98)
        expect(claimTakesOff(claim({ status: 'settled', credited_amount: 60 }))).toBe(60)
        expect(claimTakesOff(claim({ status: 'refused', credited_amount: 10 }))).toBe(10)
    })

    it('is nothing for a refusal with nothing back, or one taken back', () => {
        expect(claimTakesOff(claim({ status: 'refused', credited_amount: 0 }))).toBe(0)
        expect(claimTakesOff(claim({ status: 'void' }))).toBe(0)
    })

    it('is nothing until the claim has an amount and a week', () => {
        expect(claimTakesOff(claim({ amount: null }))).toBe(0)
        expect(claimTakesOff(claim({ counted_week: null }))).toBe(0)
    })

    it('follows the rule invoice_cost_by_category takes claims off by', () => {
        const schema = readFileSync('supabase/schema.sql', 'utf8')
        const view = schema.slice(schema.indexOf('VIEW "public"."invoice_cost_by_category"'))
        const claims = view.slice(view.indexOf('FROM (("public"."invoice_line_claims" "c"'), view.indexOf('COMMENT ON'))
        expect(claims).toContain(`"c"."status" = ANY (ARRAY['open'::"text", 'settled'::"text", 'refused'::"text"])`)
        expect(claims).toContain('"c"."counted_week" IS NOT NULL')
        expect(claims).toContain('"c"."amount" IS NOT NULL')
        expect(claims).toContain(`CASE WHEN ("c"."status" = 'open'::"text") THEN "c"."amount" ELSE "c"."credited_amount" END > (0)::numeric`)
    })
})

describe('matching a note to a line', () => {
    const invoices = [
        {
            id: 'i1',
            supplier_id: 's1',
            invoice_number: '45612214',
            invoice_date: '2026-09-13',
            document_type: 'invoice',
            invoice_lines: [
                { id: 'l1', raw_description: 'CHICKEN BREAST DICED' },
                { id: 'l2', raw_description: 'FLOUR TORTILLA 12IN' },
            ],
        },
        {
            id: 'i2',
            supplier_id: 's1',
            invoice_number: '45612570',
            invoice_date: '2026-09-15',
            document_type: 'invoice',
            invoice_lines: [{ id: 'l3', raw_description: 'RICE LONG GRAIN' }],
        },
    ]

    // The docket number is exact, so when somebody wrote it down this is a
    // lookup and not a guess.
    it('picks the line on its own when the docket number was written down', () => {
        const found = claimMatch(claim({ docket_number: '45612214', what: 'chicken breast' }), invoices)
        expect(found.line.id).toBe('l1')
    })

    it('offers only the lines of the docket written down', () => {
        const { waiting, lines } = claimCandidates(claim({ docket_number: '45612214', what: 'rice' }), invoices)
        expect(waiting).toBe(false)
        expect(lines.map(c => c.line.id).sort()).toEqual(['l1', 'l2'])
    })

    // The Chorizo of 2 October: docket 45747318 was not imported yet, and
    // every Sysco invoice of the last sixty days was offered instead, so it
    // went on the Chorizo of 13 September.
    it('waits for a docket that is not in the Hub yet rather than offering other deliveries', () => {
        const note = claim({ docket_number: '45747318', what: 'chicken breast' })
        expect(claimCandidates(note, invoices)).toMatchObject({ waiting: true, lines: [] })
        expect(claimMatch(note, invoices)).toBeNull()
    })

    it('offers the deliveries around the day when the docket number is missing, nearest first', () => {
        const note = claim({ docket_number: null, what: 'chicken breast', raised_on: '2026-09-15' })
        const { waiting, lines } = claimCandidates(note, invoices)
        expect(waiting).toBe(false)
        expect(lines.map(c => c.line.id)).toEqual(['l3', 'l1', 'l2'])
        expect(claimMatch(note, invoices)).toBeNull()
    })

    // A delivery six weeks before the note is not the one it is about.
    it('leaves out deliveries more than a week before the note, or more than two days after', () => {
        const note = claim({ docket_number: null, what: 'chicken breast', raised_on: '2026-10-27' })
        expect(claimCandidates(note, invoices).lines).toEqual([])
        const before = claim({ docket_number: null, what: 'rice', raised_on: '2026-09-12' })
        expect(claimCandidates(before, invoices).lines.map(c => c.line.id)).toEqual(['l1', 'l2'])
        const tooEarly = claim({ docket_number: null, what: 'rice', raised_on: '2026-09-10' })
        expect(claimCandidates(tooEarly, invoices).lines).toEqual([])
    })

    // A docket number written down wrong would otherwise wait for ever.
    it('offers the deliveries around the day when somebody says it was a different one', () => {
        const note = claim({ docket_number: '45747318', what: 'rice', raised_on: '2026-09-16' })
        expect(otherDeliveries(note, invoices).map(c => c.line.id)).toEqual(['l3', 'l1', 'l2'])
    })

    it('groups lines under the invoice they are on, in the order given', () => {
        const note = claim({ docket_number: null, what: 'chicken breast', raised_on: '2026-09-15' })
        const groups = byInvoice(claimCandidates(note, invoices).lines)
        expect(groups.map(g => [g.invoice.id, g.lines.map(c => c.line.id)])).toEqual([['i2', ['l3']], ['i1', ['l1', 'l2']]])
    })

    // Attaching a claim to the wrong line moves money off the wrong product and
    // nothing would ever say so.
    it('refuses to choose when two lines look equally likely', () => {
        const twins = [{
            ...invoices[0],
            invoice_lines: [
                { id: 'l1', raw_description: 'CHICKEN BREAST DICED' },
                { id: 'l4', raw_description: 'CHICKEN BREAST DICED' },
            ],
        }]
        expect(claimMatch(claim({ docket_number: '45612214', what: 'chicken breast diced' }), twins)).toBeNull()
    })

    it('refuses when nothing on the document is much like it', () => {
        expect(claimMatch(claim({ docket_number: '45612214', what: 'bay leaves' }), invoices)).toBeNull()
    })

    it('leaves a claim that is already matched alone', () => {
        expect(claimMatch(claim({ invoice_line_id: 'l1', docket_number: '45612214' }), invoices)).toBeNull()
    })

    it('never offers a credit note as the thing that was claimed against', () => {
        const withCredit = [...invoices, {
            id: 'i3', supplier_id: 's1', document_type: 'credit',
            invoice_lines: [{ id: 'l9', raw_description: 'CHICKEN BREAST DICED' }],
        }]
        expect(claimCandidates(claim({ what: 'chicken breast' }), withCredit).lines
            .some(c => c.invoice.id === 'i3')).toBe(false)
    })
})

describe('when the credit note turns up', () => {
    const invoice = { id: 'i1', invoice_number: '45612214', invoice_date: '2026-09-14' }
    const credit = { id: 'cr1', number: 'C1', orderReference: '45612214', date: '2026-09-15', goodsTotal: -69.98 }

    // The claim is where the money comes off, in the week the delivery
    // happened. The credit settles it and does not count again on its own.
    it('settles the claim against the invoice it credits and does not count itself', () => {
        const out = creditSettles({
            credit, against: invoice, claims: [claim({ invoice_id: 'i1' })],
            lines: [{ code: '330112', value: -69.98 }], supplierId: 's1', restaurantId: 'r1',
        })
        expect(out.countsInCost).toBe(false)
        expect(out.extra).toBeNull()
        expect(out.settle).toEqual([{
            id: 'c1',
            patch: expect.objectContaining({
                credited_amount: 69.98, status: 'settled', settled_on: '2026-09-15', credit_invoice_id: 'cr1',
            }),
        }])
    })

    // Every credit until people start logging problems at the door.
    // What a credit line gives back is what the line cost, the same footing
    // the claim was priced on, so a drink sent back settles in full.
    it('gives back the VAT and deposit on a credit line', () => {
        const out = creditSettles({
            credit, against: invoice, claims: [claim({ invoice_id: 'i1', amount: 33.61 })],
            lines: [{ code: '483156', value: -24.4, vat: -5.61, deposit: -3.6 }], supplierId: 's1', restaurantId: 'r1',
        })
        expect(out.settle[0].patch).toMatchObject({ credited_amount: 33.61, status: 'settled' })
        expect(out.extra).toBeNull()
    })

    it('counts on its own when there is no claim behind it', () => {
        const out = creditSettles({ credit, against: invoice, claims: [], supplierId: 's1' })
        expect(out).toEqual({ settle: [], extra: null, countsInCost: true })
    })

    // Written down at the door before the invoice was even in the Hub.
    it('finds a note from the door by the docket number', () => {
        const door = claim({ invoice_id: null, docket_number: '45612214', amount: null })
        const out = creditSettles({ credit, against: invoice, claims: [door], supplierId: 's1' })
        expect(out.settle[0].patch).toMatchObject({
            amount: 69.98, credited_amount: 69.98, status: 'settled', invoice_id: 'i1',
        })
    })

    it('leaves a claim against a different invoice alone', () => {
        const other = claim({ invoice_id: 'i9', docket_number: '99999999' })
        expect(creditSettles({ credit, against: invoice, claims: [other], supplierId: 's1' }).countsInCost)
            .toBe(true)
    })

    // A credit can settle part of an ask, which is what the balance is for.
    it('leaves a claim open when only part of it comes back', () => {
        const out = creditSettles({
            credit: { ...credit, goodsTotal: -30 }, against: invoice,
            claims: [claim({ invoice_id: 'i1' })], supplierId: 's1',
        })
        expect(out.settle[0].patch).toMatchObject({ credited_amount: 30, status: 'open', settled_on: null })
    })

    it('adds to what has already come back', () => {
        const out = creditSettles({
            credit: { ...credit, goodsTotal: -39.98 }, against: invoice,
            claims: [claim({ invoice_id: 'i1', credited_amount: 30 })], supplierId: 's1',
        })
        expect(out.settle[0].patch).toMatchObject({ credited_amount: 69.98, status: 'settled' })
    })

    // Two claims on one delivery and a credit note with a line for each.
    it('puts each credit line against the claim for the same product first', () => {
        const chicken = claim({ id: 'a', invoice_id: 'i1', amount: 40, code: '330112', raised_on: '2026-09-14' })
        const rice = claim({ id: 'b', invoice_id: 'i1', amount: 18.45, code: '512004', raised_on: '2026-09-13' })
        const out = creditSettles({
            credit, against: invoice, claims: [chicken, rice], supplierId: 's1',
            lines: [{ code: '330112', value: -40 }, { code: '512004', value: -18.45 }],
        })
        const byId = Object.fromEntries(out.settle.map(s => [s.id, s.patch.credited_amount]))
        expect(byId).toEqual({ a: 40, b: 18.45 })
    })

    // They never credit more than was asked at the door, so money left over
    // means somebody asked and nobody wrote it down. It becomes a claim of its
    // own rather than half of one credit counting in one week and half in
    // another.
    it('turns money nobody logged into a claim of its own, with no reason made up', () => {
        const out = creditSettles({
            credit: { ...credit, goodsTotal: -90 }, against: invoice,
            claims: [claim({ invoice_id: 'i1' })], supplierId: 's1', restaurantId: 'r1',
        })
        expect(out.countsInCost).toBe(false)
        expect(out.extra).toMatchObject({
            kind: 'other', amount: 20.02, credited_amount: 20.02, status: 'settled',
            invoice_id: 'i1', counted_week: '2026-09-13',
        })
        expect(claimKind(out.extra.kind).label).toBe('No reason logged')
    })

    // The credit often comes after the delivery's report has gone out, and
    // money put into a week already sent is in no report at all.
    it('puts money nobody logged into the first week still open', () => {
        const out = creditSettles({
            credit: { ...credit, goodsTotal: -90 }, against: invoice,
            claims: [claim({ invoice_id: 'i1' })], supplierId: 's1', restaurantId: 'r1',
            sent: ['2026-09-13'],
        })
        expect(out.extra).toMatchObject({ amount: 20.02, counted_week: '2026-09-20' })
    })

    // A note from the door nobody put against a line has no money on it
    // until its credit comes, so the credit is when its week is decided, the
    // same way as putting it against a line on Delivery problems.
    it('gives a note from the door the delivery\'s week when it first gets money', () => {
        const door = claim({ invoice_id: null, docket_number: '45612214', amount: null, counted_week: '2026-09-20', raised_on: '2026-09-20' })
        const open = creditSettles({ credit, against: invoice, claims: [door], supplierId: 's1' })
        expect(open.settle[0].patch).toMatchObject({ amount: 69.98, counted_week: '2026-09-13' })

        const sent = creditSettles({ credit, against: invoice, claims: [door], supplierId: 's1', sent: ['2026-09-13', '2026-09-20'] })
        expect(sent.settle[0].patch).toMatchObject({ amount: 69.98, counted_week: '2026-09-27' })
    })

    // One already put against its line had its week decided then, and its
    // money has been coming off it since.
    it('leaves the week of a claim that already had money on it', () => {
        const out = creditSettles({
            credit, against: invoice, claims: [claim({ invoice_id: 'i1' })], supplierId: 's1', sent: ['2026-09-13'],
        })
        expect(out.settle[0].patch).not.toHaveProperty('counted_week')
    })

    // Sysco credits the three Chorizo bags at 7.00 each, 21.00, the same as
    // the claim is priced at.
    it('settles three single bags with the credit for them and makes nothing else', () => {
        const bags = claim({ invoice_id: 'i1', amount: 21, code: '485073', cases: 0, units: 3 })
        const out = creditSettles({
            credit, against: invoice, claims: [bags], lines: [{ code: '485073', value: -21 }], supplierId: 's1',
        })
        expect(out.settle[0].patch).toMatchObject({ credited_amount: 21, status: 'settled' })
        expect(out.extra).toBeNull()
    })

    // A cent of rounding is not money somebody asked for and forgot to log.
    it('gives a few cents over to the claim for the same product rather than a claim of their own', () => {
        const bags = claim({ invoice_id: 'i1', amount: 20.99, code: '485073', cases: 0, units: 3 })
        const out = creditSettles({
            credit, against: invoice, claims: [bags], lines: [{ code: '485073', value: -21 }], supplierId: 's1',
        })
        expect(out.settle[0].patch).toMatchObject({ amount: 21, credited_amount: 21, status: 'settled' })
        expect(out.extra).toBeNull()
    })

    it('still makes a claim of its own for more than a few cents', () => {
        const bags = claim({ invoice_id: 'i1', amount: 20.9, code: '485073', cases: 0, units: 3 })
        const out = creditSettles({
            credit, against: invoice, claims: [bags], lines: [{ code: '485073', value: -21 }], supplierId: 's1',
        })
        expect(out.extra).toMatchObject({ amount: 0.1 })
    })

    // Priced as kilos it asked for twice what came back, and stays open.
    it('leaves a claim priced wrong open with the rest still owed', () => {
        const kilos = claim({ invoice_id: 'i1', amount: 41.99, code: '485073', cases: 0, units: 3 })
        const out = creditSettles({
            credit, against: invoice, claims: [kilos], lines: [{ code: '485073', value: -21 }], supplierId: 's1',
        })
        expect(out.settle[0].patch).toMatchObject({ credited_amount: 21, status: 'open' })
    })
})

describe('the claim that carries the money, week by week', () => {
    // What invoice_cost_by_category takes off for a claim: the whole ask while
    // it is open, what came back once it is settled. Pinned here so the view
    // and the arithmetic cannot drift apart without a test saying so.
    const offWeek = c => (c.status === 'open' ? c.amount : c.credited_amount)

    it('takes off the same money before and after the credit arrives', () => {
        const before = claim({ invoice_id: 'i1' })
        const out = creditSettles({
            credit: { id: 'cr1', orderReference: '45612214', date: '2026-09-21', goodsTotal: -69.98 },
            against: { id: 'i1', invoice_date: '2026-09-14' }, claims: [before], supplierId: 's1',
        })
        const after = { ...before, ...out.settle[0].patch }

        expect(offWeek(before)).toBe(69.98)
        expect(offWeek(after)).toBe(69.98)
        // And in the same week, even though the credit is dated the week after.
        expect(after.counted_week).toBe(before.counted_week)
    })
})

// The audit of 28 September. A credit that settled a claim was deleted on the
// Invoices page and imported again. The claim was left settled, so the second
// import found nothing open, counted the credit on its own date, and the same
// money came off twice.
describe('deleting a credit note that settled a claim', () => {
    const invoice = { id: 'i1', invoice_date: '2026-09-14' }
    const offWeek = c => (c.status === 'open' ? c.amount : c.credited_amount)
    const imported = (id, claims) => creditSettles({
        credit: { id, orderReference: '45612214', date: '2026-09-15', goodsTotal: -69.98 },
        against: invoice, claims, supplierId: 's1', restaurantId: 'r1',
    })
    const imported50 = (id, claims) => creditSettles({
        credit: { id, orderReference: '45612214', date: '2026-09-16', goodsTotal: -50 },
        against: invoice, claims, supplierId: 's1', restaurantId: 'r1',
    })
    const apply = (claims, changes) => claims.map(c => {
        const change = changes.find(x => x.id === c.id)
        return change ? { ...c, ...change.patch } : c
    })

    it('takes the money off once when it is imported again', () => {
        const first = imported('cr1', [claim({ invoice_id: 'i1' })])
        const settled = apply([claim({ invoice_id: 'i1' })], first.settle)
        expect(settled[0].status).toBe('settled')

        const back = creditTakenBack({ id: 'cr1', total_amount: -69.98 }, settled)
        const reopened = apply(settled, back.change)
        expect(reopened[0]).toMatchObject({
            status: 'open', credited_amount: 0, settled_on: null, credit_invoice_id: null,
        })
        // Still coming off the delivery's week while the credit is gone.
        expect(offWeek(reopened[0])).toBe(69.98)

        const again = imported('cr2', reopened)
        expect(again.countsInCost).toBe(false)
        expect(offWeek(apply(reopened, again.settle)[0])).toBe(69.98)
    })

    it('deletes the claim it made for money nobody logged', () => {
        const other = claim({ id: 'x', kind: 'other', status: 'settled', credited_amount: 20.02, credit_invoice_id: 'cr1' })
        const back = creditTakenBack({ id: 'cr1', total_amount: -90 }, [other])
        expect(back.remove).toEqual(['x'])
        expect(back.change).toEqual([])
    })

    // A claim only keeps its running total and the last credit that touched
    // it. An earlier credit's part stays.
    it('keeps what an earlier credit brought back', () => {
        const twice = claim({ status: 'settled', credited_amount: 69.98, credit_invoice_id: 'cr2' })
        const back = creditTakenBack({ id: 'cr2', total_amount: -39.98 }, [twice])
        expect(back.change[0].patch).toMatchObject({ credited_amount: 30, status: 'open' })
        expect(back.waiting).toBe(1)
    })

    // The review of 30 September. One credit took the whole of itself off
    // every claim, so an earlier credit's part on the older claim went too,
    // and importing it again gave that claim money the newer one was owed.
    it('takes back only what it gave, from the newest claim first', () => {
        const older = claim({ id: 'a', invoice_id: 'i1', amount: 50, raised_on: '2026-09-14' })
        const newer = claim({ id: 'b', invoice_id: 'i1', amount: 30, raised_on: '2026-09-15' })

        // An earlier credit gave the older claim 30 of its 50.
        const first = creditSettles({
            credit: { id: 'cr1', orderReference: '45612214', date: '2026-09-15', goodsTotal: -30 },
            against: invoice, claims: [older], supplierId: 's1', restaurantId: 'r1',
        })
        const part = apply([older, newer], first.settle)
        expect(part[0]).toMatchObject({ status: 'open', credited_amount: 30 })

        // This one gave the older claim its last 20 and the newer one 30.
        const second = imported50('cr2', part)
        const settled = apply(part, second.settle)
        expect(settled.map(c => c.credited_amount)).toEqual([50, 30])

        const back = creditTakenBack({ id: 'cr2', total_amount: -50 }, settled)
        const reopened = apply(settled, back.change)
        expect(reopened.map(c => c.credited_amount)).toEqual([30, 0])
        expect(reopened.map(c => c.status)).toEqual(['open', 'open'])

        // Imported again, each gets what it got the first time.
        const again = apply(reopened, imported50('cr2', reopened).settle)
        expect(again.map(c => [c.status, c.credited_amount])).toEqual([['settled', 50], ['settled', 30]])
    })

    // The total and its lines can be a cent or two apart, and that is
    // rounding, not an earlier credit.
    it('gives everything back when it covers what its claims hold', () => {
        const settled = [
            claim({ id: 'a', status: 'settled', credited_amount: 22.34, credit_invoice_id: 'cr1' }),
            claim({ id: 'b', status: 'settled', credited_amount: 10, credit_invoice_id: 'cr1', raised_on: '2026-09-15' }),
        ]
        const back = creditTakenBack({ id: 'cr1', total_amount: -32.33 }, settled)
        expect(back.change.map(c => c.patch.credited_amount)).toEqual([0, 0])
    })

    it('keeps a refusal, and takes the credit out of what came back', () => {
        const refused = claim({ status: 'refused', credited_amount: 10, credit_invoice_id: 'cr1' })
        const back = creditTakenBack({ id: 'cr1', total_amount: -10 }, [refused])
        expect(back.change[0].patch).toEqual({ credited_amount: 0, credit_invoice_id: null })
        expect(back.waiting).toBe(0)
    })

    it('leaves claims settled by another credit, and ones taken back, alone', () => {
        const back = creditTakenBack({ id: 'cr1', total_amount: -10 }, [
            claim({ id: 'a', status: 'settled', credited_amount: 10, credit_invoice_id: 'cr9' }),
            claim({ id: 'b', status: 'void', credited_amount: 10, credit_invoice_id: 'cr1' }),
        ])
        expect(back).toEqual({ change: [], remove: [], waiting: 0 })
    })

    it('does nothing for an invoice nothing was settled by', () => {
        const back = creditTakenBack({ id: 'i1', total_amount: 163.03 }, [claim({ invoice_id: 'i1' })])
        expect(back).toEqual({ change: [], remove: [], waiting: 0 })
    })
})

describe('a credit that reverses a whole invoice', () => {
    const invoice = { id: 'i1', total_amount: 102.43 }

    // Three of these turned up in one month, all the next day: a whole delivery
    // of 378.40 sent back.
    it('is found by the reference and the total together', () => {
        const credits = [{ id: 'cr1', credit_of_invoice_id: 'i1', total_amount: -102.43 }]
        expect(voidedBy(invoice, credits).id).toBe('cr1')
    })

    it('is not a part credit against the same invoice', () => {
        const credits = [{ id: 'cr1', credit_of_invoice_id: 'i1', total_amount: -40 }]
        expect(voidedBy(invoice, credits)).toBeNull()
    })

    it('is not a full credit against a different invoice', () => {
        const credits = [{ id: 'cr1', credit_of_invoice_id: 'i2', total_amount: -102.43 }]
        expect(voidedBy(invoice, credits)).toBeNull()
    })
})

describe('a line sent back on its own', () => {
    const fries = { id: 'l1', invoice_id: 'i1', supplier_code: '492717', line_total: 47.68 }
    const chips = { id: 'l2', invoice_id: 'i1', supplier_code: '492397', line_total: 19.82 }

    // The julienne fries on the first real week, ordered by mistake and
    // credited in full the same day.
    it('is gone when its code was credited in full against its own invoice', () => {
        const credits = [{
            id: 'cr1', credit_of_invoice_id: 'i1',
            invoice_lines: [{ supplier_code: '492717', line_total: -47.68 }],
        }]
        expect([...sentBack([fries, chips], credits)]).toEqual(['l1'])
    })

    it('stays when only part of it came back', () => {
        const credits = [{
            id: 'cr1', credit_of_invoice_id: 'i1',
            invoice_lines: [{ supplier_code: '492717', line_total: -23.84 }],
        }]
        expect(sentBack([fries], credits).size).toBe(0)
    })

    it('stays when the credit is against a different invoice', () => {
        const credits = [{
            id: 'cr1', credit_of_invoice_id: 'i9',
            invoice_lines: [{ supplier_code: '492717', line_total: -47.68 }],
        }]
        expect(sentBack([fries], credits).size).toBe(0)
    })

})

describe('what is still being chased', () => {
    const claims = [
        claim({ id: 'old', raised_on: '2026-09-01' }),
        claim({ id: 'new', raised_on: '2026-09-18' }),
        claim({ id: 'done', raised_on: '2026-09-02', status: 'settled', credited_amount: 69.98 }),
    ]

    // The list he described: jobs that stay on the report until they are
    // crossed off. It is the point of the delivery door idea rather than a
    // summary of it.
    it('is the open ones, longest waiting first', () => {
        const list = chasingList(claims, '2026-09-20')
        expect(list.map(w => w.claim.id)).toEqual(['old', 'new'])
        expect(list[0].days).toBe(19)
    })

    // Every credit over the real month came the same day or the next one.
    it('says which have been waiting long enough to be worth a word', () => {
        const list = chasingList(claims, '2026-09-20')
        expect(isLate(list[0])).toBe(true)
        expect(isLate(list[1])).toBe(false)
    })
})

describe('what the week says about claims', () => {
    const claims = [
        claim({ id: 'a', raised_on: '2026-09-14', status: 'settled', credited_amount: 69.98 }),
        claim({ id: 'b', raised_on: '2026-09-15', credited_amount: 20 }),
        claim({ id: 'c', raised_on: '2026-09-28' }),
    ]

    it('counts what came back and what is still out', () => {
        expect(claimsForWeek(claims, '2026-09-13', '2026-09-19')).toEqual({
            raised: 2, settled: 1, open: 1, credited: 69.98, waiting: 49.98,
        })
    })

    it("leaves the other week out of it", () => {
        expect(claimsForWeek(claims, '2026-09-27', '2026-10-03').raised).toBe(1)
    })
})

describe('how a supplier does on claims', () => {
    const suppliers = [{ id: 's1', name: 'Test Supplier' }, { id: 's2', name: 'Another' }]
    const rows = [
        claim({ id: 'a', status: 'settled', credited_amount: 69.98, settled_on: '2026-09-15' }),
        claim({ id: 'b', amount: 40, credited_amount: 10 }),
        claim({ id: 'c', status: 'refused', amount: 25 }),
        claim({ id: 'd', supplier_id: 's2', amount: 12, raised_on: '2026-09-19' }),
    ]

    const summary = bySupplier(rows, suppliers, '2026-09-20')
    const mine = summary.find(r => r.supplierId === 's1')

    it('counts each kind of ending', () => {
        expect(mine).toMatchObject({ raised: 3, settled: 1, refused: 1, open: 1 })
    })

    // The two figures nobody in the building has ever been able to put a number
    // on. A supplier who credits everything the next day and one who credits
    // two thirds of it a fortnight later look identical when all anybody keeps
    // is the credit notes.
    it('says how much of what was asked for came back', () => {
        expect(mine.asked).toBe(134.98)
        expect(mine.credited).toBe(79.98)
        expect(mine.backPct).toBe(59.3)
    })

    it('says what is still out and how long the oldest has been', () => {
        expect(mine.waiting).toBe(30)
        expect(mine.oldest).toBe(6)
    })

    // The middle one, because a single claim somebody forgot about for two
    // months would drag a mean into saying something untrue about every week.
    it('quotes the typical wait rather than the average', () => {
        expect(mine.typicalDays).toBe(1)
    })

    it('keeps the suppliers apart and puts the most owed first', () => {
        expect(summary.map(r => r.supplierId)).toEqual(['s1', 's2'])
    })

    it('says nothing rather than nought where nothing has been asked', () => {
        const none = bySupplier([claim({ amount: null })], suppliers, '2026-09-20')
        expect(none[0].backPct).toBeNull()
        expect(none[0].typicalDays).toBeNull()
    })
})

// A Saturday delivery, short a case. Its money comes off the week it landed
// in, unless that week's report has gone out: then off the first week whose
// report has not, so it is in a report at all. His decision of 1 October.
describe('claimWeek', () => {
    it('is the week the delivery landed in', () => {
        expect(claimWeek('2026-09-26', [])).toEqual({ week: '2026-09-20', delivered: '2026-09-20', moved: false })
    })

    it('is the next week when the report for the delivery\'s week has been sent', () => {
        expect(claimWeek('2026-09-26', ['2026-09-20']))
            .toEqual({ week: '2026-09-27', delivered: '2026-09-20', moved: true })
    })

    it('skips every week whose report has gone out', () => {
        expect(claimWeek('2026-09-26', ['2026-09-27', '2026-09-20', '2026-10-04']).week).toBe('2026-10-11')
    })

    // A gap is a week nobody has sent, so it is open.
    it('stops at the first week not sent, even with sent weeks after it', () => {
        expect(claimWeek('2026-09-26', ['2026-09-20', '2026-10-04']).week).toBe('2026-09-27')
    })

    it('takes no notice of weeks sent before the delivery', () => {
        expect(claimWeek('2026-09-26', ['2026-09-13'])).toMatchObject({ week: '2026-09-20', moved: false })
    })
})

// The weeks whose report is published, which is what closes a week. A draft
// does not.
describe('sentWeeks', () => {
    function client(answer) {
        const asked = []
        const query = {
            select: c => { asked.push(['select', c]); return query },
            eq: (c, v) => { asked.push(['eq', c, v]); return query },
            then: (resolve, reject) => Promise.resolve(answer).then(resolve, reject),
        }
        return { asked, from: t => { asked.push(['from', t]); return query } }
    }

    it('reads the published weeks of one restaurant', async () => {
        const db = client({ data: [{ week_start: '2026-09-20' }, { week_start: '2026-09-27' }], error: null })
        expect(await sentWeeks(db, 'r1')).toEqual({ weeks: ['2026-09-20', '2026-09-27'], error: null })
        expect(db.asked).toEqual(expect.arrayContaining([
            ['from', 'weekly_reports'], ['eq', 'restaurant_id', 'r1'], ['eq', 'status', 'published'],
        ]))
    })

    it('hands the error back rather than a week with nothing sent', async () => {
        const failed = { message: 'Failed to fetch' }
        expect(await sentWeeks(client({ data: null, error: failed }), 'r1')).toEqual({ weeks: null, error: failed })
    })
})

// A claim whose money comes off this week for a delivery in an earlier one,
// because that week's report had already gone out. Wherever the week is
// shown, it says which delivery the money is from.
describe('fromEarlierWeeks', () => {
    const invoices = [{ id: 'i1', invoice_date: '2026-09-26' }, { id: 'i2', invoice_date: '2026-10-01' }]
    const moved = claim({ id: 'm', invoice_id: 'i1', counted_week: '2026-09-27', amount: 22.34 })

    it('lists a claim taken off this week for a delivery in an earlier one', () => {
        expect(fromEarlierWeeks([moved], invoices, '2026-09-27')).toEqual([expect.objectContaining({
            id: 'm', what: 'two trays of chicken', label: 'Short', money: 22.34, delivered: '2026-09-20',
        })])
    })

    it('is what came back once it is settled, the same as the week takes off', () => {
        const settled = { ...moved, status: 'settled', credited_amount: 20 }
        expect(fromEarlierWeeks([settled], invoices, '2026-09-27')[0].money).toBe(20)
    })

    it('leaves out this week\'s own deliveries, other weeks, and anything taking nothing off', () => {
        const own = claim({ id: 'o', invoice_id: 'i2', counted_week: '2026-09-27' })
        const elsewhere = { ...moved, id: 'e', counted_week: '2026-10-04' }
        const unpriced = { ...moved, id: 'u', amount: null }
        const takenBack = { ...moved, id: 'v', status: 'void' }
        expect(fromEarlierWeeks([own, elsewhere, unpriced, takenBack], invoices, '2026-09-27')).toEqual([])
    })

    // Money a credit brought that nobody logged, with no invoice named.
    it('goes by the day it was raised when there is no invoice behind it', () => {
        const noInvoice = claim({ id: 'n', invoice_id: null, raised_on: '2026-09-19', counted_week: '2026-09-27' })
        expect(fromEarlierWeeks([noInvoice], [], '2026-09-27')[0].delivered).toBe('2026-09-13')
    })
})
