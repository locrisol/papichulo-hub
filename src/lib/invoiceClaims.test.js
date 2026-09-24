import { describe, it, expect } from 'vitest'
import {
    CLAIM_KINDS, claimKind, emptyDoorClaim, doorClaimProblem, doorClaimPayload,
    claimAmount, claimBalance, claimIsOpen, claimCandidates, claimMatch,
    creditLands, settleClaim, voidedBy, chasingList, isLate, claimsForWeek, bySupplier,
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
    it('is five different conversations rather than five words for one', () => {
        expect(CLAIM_KINDS.map(k => k.value))
            .toEqual(['short', 'quality', 'damaged', 'wrong_item', 'price'])
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

describe('matching a note to a line', () => {
    const invoices = [
        {
            id: 'i1',
            supplier_id: 's1',
            invoice_number: '45612214',
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

    it('offers a short list when the docket number is missing', () => {
        const ranked = claimCandidates(claim({ docket_number: null, what: 'chicken breast' }), invoices)
        expect(ranked[0].line.id).toBe('l1')
        expect(claimMatch(claim({ docket_number: null, what: 'chicken breast' }), invoices)).toBeNull()
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
        expect(claimCandidates(claim({ what: 'chicken breast' }), withCredit)
            .some(c => c.invoice.id === 'i3')).toBe(false)
    })
})

describe('which week a credit comes off', () => {
    const credit = { id: 'cr1', invoice_date: '2026-09-21', total_amount: -69.98 }

    // The claim's deduction is replaced by the credit. One deduction, same
    // week, and the week still adds up.
    it('lands in the claim week while that week is still open', () => {
        expect(creditLands(claim(), credit, { publishedWeeks: [] })).toEqual({
            weekStart: '2026-09-13', countsInCost: true, why: 'week_still_open',
        })
    })

    // A published week never changes, so the deduction it already carries
    // stands and counting the credit again would take the same money off twice.
    it('does not count again against a week that has already gone out', () => {
        expect(creditLands(claim(), credit, { publishedWeeks: ['2026-09-13'] })).toEqual({
            weekStart: '2026-09-20', countsInCost: false, why: 'already_counted',
        })
    })

    it('simply counts when there was no claim behind it', () => {
        expect(creditLands(null, credit, { publishedWeeks: ['2026-09-13'] })).toEqual({
            weekStart: '2026-09-20', countsInCost: true, why: 'no_claim',
        })
    })
})

describe('putting a credit against a claim', () => {
    it('settles it when the whole ask comes back', () => {
        const out = settleClaim(claim(), { id: 'cr1', invoice_date: '2026-09-15', total_amount: -69.98 })
        expect(out).toMatchObject({ credited_amount: 69.98, status: 'settled', credit_invoice_id: 'cr1' })
    })

    // A credit can settle part of an ask, which is what the balance is for.
    it('leaves it open when only part comes back', () => {
        const out = settleClaim(claim(), { id: 'cr1', invoice_date: '2026-09-15', total_amount: -30 })
        expect(out.credited_amount).toBe(30)
        expect(out.status).toBe('open')
    })

    // They do not credit more than was asked, so a surplus means the two were
    // matched wrongly, and that is worth knowing rather than absorbing.
    it('says so rather than swallowing a credit bigger than the ask', () => {
        const out = settleClaim(claim(), { id: 'cr1', invoice_date: '2026-09-15', total_amount: -90 })
        expect(out.credited_amount).toBe(69.98)
        expect(out.surplus).toBe(20.02)
    })

    it('adds to what has already come back', () => {
        const out = settleClaim(
            claim({ credited_amount: 30 }),
            { id: 'cr2', invoice_date: '2026-09-16', total_amount: -39.98 },
        )
        expect(out.credited_amount).toBe(69.98)
        expect(out.status).toBe('settled')
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
