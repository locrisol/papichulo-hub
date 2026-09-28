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
//   1. the line values, plus any container deposit, add up to the GOODS TOTAL
//      printed at the foot
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
//
// **What a real page does that a made up one did not.** The first version was
// written against a document built to the shape of theirs, and it refused the
// first real invoice it was given. Three things about the real page, all of
// them now pinned by a test built from its actual coordinates:
//
//   - The column headings are on three baselines, not one. QUANTITY and VAT sit
//     above the rest, and CASE, UNIT and the second half of VAT CODE sit below.
//   - A description that wraps is centred on its line, so half of it is above
//     the code and half below, on rows that carry nothing else.
//   - There are two more columns, WEIGHT and VAT CODE, and the VAT code sits
//     close enough to the value to be read as part of it.

import { num } from '@/lib/format'

// Two rows of eight point lettering sit about ten points apart, so anything
// within two and a bit of the same baseline is the same line.
const ROW_TOLERANCE = 2.2

// A space at this size is a shade over two points. Three merges the words of a
// description into one cell and leaves a column gutter, which is several points
// wide on every document seen, well alone.
const CELL_GAP = 3

// How far above and below the row that says DESCRIPTION the rest of the column
// headings can sit. On the real page QUANTITY is five points above it and CASE
// and UNIT four and a half below.
const HEAD_BAND = 10

// How far from its line a wrapped piece of description can be and still belong
// to it. The real page puts the two halves of a wrapped description four and a
// half points either side of the line, and lines are about forty points apart,
// so twelve is generous one way and nowhere near the next line the other.
const WRAP_REACH = 12

// The columns of the line table, left to right. The first seven have to be
// there or it is not a table this reader understands.
export const LINE_COLUMNS = ['CODE', 'DESCRIPTION', 'PACK SIZE', 'CASE', 'UNIT', 'PRICE', 'VALUE']

// The bands the lines are grouped under, which are worth keeping: a line that
// turns out to be a product nobody has entered yet already says where it lives.
//
// NON FOOD is a band and not a place anything is kept, so a line under it has
// no storage rather than the storage of the band before it. Baking parchment
// was filed as frozen until it was in here.
const BANDS = { AMBIENT: 'ambient', CHILLED: 'chilled', FROZEN: 'frozen', 'NON FOOD': null }

// A band carried over a page break is printed again with "continued..." on the
// end, and it is the same band.
function bandOf(said) {
    const name = said.replace(/\s+CONTINUED\W*$/, '')
    return Object.hasOwn(BANDS, name) ? name : null
}

// The box of totals printed over the foot of the table on an invoice with
// drinks under the deposit return scheme: the goods before the deposit, then the
// containers and what they cost.
//
// **It is drawn on top of the lines, not under them.** On a full page its words
// sit between the last few lines, and the first time that happened they were
// read as the second halves of two descriptions, and the FROZEN band above the
// last line was missed because it shares a baseline with one of the box's own
// rows. So the box is found by its labels and lifted off the page before
// anything else is read.
const BOX_LABELS = [
    /^SUBTOTAL GOODS VALUE/,
    /^RETURN DEPOSITS$/,
    /^NO OF CONTAINERS$/,
    /^DEPOSIT PER CONTAINER$/,
    /^TOTAL DEPOSITS$/,
    /^DEPOSIT \d/,
    /^TOTAL RETURN (CONTAINERS|DEPOSITS)$/,
]

// How far from a label something can be and still be on its line of the box.
// The labels are bold and sit three quarters of a point below the figures
// beside them. The lines of the table sit on a six point grid that never comes
// nearer than a point and a half to a label, so one point takes the whole box
// and nothing else. If a line ever did land on one, its figures would go with
// the box, the values would stop adding up and the import would refuse, which
// is the safe way round.
const SAME_LINE = 1

// Where the line table stops. Everything below one of these is totals and small
// print, and nothing on it is a line.
const FOOTER_WORDS = ['GOODS TOTAL', 'AMOUNT PAYABLE', 'TAXABLE GOODS', 'VAT RATE']

// **Sysco's own text arrives garbled in one place.** A curly apostrophe comes
// out of its system as the three characters of its bytes read the wrong way,
// and then gets printed in capitals like everything else, so a box of fifty
// reads "(9X50Â€™S)". The same thing happens to curly quotes and dashes. They
// are put back to plain ones, which is what the rest of the text uses.
const GARBLED = [
    [/[âÂ]€[™˜]/g, "'"],
    [/[âÂ]€[œ]/g, '"'],
    [/[âÂ]€[“”]/g, '-'],
]

export function mend(text) {
    return GARBLED.reduce((out, [wrong, right]) => out.replace(wrong, right), String(text ?? ''))
}

const tidy = text => mend(text).replace(/\s+/g, ' ').trim()
const shout = text => tidy(text).toUpperCase()

// A supplier's product code. Numbers mostly, and sometimes letters too: VG958Z
// is on the first real invoice.
const CODE = /^[A-Z0-9][A-Z0-9-]{2,}$/i

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
        cells.push({ text: item.str, x: item.x, width: item.width, y: row.y })
    }
    return cells.map(c => ({ ...c, text: tidy(c.text), right: c.x + c.width, mid: c.x + c.width / 2 }))
}

// Where a heading sits, allowing for it having been written in pieces.
//
// "PACK SIZE" can arrive as one cell or as two, and which it is depends on the
// file rather than on the supplier, so both have to work. Only cells on the
// same baseline are joined: a word above and a word below are two headings.
export function findHeading(cells, name, from = 0) {
    const wanted = shout(name)
    for (let i = from; i < cells.length; i++) {
        let joined = ''
        for (let j = i; j < Math.min(cells.length, i + 3); j++) {
            if (j > i && cells[j].y !== undefined && cells[j].y !== cells[i].y) break
            joined = joined ? `${joined} ${shout(cells[j].text)}` : shout(cells[j].text)
            if (joined === wanted) {
                return { left: cells[i].x, right: cells[j].right, endIndex: j }
            }
            if (!wanted.startsWith(joined)) break
        }
    }
    return null
}

// Every place a heading appears in a set of cells.
function spotsOf(cells, name) {
    const out = []
    for (let i = 0; i < cells.length; i++) {
        const spot = findHeading(cells, name, i)
        if (!spot) break
        out.push(spot)
        i = spot.endIndex
    }
    return out
}

// The spans each column owns, from where its heading is printed.
//
// The headings can be on several baselines, so they are looked for by what
// they say rather than in the order they come. CODE appears twice on the real
// page, once over the product code and once as the bottom half of VAT CODE, and
// the leftmost is the one that matters.
//
// The boundary between two columns is halfway across the gutter between their
// headings, and the first and last run off to the edges of the page. A cell
// belongs to whichever span its middle falls in.
export function columnsFrom(cells) {
    const pool = [...(cells || [])].sort((a, b) => a.x - b.x || (a.y ?? 0) - (b.y ?? 0))
    const found = []

    for (const name of LINE_COLUMNS) {
        const spots = spotsOf(pool, name)
        if (!spots.length) return null
        found.push({ name, ...spots.reduce((a, b) => (a.left <= b.left ? a : b)) })
    }

    const value = found.find(f => f.name === 'VALUE')
    const weight = spotsOf(pool, 'WEIGHT')[0]
    if (weight) found.push({ name: 'WEIGHT', ...weight })

    // WEIGHT and VAT CODE are read only so they have a column of their own.
    // Without one, the VAT code printed beside each value was read as part of
    // it, and 60.60 with a 1 after it is 60.601. VAT CODE is on one line or
    // two, and always to the right of the value.
    const vat = [...spotsOf(pool, 'VAT CODE'), ...spotsOf(pool, 'VAT'), ...spotsOf(pool, 'CODE')]
        .filter(s => s.left > value.right)
    if (vat.length) {
        found.push({
            name: 'VAT CODE',
            left: Math.min(...vat.map(s => s.left)),
            right: Math.max(...vat.map(s => s.right)),
        })
    }

    found.sort((a, b) => a.left - b.left)
    return found.map((spot, i) => ({
        name: spot.name,
        left: spot.left,
        right: spot.right,
        from: i === 0 ? -Infinity : (found[i - 1].right + spot.left) / 2,
        to: i === found.length - 1 ? Infinity : (spot.right + found[i + 1].left) / 2,
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
    GM: { unit: 'KG', factor: 0.001 },
    GMS: { unit: 'KG', factor: 0.001 },
    GR: { unit: 'KG', factor: 0.001 },
    GRM: { unit: 'KG', factor: 0.001 },
    L: { unit: 'Litre', factor: 1 },
    LT: { unit: 'Litre', factor: 1 },
    LTR: { unit: 'Litre', factor: 1 },
    LTRS: { unit: 'Litre', factor: 1 },
    ML: { unit: 'Litre', factor: 0.001 },
    CL: { unit: 'Litre', factor: 0.01 },
    // Counted rather than weighed. "10X10 EA" on the first real invoice is ten
    // packs of ten tortillas, a hundred in the case.
    EA: { unit: 'Units', factor: 1 },
    EACH: { unit: 'Units', factor: 1 },
    PC: { unit: 'Units', factor: 1 },
    PCS: { unit: 'Units', factor: 1 },
    PCE: { unit: 'Units', factor: 1 },
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

// The value that belongs to a label: underneath first, then beside.
//
// Underneath first, because both blocks that carry values on the real page are
// little tables with the titles on one line and the values on the next. Looking
// beside first would find the next title along.
function valueFor(rows, i, spot, cells) {
    const next = rows[i + 1]
    if (next && next.page === rows[i].page) {
        const under = cellsOf(next).find(c => c.right > spot.left && c.x < spot.right)
        if (under) return under.text
    }
    const beside = cells[spot.endIndex + 1]
    return beside ? beside.text : null
}

// A label in the block at the top of the first page.
//
// Only above the line table. The table has a CASE heading of its own and so
// does the block at the top, and they mean different things.
export function headField(rows, label, before = Infinity) {
    for (let i = 0; i < rows.length; i++) {
        if (rows[i].page !== 1 || rows[i].y >= before) continue
        const cells = cellsOf(rows[i])
        const spot = findHeading(cells, label)
        if (spot) return valueFor(rows, i, spot, cells)
    }
    return null
}

// The titles at the foot, left to right: the VAT by code on the left, then the
// goods, the VAT and what is payable. VAT is printed twice, once in each.
const FOOT_TITLES = ['VAT CODE', 'VAT RATE', 'TAXABLE GOODS', 'VAT', 'GOODS TOTAL', 'VAT', 'AMOUNT PAYABLE']
const FOOT_NAMES = ['code', 'rate', 'taxable', 'codeVat', 'goods', 'vat', 'payable']

// The totals at the foot of the last page.
//
// Two little tables side by side with the titles on one line and the figures
// under them. **Read by column, not by what sits under each title.** The
// figures are right aligned in boxes much wider than their titles, so a short
// amount starts to the right of where its title ends: reading "under the title"
// missed the amount payable on every invoice under a hundred euro. Each title
// owns the ground halfway to the next one, the same as the line table.
//
// Looked for from the bottom up, because a document of two pages prints the
// titles on both and the figures only on the last.
export function footBlock(rows) {
    for (let i = rows.length - 1; i >= 0; i--) {
        const cells = cellsOf(rows[i])
        const said = shout(cells.map(c => c.text).join(' '))
        if (!said.includes('GOODS TOTAL') || !said.includes('AMOUNT PAYABLE')) continue

        const titles = []
        let from = 0
        for (const title of FOOT_TITLES) {
            const spot = findHeading(cells, title, from)
            if (!spot) break
            titles.push(spot)
            from = spot.endIndex + 1
        }
        if (titles.length !== FOOT_TITLES.length) continue

        const columns = titles.map((t, n) => ({
            name: FOOT_NAMES[n],
            from: n === 0 ? -Infinity : (titles[n - 1].right + t.left) / 2,
            to: n === titles.length - 1 ? Infinity : (t.right + titles[n + 1].left) / 2,
        }))
        const read = row => {
            const held = bucket(cellsOf(row), columns)
            const out = {}
            for (const c of columns) out[c.name] = money((held[c.name] || []).map(x => x.text).join(''))
            return out
        }

        const below = rows.slice(i + 1).filter(r => r.page === rows[i].page)
        if (!below.length) return null
        const first = read(below[0])

        // The VAT table runs down the left for as many codes as the document
        // uses, one row each, and stops at the first row with no code.
        const codes = []
        for (const row of below) {
            const line = read(row)
            if (line.code == null) break
            codes.push({ code: String(line.code), rate: line.rate, taxable: line.taxable, vat: line.codeVat })
        }

        return { goodsTotal: first.goods, vat: first.vat, payable: first.payable, codes }
    }
    return null
}

// The deposit box, if there is one: where it is and what it says the
// containers came to.
//
// Its figures are read beside their labels rather than under them, because the
// box has lines of the table running under it and "under" finds a pack size.
export function depositBox(items) {
    const labels = (items || []).filter(i => BOX_LABELS.some(l => l.test(shout(i.str))))
    if (!labels.length) return null

    const page = labels[labels.length - 1].page
    const own = labels.filter(l => l.page === page)
    const beside = pattern => {
        const label = own.find(l => pattern.test(shout(l.str)))
        if (!label) return null
        const next = items
            .filter(i => i.page === page && Math.abs(i.y - label.y) <= SAME_LINE && i.x >= label.x + label.width)
            .sort((a, b) => a.x - b.x)[0]
        return next ? money(next.str) : null
    }

    return {
        page,
        left: Math.min(...own.map(l => l.x)),
        lines: [...new Set(own.map(l => l.y))],
        deposits: beside(/^TOTAL RETURN DEPOSITS$/),
    }
}

// The page with the box taken off it. Anything left of the box stays, which is
// the band names and the start of every description.
export function withoutBox(items, box) {
    if (!box) return items || []
    return (items || []).filter(i => !(
        i.page === box.page
        && i.x >= box.left - SAME_LINE
        && box.lines.some(y => Math.abs(i.y - y) <= SAME_LINE)
    ))
}

// Where the line table's headings are, page by page.
//
// Found by the row that says DESCRIPTION and PACK SIZE, which nothing else on
// the page does, and then everything within a few points above and below it,
// because the real page spreads its headings over three baselines.
function headingBands(rows) {
    const out = []
    for (const row of rows) {
        const said = shout(cellsOf(row).map(c => c.text).join(' '))
        if (!said.includes('DESCRIPTION') || !said.includes('PACK SIZE')) continue

        const band = rows.filter(r => r.page === row.page && Math.abs(r.y - row.y) <= HEAD_BAND)
        const columns = columnsFrom(band.flatMap(r => cellsOf(r)))
        if (!columns) continue
        out.push({
            page: row.page,
            top: Math.min(...band.map(r => r.y)),
            bottom: Math.max(...band.map(r => r.y)),
            columns,
        })
    }
    return out
}

// Is this one of theirs?
//
// The line table's own headings are the test, because they are the part of the
// document this reader actually depends on. A file that has them can be read; a
// file that does not is somebody else's paperwork and belongs to another reader.
export function recognisesSysco(items) {
    return headingBands(rowsOf(items)).length > 0
}

export function readSyscoInvoice(items) {
    const box = depositBox(items)
    const rows = rowsOf(withoutBox(items, box))
    const bands = headingBands(rows)
    if (!bands.length) return null

    const first = bands[0]
    const problems = []

    // ---- the block at the top of the first page --------------------------
    const number = tidy(headField(rows, 'INV. No.', first.top))
    const date = paperDate(headField(rows, 'INV. DATE', first.top))
    const accountNo = tidy(headField(rows, 'ACCT No.', first.top))
    const typeSaid = shout(headField(rows, 'TYPE', first.top))
    const orderSaid = tidy(headField(rows, 'ORD No.', first.top))
    const headCases = money(headField(rows, 'CASE', first.top))
    const totals = footBlock(rows)
    const goodsTotal = totals?.goodsTotal ?? null

    const kind = typeSaid.startsWith('CREDIT') ? 'credit' : 'invoice'

    // ---- every row inside the table, sorted into what it is -------------
    //
    // Two passes, because a wrapped description is centred on its line: half
    // of it comes before the row with the code on it. Reading top to bottom and
    // carrying words onto the line above lost the first half of every wrapped
    // description on the first real invoice, and kept only "10X10 EA".
    const anchors = []
    const pieces = []
    const markers = []

    for (const band of bands) {
        const pageRows = rows.filter(r => r.page === band.page && r.y > band.bottom)
        const foot = pageRows.find(r => {
            const said = shout(cellsOf(r).map(c => c.text).join(' '))
            return FOOTER_WORDS.some(w => said.includes(w))
        })

        for (const row of pageRows) {
            if (foot && row.y >= foot.y) break
            const cells = cellsOf(row, band.columns)
            if (!cells.length) continue

            const said = shout(cells.map(c => c.text).join(' '))
            const section = bandOf(said)
            if (section) { markers.push({ page: row.page, y: row.y, storage: BANDS[section] }); continue }

            const line = readLine(cells, band.columns)
            if (line) {
                const startsAt = leftOf(cells, band.columns)[1]?.x ?? null
                anchors.push({ page: row.page, y: row.y, line, words: [], startsAt })
                continue
            }

            const piece = wrappedPiece(cells, band.columns)
            if (piece) pieces.push({ page: row.page, y: row.y, words: piece.text, startsAt: piece.x })
        }
    }

    // **A wrapped half starts where every description starts.** The payment
    // terms are printed inside the table under the last line, clear of any
    // column, and on a full page they were near enough to the last line to be
    // read as the rest of its name. They start well to the right of where a
    // description does, and that is the difference. Measured off the lines on
    // this document rather than assumed, and left alone if every line on it
    // wrapped and there is nothing to measure.
    const starts = anchors.map(a => a.startsAt).filter(x => x != null)
    const descriptionsStart = starts.length ? Math.min(...starts) : null

    // Each piece of a wrapped description goes to the line it is nearest.
    for (const piece of pieces) {
        if (descriptionsStart != null && Math.abs(piece.startsAt - descriptionsStart) > CELL_GAP) continue
        let best = null
        for (const anchor of anchors) {
            if (anchor.page !== piece.page) continue
            const gap = Math.abs(anchor.y - piece.y)
            if (gap <= WRAP_REACH && (!best || gap < best.gap)) best = { anchor, gap }
        }
        if (best) best.anchor.words.push({ y: piece.y, text: piece.words })
    }

    const lines = anchors.map((anchor, i) => {
        const parts = [...anchor.words, { y: anchor.y, text: anchor.line.description }]
            .filter(p => p.text)
            .sort((a, b) => a.y - b.y)
        // The band a line sits under, which can be on the page before.
        const marker = [...markers]
            .filter(m => m.page < anchor.page || (m.page === anchor.page && m.y < anchor.y))
            .pop()
        return {
            ...anchor.line,
            description: tidy(parts.map(p => p.text).join(' ')),
            storage: marker?.storage || null,
            line_no: i + 1,
        }
    })

    // A credit note prints its deposit without a minus sign, under a negative
    // goods total, and it is money coming back like everything else on it.
    const deposits = !box ? 0
        : box.deposits == null ? null
            : kind === 'credit' ? -Math.abs(box.deposits) : box.deposits

    // ---- what each line cost, VAT and deposit on -------------------------
    //
    // **An invoice costs what it charges.** The food cost takes every charge
    // on it, VAT and the container deposit included, the way the invoices typed
    // in by hand always did: their totals are the amount payable, to the cent,
    // on every one checked. The prices stay as printed, without either,
    // because a price is compared against a price.
    //
    // Each line carries its own share rather than the document carrying the
    // difference, because one document can hold food and packaging, and the
    // VAT on the packaging belongs to packaging.
    shareVat(lines, totals?.codes || [])
    shareDeposit(lines, deposits)

    // ---- the three checks ------------------------------------------------
    //
    // The goods total includes the container deposit and no line's value
    // does, so the values are held up against the goods less the deposit.
    // Twelve of the first thirty seven real documents were refused for it
    // before this.
    const goods = goodsTotal == null || deposits == null ? null : round2(goodsTotal - deposits)
    const valuesGot = round2(lines.reduce((t, l) => t + num(l.value), 0))
    const casesGot = round2(lines.reduce((t, l) => t + num(l.cases), 0))

    // The third is what the lines cost against what is payable, and every VAT
    // code with VAT on it matched by lines of that code adding up to what the
    // table says was taxable, or the VAT has gone on the wrong lines.
    const payable = totals?.payable ?? null
    const costGot = round2(lines.reduce((t, l) => t + num(l.value) + num(l.vat) + num(l.deposit), 0))
    const codesAgree = (totals?.codes || []).every(c => !num(c.vat) || round2(
        lines.filter(l => l.vat_code === c.code).reduce((t, l) => t + num(l.value), 0),
    ) === round2(c.taxable))

    const checks = {
        values: { expected: goods, got: valuesGot, ok: goods != null && goods === valuesGot },
        cases: { expected: headCases, got: casesGot, ok: headCases != null && round2(headCases) === casesGot },
        payable: {
            expected: payable,
            got: costGot,
            codes: codesAgree,
            ok: payable != null && round2(payable) === costGot && codesAgree,
        },
    }
    checks.ok = checks.values.ok && checks.cases.ok && checks.payable.ok

    if (!number) problems.push({ why: 'no_number' })
    if (!date) problems.push({ why: 'no_date' })
    if (!accountNo) problems.push({ why: 'no_account' })
    if (!lines.length) problems.push({ why: 'no_lines' })
    if (!checks.values.ok) problems.push({ why: 'values', ...checks.values })
    if (!checks.cases.ok) problems.push({ why: 'cases', ...checks.cases })
    if (!checks.payable.ok) problems.push({ why: 'payable', ...checks.payable })

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
        deposits,
        vat: totals?.vat ?? null,
        // What the document charges, and so what it costs in the Hub.
        payable,
        pages: Math.max(...rows.map(r => r.page), 0),
        lines,
        checks,
        problems,
    }
}

function round2(n) {
    return Math.round(num(n) * 100) / 100
}

// A sum of money shared out in proportion, to the cent.
//
// The odd cents go to the biggest remainders, so the shares always add up to
// the whole exactly: VAT worked out line by line and rounded comes to a cent or
// two either side of what was printed, and what was printed is what was paid.
export function shareOut(total, weights) {
    if (!weights?.length) return []
    const cents = Math.round(Math.abs(num(total)) * 100)
    const sign = num(total) < 0 ? -1 : 1
    const sum = weights.reduce((t, w) => t + num(w), 0)
    const parts = sum > 0 ? weights.map(num) : weights.map(() => 1)
    const whole = sum > 0 ? sum : weights.length

    const exact = parts.map(w => (cents * w) / whole)
    const got = exact.map(Math.floor)
    let left = cents - got.reduce((t, n) => t + n, 0)
    const order = exact
        .map((e, n) => ({ n, rest: e - got[n] }))
        .sort((a, b) => b.rest - a.rest || a.n - b.n)
    for (const { n } of order) {
        if (left <= 0) break
        got[n] += 1
        left -= 1
    }
    return got.map(c => (sign * c) / 100)
}

// The VAT printed for each code, shared over the lines with that code in
// proportion to their value. A credit note prints it without a minus sign, the
// same as its deposit, under taxable goods that have one.
function shareVat(lines, codes) {
    for (const line of lines) line.vat = 0
    for (const entry of codes) {
        const mine = lines.filter(l => l.vat_code === entry.code)
        const vat = Math.abs(num(entry.vat)) * (num(entry.taxable) < 0 ? -1 : 1)
        const shares = shareOut(vat, mine.map(l => Math.abs(num(l.value))))
        mine.forEach((l, n) => { l.vat = shares[n] })
    }
}

// The drinks that carry a deposit say so at the front: "DRS 15C" is fifteen
// cents a container.
const DRS = /^DRS\s+(\d+)C\b/i

// The deposit, on the drinks that carry it.
//
// The pack says how many containers are in a case, so a line's share can
// usually be worked out exactly: the 21.60 on one real invoice is 144
// containers at fifteen cents, six cases of 24. Where it cannot, it is shared by
// value over the drinks, or over every line if none can be told apart, so the
// lines always come to what was charged.
function shareDeposit(lines, deposits) {
    for (const line of lines) line.deposit = 0
    if (!deposits) return

    const drinks = lines.filter(l => DRS.test(l.description))
    const counted = drinks.map(l => {
        const perCase = l.pack?.count
        if (!perCase) return null
        const cents = Number(DRS.exec(l.description)[1])
        return (Math.abs(num(l.cases)) * perCase + Math.abs(num(l.units))) * cents
    })
    const over = drinks.length ? drinks : lines
    const weights = drinks.length && counted.every(n => n != null)
        ? counted
        : over.map(l => Math.abs(num(l.value)))

    const shares = shareOut(deposits, weights)
    over.forEach((l, n) => { l.deposit = shares[n] })
}

// The part of the row left of the pack size: the code and the description.
function leftOf(cells, columns) {
    const pack = columns.find(c => c.name === 'PACK SIZE')
    return cells.filter(c => c.mid <= pack.from)
}

// One row of the table, or nothing if it is not a line.
//
// A code and a value together is the test. Either on its own turns up on rows
// that are not lines: a page footer carries figures, and the small print carries
// words that could pass for a code.
//
// **The code is the first thing on the row, not whatever sits under the CODE
// heading.** That heading is printed at the far left and DESCRIPTION is centred
// over a much wider column, so halfway between the two is well to the right of
// where a description starts. A short one, EGGS or the second half of a wrapped
// one, sat entirely on the code's side of that line.
function readLine(cells, columns) {
    const held = bucket(cells, columns)
    const value = money((held.VALUE || []).map(c => c.text).join(''))
    if (value == null) return null

    const left = leftOf(cells, columns)
    const description = columns.find(c => c.name === 'DESCRIPTION')
    const codeCell = left[0]
    if (!codeCell || codeCell.right > description.left || !CODE.test(codeCell.text)) return null

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

    const words = tidy([
        ...left.slice(1).map(c => c.text),
        ...spilt.sort((a, b) => a.x - b.x).map(c => c.text),
    ].join(' '))

    // Which line of the VAT table at the foot this line is taxed under.
    const vatCode = tidy((held['VAT CODE'] || []).map(c => c.text).join(''))

    return {
        code: codeCell.text,
        description: words,
        vat_code: vatCode || null,
        pack_size: packSaid || null,
        pack: packSaid ? readPackSize(packSaid) : null,
        cases: cases ?? 0,
        units: units ?? 0,
        price_per_case: pricePerCase,
        value,
    }
}

// Part of a wrapped description, on a row with nothing else on it.
//
// Only the first run of words. Half a description is one piece of lettering,
// and anything further along the same row is something else that happens to
// share its baseline.
function wrappedPiece(cells, columns) {
    const held = bucket(cells, columns)
    const hasFigures = ['CASE', 'UNIT', 'PRICE', 'VALUE']
        .some(name => (held[name] || []).some(c => money(c.text) != null))
    if (hasFigures) return null

    const first = leftOf(cells, columns)[0]
    return first?.text ? first : null
}
