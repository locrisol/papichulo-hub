import { describe, it, expect } from 'vitest'
import {
    portalFields, portalValue, portalDate, portalRow, readPortalList,
    portalSummary, compareDocuments, pairCredits, creditDelays, stillMissing,
} from '@/lib/supplierDocuments'

// The shape of a real paste, with the account number changed.
//
// The document numbers, the dates, the values and the pairings are the real
// ones off a month of his portal, because the awkward parts are what is worth
// pinning: an invoice has an empty order reference and a credit does not, the
// numbers do not run in date order, and three credits on the 15th reverse three
// whole invoices from the day before.
const ACCOUNT = '9900001'

function line(id, ref, date, type, value) {
    return `${ACCOUNT}\t${id}\t${ref}\t${date}\t${type}\t${value}\tView`
}

const PASTE = [
    line('45448455', '', '2026-08-23', 'Invoice', '€163.03'),
    line('45480809', '', '2026-08-27', 'Invoice', '€325.95'),
    line('C45485340', '45480809', '2026-08-27', 'Credit', '-€74.26'),
    line('45612214', '', '2026-09-14', 'Invoice', '€102.43'),
    line('45612570', '', '2026-09-14', 'Invoice', '€129.17'),
    line('C45620001', '45612214', '2026-09-15', 'Credit', '-€102.43'),
].join('\n')

describe('splitting a line up', () => {
    it('reads tab separated fields', () => {
        expect(portalFields('a\tb\tc')).toEqual(['a', 'b', 'c'])
    })

    // For a paste that has been through something that turned the tabs into
    // spaces. Two spaces rather than one, because a single space is what sits
    // inside a field and never between two of them.
    it('falls back to runs of spaces', () => {
        expect(portalFields('a   b  c')).toEqual(['a', 'b', 'c'])
    })
})

describe('the money', () => {
    it.each([
        ['€163.03', 163.03],
        ['-€74.26', -74.26],
        ['€1,234.56', 1234.56],
        ['€0.00', 0],
    ])('reads %s', (text, value) => {
        expect(portalValue(text)).toBe(value)
    })

    it('says nothing for nothing', () => {
        expect(portalValue('')).toBeNull()
        expect(portalValue('View')).toBeNull()
    })
})

describe('the date', () => {
    it('is ISO on the portal, unlike the PDF', () => {
        expect(portalDate('2026-08-23')).toBe('2026-08-23')
    })

    it('refuses the format the PDF uses, rather than reading it wrong', () => {
        expect(portalDate('23/08/2026')).toBeNull()
    })

    it('refuses a month that does not exist', () => {
        expect(portalDate('2026-13-01')).toBeNull()
    })
})

describe('one row, read from the right', () => {
    // The bug this whole approach exists to avoid. A browser that drops the
    // empty order reference cell hands back six fields instead of seven, and
    // read from the left the date lands in the type column on most of the list.
    it('reads an invoice whether or not the empty column survived the copy', () => {
        const kept = portalRow(`${ACCOUNT}\t45448455\t\t2026-08-23\tInvoice\t€163.03\tView`)
        const collapsed = portalRow(`${ACCOUNT}\t45448455\t2026-08-23\tInvoice\t€163.03\tView`)

        expect(kept).toEqual(collapsed)
        expect(kept.document_date).toBe('2026-08-23')
        expect(kept.document_type).toBe('invoice')
        expect(kept.order_reference).toBeNull()
    })

    it('keeps the invoice a credit points at', () => {
        const row = portalRow(line('C45485340', '45480809', '2026-08-27', 'Credit', '-€74.26'))
        expect(row.order_reference).toBe('45480809')
        expect(row.document_type).toBe('credit')
    })

    it('does not need the link word at the end', () => {
        const row = portalRow(`${ACCOUNT}\t45448455\t\t2026-08-23\tInvoice\t€163.03`)
        expect(row.document_id).toBe('45448455')
    })

    // The sign is normalised rather than trusted: a credit is money coming back
    // whatever the page printed.
    it('makes a credit negative even when the minus is missing', () => {
        const row = portalRow(line('C1', '45448455', '2026-08-27', 'Credit', '€74.26'))
        expect(row.value).toBe(-74.26)
    })

    it('says nothing for a line it cannot read', () => {
        expect(portalRow('some words')).toBeNull()
        expect(portalRow('')).toBeNull()
    })
})

describe('the whole paste', () => {
    const { rows, problems } = readPortalList(PASTE)

    it('reads every row', () => {
        expect(rows).toHaveLength(6)
        expect(problems).toEqual([])
    })

    it('skips the column titles if they were copied too', () => {
        const withHead = `Customer\tDocument\tOrder Ref\tDate\tType\tValue\t\n${PASTE}`
        expect(readPortalList(withHead).rows).toHaveLength(6)
        expect(readPortalList(withHead).problems).toEqual([])
    })

    it('ignores blank lines', () => {
        expect(readPortalList(`\n\n${PASTE}\n\n`).rows).toHaveLength(6)
    })

    // Two screens of the list that overlap. The second copy is said out loud
    // rather than added, so a count of what was pasted means something.
    it('says when a document is in the paste twice', () => {
        const twice = readPortalList(`${PASTE}\n${line('45448455', '', '2026-08-23', 'Invoice', '€163.03')}`)
        expect(twice.rows).toHaveLength(6)
        expect(twice.problems).toEqual([
            expect.objectContaining({ why: 'twice', documentId: '45448455' }),
        ])
    })

    // Nothing is dropped quietly. A supplier changing one column of its portal
    // would otherwise show up as a short list that looks perfectly fine.
    it('reports a line it could not read rather than dropping it', () => {
        const broken = readPortalList(`${PASTE}\nsomething else entirely`)
        expect(broken.rows).toHaveLength(6)
        expect(broken.problems[0]).toEqual({ why: 'unreadable', line: 'something else entirely' })
    })
})

describe('what the paste amounts to', () => {
    const { rows } = readPortalList(PASTE)
    const summary = portalSummary(rows)

    it('counts both kinds', () => {
        expect(summary.documents).toBe(6)
        expect(summary.invoices).toBe(4)
        expect(summary.credits).toBe(2)
    })

    it('adds up what went out and what came back', () => {
        expect(summary.invoiced).toBe(720.58)
        expect(summary.credited).toBe(176.69)
    })

    it('says what share came back, which nothing else in the Hub can', () => {
        expect(summary.creditedPct).toBe(24.5)
    })

    it('names the days it covers', () => {
        expect(summary.from).toBe('2026-08-23')
        expect(summary.to).toBe('2026-09-15')
    })

    it('says which accounts are in it, because two would mean two restaurants', () => {
        expect(summary.accounts).toEqual([ACCOUNT])
    })
})

describe('the list against what we hold', () => {
    const { rows } = readPortalList(PASTE)

    const held = [
        { id: 'a', invoice_number: '45448455' },
        { id: 'b', invoice_number: '45480809' },
        // Held, and not on the list at all.
        { id: 'c', invoice_number: '99999999' },
        // Entered by hand off a total, on no day the list has anything for.
        { id: 'd', invoice_number: null },
    ]

    const { missing, extra, held: matched } = compareDocuments(rows, held)

    // The whole reason this stage is first. Comparing what we hold against what
    // we hold can never find a document that was never downloaded.
    it('names what has never been downloaded', () => {
        expect(missing.map(r => r.document_id))
            .toEqual(['C45485340', '45612214', '45612570', 'C45620001'])
    })

    it('names what we hold that the supplier does not list', () => {
        expect(extra.map(h => h.invoice_number)).toEqual(['99999999'])
    })

    it('carries the invoice through on the ones we have', () => {
        expect(matched).toHaveLength(2)
        expect(matched[0].invoice.id).toBe('a')
    })
})

describe('pairing a credit with its invoice', () => {
    const { rows } = readPortalList(PASTE)
    const { pairs, loose } = pairCredits(rows)

    // The reference is exact. This was hedged at design time because the PDF
    // shows "ORD No. N/A", and the portal settled it.
    it('is a lookup and not a guess', () => {
        expect(pairs).toHaveLength(2)
        expect(pairs[0].credit.document_id).toBe('C45485340')
        expect(pairs[0].invoice.document_id).toBe('45480809')
    })

    it('leaves a credit whose invoice is outside the paste alone', () => {
        const outside = readPortalList(line('C77', '11111111', '2026-09-20', 'Credit', '-€5.00'))
        const result = pairCredits(outside.rows)
        expect(result.pairs).toEqual([])
        expect(result.loose.map(r => r.document_id)).toEqual(['C77'])
    })

    it('leaves the invoices out of it', () => {
        expect(loose).toEqual([])
    })
})

describe('how long a credit took', () => {
    // Every credit over the real month came the same day or the next one and
    // none came later, which is what makes uploading a week at a time work: the
    // credits are already in the batch. A run of long waits would mean that had
    // stopped being true.
    it('counts the days between the two documents', () => {
        const { rows } = readPortalList(PASTE)
        const { pairs } = pairCredits(rows)
        expect(creditDelays(pairs).map(d => d.days)).toEqual([0, 1])
    })
})

describe('what was typed in by hand', () => {
    // Eight months of invoices were entered off a total with no number, so the
    // first version of the page called every one of them not downloaded.
    const { rows } = readPortalList(PASTE)

    it('finds an invoice typed in at its printed total', () => {
        const held = [{ id: 'h1', invoice_number: null, invoice_date: '2026-08-23', total_amount: 163.03 }]
        const status = compareDocuments(rows, held).status
        expect(status.get('45448455')).toMatchObject({ status: 'by_hand', invoice: { id: 'h1' } })
    })

    // A total typed by hand is usually net: the shortage was taken off before
    // it was typed. 325.95 less the 74.26 credited is 251.69.
    it('finds one typed in net of its credit, and says the credit was taken off by hand', () => {
        const held = [{ id: 'h2', invoice_number: null, invoice_date: '2026-08-27', total_amount: 251.69 }]
        const status = compareDocuments(rows, held).status
        expect(status.get('45480809')).toMatchObject({ status: 'by_hand', net: true })
        expect(status.get('C45485340')).toMatchObject({ status: 'in_hand_total', invoice: { id: 'h2' } })
    })

    // A typing slip and a different delivery look the same from here, so the
    // pairing is made and the difference said, rather than either hidden.
    it('pairs what is left on the day and says how far apart the totals are', () => {
        const held = [{ id: 'h3', invoice_number: null, invoice_date: '2026-08-23', total_amount: 160 }]
        const status = compareDocuments(rows, held).status
        expect(status.get('45448455')).toMatchObject({ status: 'by_hand', differs: -3.03 })
    })

    it('never uses one typed total for two invoices', () => {
        const held = [{ id: 'h4', invoice_number: null, invoice_date: '2026-09-14', total_amount: 102.43 }]
        const status = compareDocuments(rows, held).status
        const typed = ['45612214', '45612570'].filter(id => status.get(id).status === 'by_hand')
        expect(typed).toEqual(['45612214'])
        expect(status.get('45612570').status).toBe('missing')
    })

    it('leaves something from another day alone', () => {
        const held = [{ id: 'h5', invoice_number: null, invoice_date: '2026-08-24', total_amount: 163.03 }]
        expect(compareDocuments(rows, held).status.get('45448455').status).toBe('missing')
    })

    it('lists them apart from what is actually missing', () => {
        const held = [{ id: 'h1', invoice_number: null, invoice_date: '2026-08-23', total_amount: 163.03 }]
        const { byHand, missing } = compareDocuments(rows, held)
        expect(byHand.map(r => r.document_id)).toEqual(['45448455'])
        expect(missing.map(r => r.document_id)).not.toContain('45448455')
    })
})

describe('what is still to download', () => {
    // Rows as they come back from supplier_documents: the value as a string,
    // the way a numeric column arrives, and one supplier or another.
    const recorded = [
        { supplier_id: 's1', document_id: '45448455', order_reference: null, document_date: '2026-08-23', document_type: 'invoice', value: '163.03' },
        { supplier_id: 's1', document_id: '45480809', order_reference: null, document_date: '2026-08-27', document_type: 'invoice', value: '325.95' },
        { supplier_id: 's1', document_id: 'C45485340', order_reference: '45480809', document_date: '2026-08-27', document_type: 'credit', value: '-74.26' },
        { supplier_id: 's1', document_id: '45612214', order_reference: null, document_date: '2026-09-14', document_type: 'invoice', value: '102.43' },
        { supplier_id: 's2', document_id: 'X1', order_reference: null, document_date: '2026-09-01', document_type: 'invoice', value: '40.00' },
    ]

    const held = [
        // Imported, by its number.
        { id: 'a', supplier_id: 's1', invoice_number: '45448455', invoice_date: '2026-08-23', total_amount: 163.03 },
        // Typed in by hand net of its credit, so the credit is not missing
        // either.
        { id: 'b', supplier_id: 's1', invoice_number: null, invoice_date: '2026-08-27', total_amount: 251.69 },
    ]

    it('lists only what is nowhere in the Hub, oldest first', () => {
        expect(stillMissing(recorded, held).map(r => r.document_id)).toEqual(['X1', '45612214'])
    })

    // A list belongs to one supplier, and another supplier's invoice on the
    // same day for the same money is a different document.
    it('never lets one supplier stand in for another', () => {
        const other = [{ id: 'c', supplier_id: 's2', invoice_number: null, invoice_date: '2026-09-14', total_amount: 102.43 }]
        expect(stillMissing(recorded, [...held, ...other]).map(r => r.document_id)).toContain('45612214')
    })

    it('is empty when everything is accounted for', () => {
        const all = [...held,
            { id: 'd', supplier_id: 's1', invoice_number: '45612214' },
            { id: 'e', supplier_id: 's2', invoice_number: 'X1' }]
        expect(stillMissing(recorded, all)).toEqual([])
    })

    it('copes with nothing recorded', () => {
        expect(stillMissing(null, held)).toEqual([])
    })
})
