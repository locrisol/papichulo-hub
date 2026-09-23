// Reading one supplier's invoices and credit notes.
//
// This is the only file in the app that knows what their paperwork looks like,
// the same rule the till's export follows in the Timesheet: when a second
// supplier's format arrives it is a second reader beside this one and no screen
// changes. Nothing above here mentions a supplier by name.
//
// **One reader for both kinds of document.** The header carries a TYPE column
// saying Invoice or Credit, the layout is identical, and a credit simply has
// negative quantities and a negative total. There is nothing to guess at and no
// second flow to keep in step.
//
// **Two free self checks, and the import refuses unless both pass.**
//
//   1. the line values add up to the GOODS TOTAL printed at the top
//   2. the line case counts add up to the CASE printed at the top
//
// Both were confirmed against real documents before a line of this was written.
// A parser that half works is worse than one that stops, because half of a
// document lands in the food cost and nothing says so. The till import already
// works this way.
//
// It is driven by the x position of each column heading rather than by fixed
// offsets. A flattened page and a regular expression is quietly wrong the first
// time a description contains a number.

import { num } from '@/lib/format'

// Two rows of eight point lettering sit about ten points apart, so anything
// within two and a bit of the same baseline is the same line.
const ROW_TOLERANCE = 2.2

// A space at this size is a shade over two points. Three merges the words of a
// description into one cell and leaves a column gutter, which is several points
// wide on every document seen, well alone.
const CELL_GAP = 3

// The columns of the line table, in the order they are printed.
export const LINE_COLUMNS = ['CODE', 'DESCRIPTION', 'PACK SIZE', 'CASE', 'UNIT', 'PRICE', 'VALUE']

// The bands the lines are grouped under, which are worth keeping: a line that
// turns out to be a product nobody has entered yet already says where it lives.
const BANDS = { AMBIENT: 'ambient', CHILLED: 'chilled', FROZEN: 'frozen' }

const tidy = text => String(text ?? '').replace(/\s+/g, ' ').trim()
const shout = text => tidy(text).toUpperCase()

// ---------------------------------------------------------------------------
// Turning positions back into rows and columns
// ---------------------------------------------------------------------------

// Everything on one baseline, left to right, page by page.
export function rowsOf(items, tolerance = ROW_TOLERANCE) {
    const sorted = [...(items || [])].sort((a, b) => (a.page - b.page) || (a.y - b.y) || (a.x - b.x))
    const rows = []

    for (const item of sorted) {
        const last = rows[rows.length - 1]
        if (last && last.page === item.page && Math.abs(last.y - item.y) <= tolerance) {
            last.items.push(item)
            continue
        }
        rows.push({ page: item.page, y: item.y, items: [item] })
    }

    for (const row of rows) row.items.sort((a, b) => a.x - b.x)
    return rows
}

// Lettering that is touching is one thing.
//
// A PDF hands back a text run at a time, and where that run begins and ends is
// up to whatever wrote the file: a description can arrive whole, or as four
// items with a space between each. Merging on the gap makes both the same
// before anything tries to read them.
//
// **Never across a column boundary.** A long description can finish a couple of
// points short of the pack size beside it, which is closer than two words of
// the description are to each other, and merging the two would lose both: the
// pack size stops looking like one and the description carries it around on the
// end. Once the columns are known they are the thing that decides, and the gap
// only decides inside one of them.
export function cellsOf(row, columns = null) {
    const columnAt = x => (columns ? columns.find(c => x > c.from && x <= c.to) : null)
    const cells = []

    for (const item of row?.items || []) {
        const last = cells[cells.length - 1]
        const near = last && item.x - (last.x + last.width) <= CELL_GAP
        const together = !columns
            || columnAt(item.x + item.width / 2) === columnAt(last ? last.x + last.width / 2 : 0)

        if (near && together) {
            // A real space between two runs, or two halves of one word. The
            // gap says which.
            const joiner = item.x - (last.x + last.width) > 0.6 ? ' ' : ''
            last.text = `${last.text}${joiner}${item.str}`
            last.width = (item.x + item.width) - last.x
            continue
        }
        cells.push({ text: item.str, x: item.x, width: item.width })
    }
    return cells.map(c => ({ ...c, text: tidy(c.text), right: c.x + c.width, mid: c.x + c.width / 2 }))
}

// Where a heading sits, allowing for it having been written in pieces.
//
// "PACK SIZE" can arrive as one cell or as two, and which it is depends on the
// file rather than on the supplier, so both have to work.
export function findHeading(cells, name, from = 0) {
    const wanted = shout(name)
    for (let i = from; i < cells.length; i++) {
        let joined = ''
        for (let j = i; j < Math.min(cells.length, i + 3); j++) {
            joined = joined ? `${joined} ${shout(cells[j].text)}` : shout(cells[j].text)
            if (joined === wanted) {
                return { left: cells[i].x, right: cells[j].right, endIndex: j }
            }
            if (!wanted.startsWith(joined)) break
        }
    }
    return null
}

// The spans each column owns, from where its heading is printed.
//
// The boundary between two columns is halfway across the gutter between their
// headings, and the first and last run off to the edges of the page. A cell
// belongs to whichever span its middle falls in.
export function columnsFrom(cells, names = LINE_COLUMNS) {
    const spots = []
    let at = 0
    for (const name of names) {
        const spot = findHeading(cells, name, at)
        if (!spot) return null
        spots.push({ name, ...spot })
        at = spot.endIndex + 1
    }

    return spots.map((spot, i) => ({
        name: spot.name,
        from: i === 0 ? -Infinity : (spots[i - 1].right + spot.left) / 2,
        to: i === spots.length - 1 ? Infinity : (spot.right + spots[i + 1].left) / 2,
    }))
}

export function bucket(cells, columns) {
    const out = {}
    for (const column of columns) out[column.name] = []
    for (const cell of cells) {
        const column = columns.find(c => cell.mid > c.from && cell.mid <= c.to)
        if (column) out[column.name].push(cell)
    }
    return out
}

// ---------------------------------------------------------------------------
// Pack sizes
// ---------------------------------------------------------------------------

// KG, Litre and Units are what a product can be counted in, so everything a
// supplier prints is brought back to one of those three.
const UNIT_WORDS = {
    KG: { unit: 'KG', factor: 1 },
    KGS: { unit: 'KG', factor: 1 },
    G: { unit: 'KG', factor: 0.001 },
    GR: { unit: 'KG', factor: 0.001 },
    GRM: { unit: 'KG', factor: 0.001 },
    L: { unit: 'Litre', factor: 1 },
    LT: { unit: 'Litre', factor: 1 },
    LTR: { unit: 'Litre', factor: 1 },
    LTRS: { unit: 'Litre', factor: 1 },
    ML: { unit: 'Litre', factor: 0.001 },
    CL: { unit: 'Litre', factor: 0.01 },
}

// "4X2.5 KG" is four packs of two and a half kilos.
//
// **What goes in units_per_case depends on the product and not on the pack**,
// which is why both numbers come back rather than one. Ten is right for
// something counted in kilos and four is right for something counted in bags,
// and the invoice cannot tell which. The review screen decides, with the pack
// size printed beside it exactly as it appears on the paper.
export function readPackSize(text) {
    const said = shout(text).replace(/,/g, '')
    if (!said) return null

    const m = /^([\dX. ]+?)\s*([A-Z]*)$/.exec(said)
    if (!m) return null

    const numbers = m[1].split(/X/).map(p => p.trim()).filter(Boolean).map(Number)
    if (!numbers.length || numbers.some(n => Number.isNaN(n) || n <= 0)) return null

    const word = UNIT_WORDS[m[2]]
    if (!word) {
        // No unit at all: "24", or "6X4". Everything is a count.
        if (m[2]) return null
        const count = numbers.reduce((t, n) => t * n, 1)
        return { count, size: null, unit: null, total: count, printed: tidy(text) }
    }

    // The last number carries the unit and everything before it multiplies up.
    const size = numbers[numbers.length - 1] * word.factor
    const count = numbers.slice(0, -1).reduce((t, n) => t * n, 1)
    return {
        count,
        size,
        unit: word.unit,
        total: Math.round(count * size * 10000) / 10000,
        printed: tidy(text),
    }
}

// Does this look like a pack size at all?
//
// A description long enough to run past its own column would otherwise be taken
// as one, and a pack size read off the end of a product name is the kind of
// wrong that survives a review because it looks filled in.
export function looksLikePackSize(text) {
    const said = shout(text)
    if (!said) return false
    return /^[\d.]+(\s*X\s*[\d.]+)*\s*[A-Z]{0,4}$/.test(said)
}

// ---------------------------------------------------------------------------
// Reading a document
// ---------------------------------------------------------------------------

// "23/08/2026", day first. The portal writes the same date as 2026-08-23, which
// is why there is no shared date reader between the two of them.
export function paperDate(text) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(tidy(text))
    if (!m) return null
    const day = Number(m[1])
    const month = Number(m[2])
    if (day < 1 || day > 31 || month < 1 || month > 12) return null
    return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// A figure, and only a figure.
//
// Strict on purpose. Stripping everything that is not a digit and reading what
// is left would turn "N/A" into nothing, which is fine, and "SKINLESS 1" into
// one, which is not: a word that strayed into a number's column would be read
// as a quantity and the description would lose it at the same time. Anything
// that is not a number all the way through is not a number.
export function money(text) {
    const said = tidy(text).replace(/[,\s€£]/g, '')
    if (!said) return null

    const bracketed = /^\((\d+(?:\.\d+)?)\)$/.exec(said)
    if (bracketed) return -Number(bracketed[1])

    const m = /^([-+]?)(\d+(?:\.\d+)?)$/.exec(said)
    if (!m) return null
    return m[1] === '-' ? -Number(m[2]) : Number(m[2])
}

// A label at the top of the page and the value that belongs to it.
//
// Underneath first, then beside, because the top block is printed as a little
// table with the titles on one line and the values on the next. Looking beside
// first would find the next title along.
export function headField(rows, label, before = Infinity) {
    const wanted = shout(label)

    for (let i = 0; i < rows.length; i++) {
        // The first page, above the line table. The table has a CASE heading of
        // its own and the block at the top has one too, and they mean different
        // things.
        if (rows[i].page !== 1 || rows[i].y >= before) continue

        const cells = cellsOf(rows[i])
        const spot = findHeading(cells, label)
        if (!spot) continue

        const under = rows[i + 1] && rows[i + 1].page === rows[i].page
            ? cellsOf(rows[i + 1]).find(c => c.right > spot.left && c.x < spot.right)
            : null
        if (under && shout(under.text) !== wanted) return under.text

        const beside = cells[spot.endIndex + 1]
        if (beside) return beside.text
    }
    return null
}

// Is this one of theirs?
//
// The line table's own heading row is the test, because it is the part of the
// document this reader actually depends on. A file that has it can be read; a
// file that does not is somebody else's paperwork and belongs to another reader.
export function recognisesSysco(items) {
    return headingRows(rowsOf(items)).length > 0
}

function headingRows(rows) {
    const out = []
    for (const row of rows) {
        const columns = columnsFrom(cellsOf(row))
        if (columns) out.push({ row, columns })
    }
    return out
}

export function readSyscoInvoice(items) {
    const rows = rowsOf(items)
    const heads = headingRows(rows)
    if (!heads.length) return null

    const firstTable = heads[0].row
    const problems = []

    // ---- the block at the top of the page --------------------------------
    const number = tidy(headField(rows, 'INV. No.', firstTable.y))
    const date = paperDate(headField(rows, 'INV. DATE', firstTable.y))
    const accountNo = tidy(headField(rows, 'ACCT No.', firstTable.y))
    const typeSaid = shout(headField(rows, 'TYPE', firstTable.y))
    const orderSaid = tidy(headField(rows, 'ORD No.', firstTable.y))
    const headCases = money(headField(rows, 'CASE', firstTable.y))
    const goodsTotal = money(headField(rows, 'GOODS TOTAL', firstTable.y))
        ?? money(footerTotal(rows))

    const kind = typeSaid.startsWith('CREDIT') ? 'credit' : 'invoice'

    // ---- the lines -------------------------------------------------------
    const lines = []
    let storage = null
    let columns = heads[0].columns
    let inTable = false

    for (const row of rows) {
        const table = heads.find(h => h.row === row)
        if (table) { columns = table.columns; inTable = true; continue }
        if (!inTable) continue

        const cells = cellsOf(row, columns)
        if (!cells.length) continue

        const said = shout(cells.map(c => c.text).join(' '))
        const band = Object.keys(BANDS).find(b => said === b || said.startsWith(`${b} `))
        if (band) { storage = BANDS[band]; continue }
        // The foot of the table. Everything after it on the page is totals and
        // small print, and a line cannot appear below it.
        if (said.startsWith('GOODS TOTAL')) { inTable = false; continue }

        const line = readLine(cells, columns, storage)
        if (line) { lines.push({ ...line, line_no: lines.length + 1 }); continue }

        // A description too long for its own line carries on underneath with
        // nothing else on the row.
        const carried = carriedDescription(cells, columns)
        if (carried && lines.length) {
            const last = lines[lines.length - 1]
            last.description = tidy(`${last.description} ${carried}`)
        }
    }

    // ---- the two checks --------------------------------------------------
    const valuesGot = round2(lines.reduce((t, l) => t + num(l.value), 0))
    const casesGot = round2(lines.reduce((t, l) => t + num(l.cases), 0))

    const checks = {
        values: { expected: goodsTotal, got: valuesGot, ok: goodsTotal != null && round2(goodsTotal) === valuesGot },
        cases: { expected: headCases, got: casesGot, ok: headCases != null && round2(headCases) === casesGot },
    }
    checks.ok = checks.values.ok && checks.cases.ok

    if (!number) problems.push({ why: 'no_number' })
    if (!date) problems.push({ why: 'no_date' })
    if (!accountNo) problems.push({ why: 'no_account' })
    if (!lines.length) problems.push({ why: 'no_lines' })
    if (!checks.values.ok) problems.push({ why: 'values', ...checks.values })
    if (!checks.cases.ok) problems.push({ why: 'cases', ...checks.cases })

    return {
        format: 'sysco',
        kind,
        number: number || null,
        date,
        accountNo: accountNo || null,
        // On a credit this is the invoice being credited, which is the exact key
        // that pairs the two. An invoice prints N/A here and means it.
        orderReference: orderSaid && shout(orderSaid) !== 'N/A' ? orderSaid : null,
        headCases,
        goodsTotal,
        // The supplier prints a box on an amended order. It is worth saying on
        // screen and it is not worth trying to read.
        amended: rows.some(r => shout(cellsOf(r).map(c => c.text).join(' ')).includes('AMENDMENT')),
        pages: Math.max(...rows.map(r => r.page), 0),
        lines,
        checks,
        problems,
    }
}

function round2(n) {
    return Math.round(num(n) * 100) / 100
}

function footerTotal(rows) {
    for (let i = rows.length - 1; i >= 0; i--) {
        const cells = cellsOf(rows[i])
        const spot = findHeading(cells, 'GOODS TOTAL')
        if (!spot) continue
        const after = cells.slice(spot.endIndex + 1).map(c => c.text).find(t => money(t) != null)
        if (after) return after
    }
    return null
}

// One row of the table, or nothing if it is not a line at all.
//
// A code and a value together is the test. Either on its own turns up on rows
// that are not lines: a page footer carries figures, and the small print at the
// bottom carries words that could pass for a code.
function readLine(cells, columns, storage) {
    const held = bucket(cells, columns)
    const code = tidy((held.CODE || []).map(c => c.text).join(''))
    if (!/^[A-Z0-9][A-Z0-9-]{2,}$/i.test(code)) return null

    const value = money((held.VALUE || []).map(c => c.text).join(''))
    if (value == null) return null

    // Anything that is not a number sitting in a number's column ran over from
    // the description, so it goes back where it came from.
    const spilt = []
    const numberIn = name => {
        const kept = []
        for (const cell of held[name] || []) {
            const n = money(cell.text)
            if (n == null) spilt.push(cell)
            else kept.push(n)
        }
        return kept.length ? kept[kept.length - 1] : null
    }

    const cases = numberIn('CASE')
    const units = numberIn('UNIT')
    const pricePerCase = numberIn('PRICE')

    // The pack size column, which is the one place a long description can do
    // real damage: a product name read as a pack size looks filled in and
    // survives a review. Whatever does not look like a pack size goes back to
    // the description it came from.
    //
    // The whole column first, in case the size and its unit arrived as two
    // pieces, then cell by cell, so a description running over the boundary
    // does not take a perfectly good pack size with it.
    const packCells = held['PACK SIZE'] || []
    const together = tidy(packCells.map(c => c.text).join(' '))
    let packSaid = together
    if (!looksLikePackSize(together)) {
        const good = packCells.filter(c => looksLikePackSize(c.text))
        packSaid = good.length ? tidy(good.map(c => c.text).join(' ')) : null
        spilt.push(...packCells.filter(c => !looksLikePackSize(c.text)))
    }

    const description = tidy([
        ...(held.DESCRIPTION || []).map(c => c.text),
        ...spilt.sort((a, b) => a.x - b.x).map(c => c.text),
    ].join(' '))

    const pack = packSaid ? readPackSize(packSaid) : null

    return {
        code,
        description,
        pack_size: packSaid,
        pack,
        cases: cases ?? 0,
        units: units ?? 0,
        price_per_case: pricePerCase,
        value,
        storage,
    }
}

// The second line of a description, which has nothing else on the row.
function carriedDescription(cells, columns) {
    const held = bucket(cells, columns)
    const hasFigures = ['CASE', 'UNIT', 'PRICE', 'VALUE']
        .some(name => (held[name] || []).some(c => money(c.text) != null))
    if (hasFigures) return null
    if ((held.CODE || []).length) return null

    const said = tidy((held.DESCRIPTION || []).map(c => c.text).join(' '))
    return said || null
}
