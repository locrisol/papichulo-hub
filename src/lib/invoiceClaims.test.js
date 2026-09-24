import { describe, it, expect } from 'vitest'
import {
    CLAIM_KINDS, claimKind, emptyDoorClaim, doorClaimProblem, doorClaimPayload,
    claimAmount, claimBalance, claimIsOpen, claimCandidates, claimMatch,
    creditSettles, voidedBy, sentBack, chasingList, isLate, claimsForWeek, bySupplier,
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
        expect(claimKind(out.extra.kind).label).toBe('Not logged')
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
