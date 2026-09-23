import { describe, it, expect } from 'vitest'
import {
    rowsOf, cellsOf, findHeading, columnsFrom, bucket, readPackSize,
    looksLikePackSize, paperDate, money, headField, recognisesSysco,
    readSyscoInvoice, LINE_COLUMNS,
} from '@/lib/invoiceSysco'

// A document built to the shape of a real one, with everything that identifies
// the company taken out.
//
// **No real invoice goes in the repository.** One carries the company address,
// the VAT number and the account number, and a fixture is not the place for
// any of them. The account number here is invented and the document numbers,
// dates, pack sizes and totals are the real ones, because the arithmetic is
// what is being pinned: the values add up to the goods total and the case
// counts add up to the header count, which are the two checks the import
// refuses without.
//
// Items are placed rather than written out as text, because a PDF has no rows
// and no columns and the whole reader is built on that.

const CHAR = 5.2

function at(x, text, y, page = 1) {
    return { page, str: text, x, y, width: String(text).length * CHAR, height: 8 }
}

// Figures are printed right aligned against the end of their column, which is
// what puts them under a heading that starts further left.
function rightAt(edge, text, y, page = 1) {
    const width = String(text).length * CHAR
    return { page, str: text, x: edge - width, y, width, height: 8 }
}

const COL = { code: 40, description: 90, pack: 250, cases: 350, units: 390, price: 446, value: 525 }

function headingRow(y, page = 1) {
    return [
        at(COL.code, 'CODE', y, page),
        at(COL.description, 'DESCRIPTION', y, page),
        at(COL.pack, 'PACK SIZE', y, page),
        at(330, 'CASE', y, page),
        at(370, 'UNIT', y, page),
        at(420, 'PRICE', y, page),
        at(480, 'VALUE', y, page),
    ]
}

function lineRow(y, { code, description, pack, cases, units, price, value }, page = 1) {
    return [
        at(COL.code, code, y, page),
        at(COL.description, description, y, page),
        ...(pack ? [at(COL.pack, pack, y, page)] : []),
        rightAt(COL.cases, cases, y, page),
        rightAt(COL.units, units, y, page),
        rightAt(COL.price, price, y, page),
        rightAt(COL.value, value, y, page),
    ]
}

// The block at the top: a row of titles and a row of values under it.
function topBlock({ number, date, account, type, order, cases, total }) {
    const spots = [
        [40, 'INV. No.', number],
        [110, 'INV. DATE', date],
        [190, 'ACCT No.', account],
        [260, 'TYPE', type],
        [320, 'ORD No.', order],
        [390, 'CASE', cases],
        [440, 'GOODS TOTAL', total],
    ]
    return [
        ...spots.map(([x, label]) => at(x, label, 100)),
        ...spots.map(([x, , value]) => at(x, value, 112)),
    ]
}

// Invoice 45448455: four lines, six cases, 163.03.
const INVOICE = [
    ...topBlock({
        number: '45448455',
        date: '23/08/2026',
        account: '9900001',
        type: 'Invoice',
        order: 'N/A',
        cases: '6',
        total: '163.03',
    }),
    ...headingRow(200),
    at(COL.description, 'AMBIENT', 214),
    ...lineRow(228, {
        code: '497870', description: 'FLOUR TORTILLA 12IN', pack: '4X2.5 KG',
        cases: '2', units: '0', price: '30.30', value: '60.60',
    }),
    ...lineRow(240, {
        code: '512004', description: 'RICE LONG GRAIN', pack: '1X10 KG',
        cases: '1', units: '0', price: '18.45', value: '18.45',
    }),
    at(COL.description, 'CHILLED', 254),
    ...lineRow(268, {
        code: '330112', description: 'CHICKEN BREAST DICED', pack: '2X5 KG',
        cases: '2', units: '0', price: '34.99', value: '69.98',
    }),
    at(COL.description, 'FROZEN', 282),
    ...lineRow(296, {
        code: '448921', description: 'FRIES 7MM', pack: '4X2.5 KG',
        cases: '1', units: '0', price: '14.00', value: '14.00',
    }),
    at(400, 'GOODS TOTAL', 320),
    rightAt(COL.value, '163.03', 320),
]

// Credit note C45485340, against invoice 45480809. One line, minus two cases.
const CREDIT = [
    ...topBlock({
        number: 'C45485340',
        date: '27/08/2026',
        account: '9900001',
        type: 'Credit',
        order: '45480809',
        cases: '-2',
        total: '-74.26',
    }),
    ...headingRow(200),
    ...lineRow(214, {
        code: '330112', description: 'CHICKEN BREAST DICED', pack: '2X5 KG',
        cases: '-2', units: '0', price: '37.13', value: '-74.26',
    }),
]

describe('putting a page back into rows', () => {
    it('groups whatever sits on the same baseline', () => {
        const rows = rowsOf([at(90, 'b', 100), at(40, 'a', 100), at(40, 'c', 120)])
        expect(rows).toHaveLength(2)
        expect(rows[0].items.map(i => i.str)).toEqual(['a', 'b'])
    })

    it('does not run two pages together', () => {
        const rows = rowsOf([at(40, 'a', 100, 1), at(40, 'b', 100, 2)])
        expect(rows).toHaveLength(2)
    })
})

describe('joining lettering that is touching', () => {
    it('makes one cell of a run broken into pieces', () => {
        const row = rowsOf([at(40, 'FLOUR', 100), at(40 + 5 * CHAR + 2, 'TORTILLA', 100)])[0]
        expect(cellsOf(row).map(c => c.text)).toEqual(['FLOUR TORTILLA'])
    })

    it('leaves a column gutter alone', () => {
        const row = rowsOf([at(40, 'a', 100), at(200, 'b', 100)])[0]
        expect(cellsOf(row)).toHaveLength(2)
    })
})

describe('finding a heading', () => {
    it('reads one written in two pieces', () => {
        const row = rowsOf([at(40, 'PACK', 100), at(200, 'SIZE', 100)])[0]
        const spot = findHeading(cellsOf(row), 'PACK SIZE')
        expect(spot).not.toBeNull()
        expect(spot.endIndex).toBe(1)
    })

    it('says nothing when it is not there', () => {
        const row = rowsOf([at(40, 'CODE', 100)])[0]
        expect(findHeading(cellsOf(row), 'PACK SIZE')).toBeNull()
    })
})

describe('the columns', () => {
    const cells = cellsOf(rowsOf(headingRow(200))[0])
    const columns = columnsFrom(cells)

    it('comes off the headings, in order', () => {
        expect(columns.map(c => c.name)).toEqual(LINE_COLUMNS)
    })

    it('runs to the edges at both ends', () => {
        expect(columns[0].from).toBe(-Infinity)
        expect(columns[columns.length - 1].to).toBe(Infinity)
    })

    it('is nothing at all when a heading is missing', () => {
        const short = cellsOf(rowsOf([at(40, 'CODE', 200), at(90, 'DESCRIPTION', 200)])[0])
        expect(columnsFrom(short)).toBeNull()
    })

    // Figures are right aligned and headings are left aligned, so a value sits
    // well to the right of the word above it. Bucketing on the middle of a cell
    // is what makes that land in the right place.
    it('puts a right aligned figure under its own heading', () => {
        const row = rowsOf(lineRow(228, {
            code: '497870', description: 'FLOUR TORTILLA', pack: '4X2.5 KG',
            cases: '2', units: '0', price: '30.30', value: '60.60',
        }))[0]
        const held = bucket(cellsOf(row), columns)
        expect(held.CODE.map(c => c.text)).toEqual(['497870'])
        expect(held.CASE.map(c => c.text)).toEqual(['2'])
        expect(held.PRICE.map(c => c.text)).toEqual(['30.30'])
        expect(held.VALUE.map(c => c.text)).toEqual(['60.60'])
    })
})

describe('pack sizes', () => {
    it.each([
        ['4X2.5 KG', { count: 4, size: 2.5, unit: 'KG', total: 10 }],
        ['1X10 KG', { count: 1, size: 10, unit: 'KG', total: 10 }],
        ['6X1 LTR', { count: 6, size: 1, unit: 'Litre', total: 6 }],
        ['2X6X330ML', { count: 12, size: 0.33, unit: 'Litre', total: 3.96 }],
        ['500G', { count: 1, size: 0.5, unit: 'KG', total: 0.5 }],
    ])('reads %s', (text, expected) => {
        expect(readPackSize(text)).toEqual({ ...expected, printed: text })
    })

    // Both numbers come back because the invoice cannot say which one belongs
    // in units_per_case: ten is right for something counted in kilos and four
    // is right for something counted in bags.
    it('keeps the count and the total apart', () => {
        const pack = readPackSize('4X2.5 KG')
        expect(pack.count).toBe(4)
        expect(pack.total).toBe(10)
    })

    it('treats a bare number as a count with no unit', () => {
        expect(readPackSize('24')).toEqual({
            count: 24, size: null, unit: null, total: 24, printed: '24',
        })
    })

    it.each(['EACH', '', 'FLOUR TORTILLA'])('says nothing for %s', text => {
        expect(readPackSize(text)).toBeNull()
    })

    it('can tell a pack size from a product name', () => {
        expect(looksLikePackSize('4X2.5 KG')).toBe(true)
        expect(looksLikePackSize('FLOUR TORTILLA 12IN')).toBe(false)
    })
})

describe('dates and money on the paper', () => {
    it('reads the day first date the PDF uses', () => {
        expect(paperDate('23/08/2026')).toBe('2026-08-23')
    })

    // The portal writes the same date the other way round, which is why the two
    // do not share a reader.
    it('refuses the format the portal uses', () => {
        expect(paperDate('2026-08-23')).toBeNull()
    })

    it.each([['163.03', 163.03], ['-74.26', -74.26], ['1,234.56', 1234.56], ['0.00', 0]])(
        'reads %s', (text, value) => expect(money(text)).toBe(value),
    )

    it('says nothing for N/A', () => {
        expect(money('N/A')).toBeNull()
    })
})

describe('the block at the top', () => {
    const rows = rowsOf(INVOICE)

    // Printed as a little table, titles on one line and values under them, so
    // looking beside a title first would find the next title along.
    it('takes the value from under the title', () => {
        expect(headField(rows, 'INV. No.')).toBe('45448455')
        expect(headField(rows, 'ACCT No.')).toBe('9900001')
    })

    // CASE is a title in both the block at the top and the table below it, and
    // they mean different things.
    it('stops above the line table so the two CASE columns cannot be confused', () => {
        expect(headField(rows, 'CASE', 200)).toBe('6')
    })
})

describe('reading a whole invoice', () => {
    const read = readSyscoInvoice(INVOICE)

    it('knows it is one of theirs', () => {
        expect(recognisesSysco(INVOICE)).toBe(true)
        expect(recognisesSysco([at(40, 'Some other paperwork', 100)])).toBe(false)
    })

    it('reads the header', () => {
        expect(read.kind).toBe('invoice')
        expect(read.number).toBe('45448455')
        expect(read.date).toBe('2026-08-23')
        expect(read.accountNo).toBe('9900001')
        expect(read.headCases).toBe(6)
        expect(read.goodsTotal).toBe(163.03)
    })

    it('reads N/A as no order reference rather than as one', () => {
        expect(read.orderReference).toBeNull()
    })

    it('reads every line', () => {
        expect(read.lines).toHaveLength(4)
        expect(read.lines.map(l => l.code)).toEqual(['497870', '512004', '330112', '448921'])
        expect(read.lines.map(l => l.line_no)).toEqual([1, 2, 3, 4])
    })

    it('reads a line whole', () => {
        expect(read.lines[0]).toMatchObject({
            code: '497870',
            description: 'FLOUR TORTILLA 12IN',
            pack_size: '4X2.5 KG',
            cases: 2,
            units: 0,
            price_per_case: 30.3,
            value: 60.6,
            storage: 'ambient',
        })
    })

    // The band a line sits under is free and it is worth keeping: a line that
    // turns out to be a product nobody has entered already says where it goes.
    it('carries the band down the lines under it', () => {
        expect(read.lines.map(l => l.storage))
            .toEqual(['ambient', 'ambient', 'chilled', 'frozen'])
    })

    it('does not read a band as a line', () => {
        expect(read.lines.some(l => l.description.includes('AMBIENT'))).toBe(false)
    })

    // The two checks, which are the whole reason this can be trusted without
    // anybody reading the paper beside the screen.
    it('adds the values up to the goods total', () => {
        expect(read.checks.values).toEqual({ expected: 163.03, got: 163.03, ok: true })
    })

    it('adds the case counts up to the header count', () => {
        expect(read.checks.cases).toEqual({ expected: 6, got: 6, ok: true })
    })

    it('has nothing to complain about', () => {
        expect(read.checks.ok).toBe(true)
        expect(read.problems).toEqual([])
    })
})

describe('reading a credit note', () => {
    const read = readSyscoInvoice(CREDIT)

    // The same reader. The layout is identical and the only difference is that
    // everything is negative, so a second flow would be two ways to be wrong.
    it('is the same reader and knows which kind it is', () => {
        expect(read.kind).toBe('credit')
        expect(read.number).toBe('C45485340')
    })

    // The exact key that pairs a credit to its invoice. Invoices carry no order
    // reference and credits carry the invoice.
    it('keeps the invoice it credits', () => {
        expect(read.orderReference).toBe('45480809')
    })

    it('is negative all the way down', () => {
        expect(read.goodsTotal).toBe(-74.26)
        expect(read.headCases).toBe(-2)
        expect(read.lines[0].cases).toBe(-2)
        expect(read.lines[0].value).toBe(-74.26)
    })

    it('passes both checks with the signs on', () => {
        expect(read.checks.ok).toBe(true)
    })
})

describe('when something does not add up', () => {
    // A parser that half works is worse than one that stops: half a document
    // lands in the food cost and nothing says so.
    it('fails the value check and says both figures', () => {
        const wrong = INVOICE.map(i => (
            i.str === '163.03' && i.y === 112 ? { ...i, str: '170.00' } : i
        ))
        const read = readSyscoInvoice(wrong)

        expect(read.checks.values).toEqual({ expected: 170, got: 163.03, ok: false })
        expect(read.checks.ok).toBe(false)
        expect(read.problems).toContainEqual(
            expect.objectContaining({ why: 'values', expected: 170, got: 163.03 }),
        )
    })

    it('fails the case check on its own', () => {
        const wrong = INVOICE.map(i => (
            i.str === '6' && i.y === 112 ? { ...i, str: '7' } : i
        ))
        const read = readSyscoInvoice(wrong)

        expect(read.checks.cases.ok).toBe(false)
        expect(read.checks.values.ok).toBe(true)
        expect(read.checks.ok).toBe(false)
    })
})

describe('the awkward parts of a real page', () => {
    // A description too long for its own line carries on underneath with
    // nothing else on the row.
    it('joins a description that ran onto a second line', () => {
        const wrapped = [
            ...INVOICE,
            at(COL.description, 'IN A BOX OF FOUR', 308),
        ]
        const read = readSyscoInvoice(wrapped)
        expect(read.lines[3].description).toBe('FRIES 7MM IN A BOX OF FOUR')
        expect(read.lines).toHaveLength(4)
    })

    // A long description finishing a point or two short of the pack size beside
    // it, which is closer than two words of the description are to each other.
    // Merged on the gap alone the two become one cell, the pack size stops
    // looking like a pack size, and both are lost at once.
    it('does not join a long description to the pack size beside it', () => {
        const tight = [
            ...topBlock({
                number: '45448455', date: '23/08/2026', account: '9900001',
                type: 'Invoice', order: 'N/A', cases: '1', total: '10.00',
            }),
            ...headingRow(200),
            at(COL.code, '497870', 228),
            at(COL.description, 'CHICKEN BREAST DICED SKINLESS XL', 228),
            at(258, '2X5 KG', 228),
            rightAt(COL.cases, '1', 228),
            rightAt(COL.units, '0', 228),
            rightAt(COL.price, '10.00', 228),
            rightAt(COL.value, '10.00', 228),
        ]
        const read = readSyscoInvoice(tight)

        expect(read.lines[0].pack_size).toBe('2X5 KG')
        expect(read.lines[0].description).toBe('CHICKEN BREAST DICED SKINLESS XL')
        expect(read.lines[0].pack.total).toBe(10)
    })

    // Some lines print a word in the unit column rather than a figure. It is
    // not a quantity and it is not thrown away either: nothing read off the
    // paper disappears without showing up somewhere on screen.
    it('keeps a word that sits in a number column instead of a figure', () => {
        const worded = [
            ...topBlock({
                number: '45448455', date: '23/08/2026', account: '9900001',
                type: 'Invoice', order: 'N/A', cases: '1', total: '10.00',
            }),
            ...headingRow(200),
            at(COL.code, '497870', 228),
            at(COL.description, 'CHICKEN', 228),
            at(COL.pack, '2X5 KG', 228),
            rightAt(COL.cases, '1', 228),
            rightAt(COL.units, 'EA', 228),
            rightAt(COL.price, '10.00', 228),
            rightAt(COL.value, '10.00', 228),
        ]
        const read = readSyscoInvoice(worded)

        expect(read.lines[0].cases).toBe(1)
        expect(read.lines[0].units).toBe(0)
        expect(read.lines[0].description).toBe('CHICKEN EA')
    })

    it('reads a second page and keeps counting the lines', () => {
        const twoPages = [
            ...topBlock({
                number: '45448455', date: '23/08/2026', account: '9900001',
                type: 'Invoice', order: 'N/A', cases: '7', total: '183.03',
            }),
            ...headingRow(200),
            at(COL.description, 'AMBIENT', 214),
            ...lineRow(228, {
                code: '497870', description: 'FLOUR TORTILLA 12IN', pack: '4X2.5 KG',
                cases: '2', units: '0', price: '30.30', value: '60.60',
            }),
            ...lineRow(240, {
                code: '512004', description: 'RICE LONG GRAIN', pack: '1X10 KG',
                cases: '1', units: '0', price: '18.45', value: '18.45',
            }),
            ...lineRow(268, {
                code: '330112', description: 'CHICKEN BREAST DICED', pack: '2X5 KG',
                cases: '2', units: '0', price: '34.99', value: '69.98',
            }),
            ...headingRow(200, 2),
            ...lineRow(228, {
                code: '448921', description: 'FRIES 7MM', pack: '4X2.5 KG',
                cases: '1', units: '0', price: '14.00', value: '14.00',
            }, 2),
            ...lineRow(240, {
                code: '448922', description: 'ONION RINGS', pack: '4X1 KG',
                cases: '1', units: '0', price: '20.00', value: '20.00',
            }, 2),
        ]
        const read = readSyscoInvoice(twoPages)

        expect(read.pages).toBe(2)
        expect(read.lines).toHaveLength(5)
        expect(read.lines.map(l => l.line_no)).toEqual([1, 2, 3, 4, 5])
        expect(read.checks.ok).toBe(true)
    })

    it('says when the document carries an amendment box', () => {
        expect(readSyscoInvoice(INVOICE).amended).toBe(false)
        expect(readSyscoInvoice([...INVOICE, at(40, 'AMENDMENT', 340)]).amended).toBe(true)
    })

    it('is nothing at all for a file that is not one of theirs', () => {
        expect(readSyscoInvoice([at(40, 'A letter from the bank', 100)])).toBeNull()
    })
})
