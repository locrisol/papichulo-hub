// Turning a read document into something somebody can accept or refuse.
//
// Everything here is arithmetic and rules, so the whole of the review can be
// tested without a database or a browser. The screen fetches, this decides.
//
// **Nothing changes a cost without him.** An invoice proposes and he accepts,
// and that is the rule the four piles exist to serve: a line is either
// something nobody has ever bought, a familiar product under a code that has
// moved, a price that went up, or a line exactly like last week's. Only the
// last of those needs no thought, and it is still listed, because he asked to
// see everything.
//
// The food cost is the one thing that does not wait. Money spent is money
// spent, so the week's figure follows the document the moment it is imported,
// while what a portion costs only moves when he says so.

import { num } from '@/lib/format'
import { recognisesSysco, readSyscoInvoice } from '@/lib/invoiceSysco'

// Every format the Hub can read.
//
// One today. A second supplier is a row here and a file beside invoiceSysco,
// and no screen changes, which is the whole reason the reader was kept separate
// in the first place.
export const READERS = [
    { recognises: recognisesSysco, read: readSyscoInvoice },
]

export function readDocument(items) {
    for (const reader of READERS) {
        if (!reader.recognises(items)) continue
        const doc = reader.read(items)
        if (doc) return doc
    }
    return null
}

// ---------------------------------------------------------------------------
// Whose invoice is this?
// ---------------------------------------------------------------------------

// The account number printed on the document, against the accounts the Hub
// knows.
//
// Suppliers are shared between restaurants, so this is the only thing on the
// paper that says whose costs it belongs in. Guessing would be silent, wrong in
// two weeks at once, and nearly impossible to find afterwards, so an account
// nobody has claimed stops the import and asks.
export function whereItGoes(accountNo, accounts) {
    const wanted = String(accountNo ?? '').trim()
    if (!wanted) return { what: 'no_account' }

    const found = (accounts || []).filter(a => String(a.account_no).trim() === wanted)
    if (!found.length) return { what: 'unknown', accountNo: wanted }
    // Two suppliers printing one number is not something that has happened, and
    // if it ever does the answer is to ask rather than to pick one.
    if (found.length > 1) return { what: 'ambiguous', accountNo: wanted, accounts: found }

    return {
        what: 'known',
        accountNo: wanted,
        supplierId: found[0].supplier_id,
        restaurantId: found[0].restaurant_id,
    }
}

// Have we got this already?
//
// Three answers, because they are three different jobs. A document already
// held, in full, is nothing to do. One that was typed in off a total is the
// fill in path: the figures are there and the detail behind them is not. A new
// one goes in.
//
// **A hand entered total is net, and a document is gross.** He deducts a
// shortage by hand before typing it, so matching on the total to the cent would
// miss exactly the invoices that most need filling in. The day is the match and
// the candidates come back nearest total first.
export function placeDocument(doc, held) {
    const rows = held || []

    const same = doc?.number
        ? rows.find(h => h.invoice_number && String(h.invoice_number) === String(doc.number))
        : null
    if (same) return { what: 'already_here', invoice: same }

    const sameDay = rows.filter(h => !h.invoice_number && h.invoice_date === doc?.date)
    if (sameDay.length) {
        const wanted = num(doc?.goodsTotal)
        const near = [...sameDay].sort((a, b) => (
            Math.abs(num(a.total_amount) - wanted) - Math.abs(num(b.total_amount) - wanted)
        ))
        return { what: 'by_hand', candidates: near }
    }

    return { what: 'new' }
}

// ---------------------------------------------------------------------------
// What kind of cost a line is
// ---------------------------------------------------------------------------

// Where a product is kept says what kind of cost it is, and both columns
// already exist and are already constrained. Nobody has to be asked.
export const SECTION_CATEGORY = {
    Freezer: 'food',
    'Cold Room': 'food',
    Dry: 'food',
    Packaging: 'packaging',
    Cleaning: 'cleaning',
}

// A line's category: off the product where there is one, off the supplier's own
// category where there is not.
//
// The second half is what keeps equipment out of the catalogue. They sell
// nothing that is stock, their invoices stay header only exactly as they work
// today, and a line from them never creates a product.
export function lineCategory(product, supplier) {
    return SECTION_CATEGORY[product?.section] || supplier?.category || 'other'
}

// ---------------------------------------------------------------------------
// Has this code turned into that one?
// ---------------------------------------------------------------------------

const IGNORE_WORDS = new Set(['THE', 'AND', 'OF', 'IN', 'WITH', 'X'])

function words(text) {
    return String(text ?? '')
        .toUpperCase()
        .split(/[^A-Z0-9]+/)
        .filter(w => w.length > 1 && !IGNORE_WORDS.has(w))
}

// How alike two descriptions are, nought to one.
//
// Words shared over words in the shorter of the two, so "SANTA MARIA FLOUR
// TORTILLA" against "SANTA MARIA FLOUR TORTILLA 12IN" comes out at one rather
// than being punished for the longer name carrying more.
export function similarWords(a, b) {
    const one = new Set(words(a))
    const two = new Set(words(b))
    if (!one.size || !two.size) return 0

    let shared = 0
    for (const w of one) if (two.has(w)) shared += 1
    return shared / Math.min(one.size, two.size)
}

// How alike two descriptions have to be before the Hub will suggest one became
// the other. Below this it says nothing rather than guessing.
export const SAME_PRODUCT = 0.7

// A code that stopped appearing, that this new one looks like it replaced.
//
// The supplier renumbering something is otherwise a new product appearing
// beside an old one that quietly stops, and nobody notices for a year. It is
// deterministic and there is no AI in it: a code that has not been seen since
// before this document, with almost the same description, and the same pack
// size if both say one.
export function codeSuccessor(line, codes, { onThisDocument = [], date = null } = {}) {
    const here = new Set(onThisDocument)
    const gone = (codes || []).filter(c => (
        !c.ignored
        && c.price_id
        && c.supplier_code !== line.code
        && !here.has(c.supplier_code)
        && (!date || !c.last_seen_on || c.last_seen_on < date)
    ))

    const scored = gone
        .map(c => ({
            code: c,
            score: similarWords(line.description, c.last_description)
                // A pack size that matches is worth something on its own, and a
                // pack size that does not is worth a warning rather than a
                // refusal: a supplier changing the pack is exactly when the code
                // changes too.
                + (c.pack_size && line.pack_size && c.pack_size === line.pack_size ? 0.15 : 0),
        }))
        .filter(s => s.score >= SAME_PRODUCT)
        .sort((a, b) => b.score - a.score)

    return scored.length ? { ...scored[0].code, score: Math.round(scored[0].score * 100) / 100 } : null
}

// ---------------------------------------------------------------------------
// Matching the lines
// ---------------------------------------------------------------------------

// How many units the Hub should think are in this case.
//
// The invoice cannot say. "4X2.5 KG" is ten kilos and it is also four bags, and
// which of those belongs in units_per_case depends on how the product itself is
// counted. So the product decides where there is one, and where there is not
// the pack's own unit is the better guess than a bare count.
export function unitsWanted(pack, product) {
    if (!pack) return null
    if (product?.unit && pack.unit && product.unit === pack.unit) return pack.total
    if (product?.unit && pack.unit && product.unit !== pack.unit) return pack.count
    return pack.unit ? pack.total : pack.count
}

// Prices are stored to four places and printed to two, so anything under half a
// cent on a case is the same price written twice.
const SAME_PRICE = 0.005

// Every line, with what the Hub already knows about it.
//
// `codes` is the authority once it has anything in it. The supplier_code column
// on a price row seeds it on the first import and is the fallback after that,
// so the fact ends up living in one place rather than two.
export function matchLines({ lines = [], codes = [], prices = [], supplier = null, date = null }) {
    const onThisDocument = lines.map(l => l.code)
    const byCode = new Map((codes || []).map(c => [c.supplier_code, c]))
    const byId = new Map((prices || []).map(p => [p.id, p]))

    return lines.map(line => {
        const codeRow = byCode.get(line.code) || null

        if (codeRow?.ignored) {
            return { line, codeRow, price: null, product: null, pile: 'ignored' }
        }

        const price = (codeRow?.price_id && byId.get(codeRow.price_id))
            || (!codeRow && prices.find(p => p.supplier_code === line.code))
            || null
        const product = price?.products || price?.product || null

        if (!price) {
            const successor = codeSuccessor(line, codes, { onThisDocument, date })
            return {
                line,
                codeRow,
                price: null,
                product: null,
                successor,
                pile: successor ? 'new_code' : 'new_to_us',
                category: lineCategory(null, supplier),
            }
        }

        const was = num(price.price_per_case)
        const now = num(line.price_per_case)
        const wantedUnits = unitsWanted(line.pack, product)
        // A pack size change is not a price change and must never be treated as
        // one. The unique key on a price row includes units_per_case, so a new
        // pack is a new row, and is_preferred stays on the discontinued one
        // unless somebody moves it. That is how the app ends up costing from a
        // case nobody can buy any more.
        const packMoved = wantedUnits != null && price.units_per_case != null
            && Math.abs(num(price.units_per_case) - wantedUnits) > 0.0005

        const moved = price.price_per_case != null && Math.abs(was - now) > SAME_PRICE

        return {
            line,
            codeRow,
            price,
            product,
            was,
            now,
            wantedUnits,
            packMoved,
            perUnitWas: num(price.price_per_unit),
            perUnitNow: wantedUnits ? to(now / wantedUnits, 4) : null,
            pile: (moved || packMoved) ? 'price_changed' : 'unchanged',
            category: lineCategory(product, supplier),
        }
    })
}

export const PILES = ['new_to_us', 'new_code', 'price_changed', 'unchanged', 'ignored']

export function pilesOf(matched) {
    const out = {}
    for (const pile of PILES) out[pile] = []
    for (const row of matched || []) (out[row.pile] || (out[row.pile] = [])).push(row)
    return out
}

// What the document comes to, split the way the money actually went.
//
// Shown before anything is written, because the one thing worth checking at
// that moment is that a delivery of food is not about to land against the
// cleaning target.
export function documentTotals(matched) {
    const byCategory = new Map()
    for (const row of matched || []) {
        const cat = row.category || 'other'
        byCategory.set(cat, num(byCategory.get(cat)) + num(row.line.value))
    }
    return [...byCategory.entries()]
        .map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 }))
        .sort((a, b) => b.amount - a.amount)
}

// ---------------------------------------------------------------------------
// What gets written
// ---------------------------------------------------------------------------

// A line as the database wants it.
//
// The category is settled here rather than at read time, because it depends on
// what the code turned out to be and that is not known until the match is done.
// To the places the column holds. A division in binary leaves a remainder, so
// 30.30 over ten arrives as 3.0300000000000002, and the price it is compared
// against next week comes back from the database rounded. Two figures that are
// the same price have to look the same or every week is a price change.
function to(n, decimals) {
    if (n == null) return null
    const factor = 10 ** decimals
    return Math.round(num(n) * factor) / factor
}

export function linePayload(row, invoiceId) {
    const { line } = row
    const units = row.wantedUnits ?? (line.pack ? unitsWanted(line.pack, null) : null)
    const perUnit = units ? to(num(line.price_per_case) / units, 4) : null

    return {
        invoice_id: invoiceId,
        line_no: line.line_no,
        supplier_code: line.code,
        raw_description: line.description ? line.description.slice(0, 255) : null,
        pack_size: line.pack_size,
        units_per_case: units,
        cases: line.cases,
        units: line.units,
        // The whole line in units, where the pack size can be read. Null rather
        // than a confident guess where it cannot.
        quantity: units != null ? to(num(line.cases) * units + num(line.units), 3) : null,
        price_per_case: line.price_per_case,
        unit_price: perUnit,
        line_total: line.value,
        storage: line.storage,
        category: row.category || null,
        product_id: row.product?.id || null,
        price_id: row.price?.id || null,
    }
}

// The document itself. A credit note is an invoice row with a negative total,
// which is what lets a week's cost read it without knowing there are two kinds.
export function invoicePayload(doc, { restaurantId, supplierId, weekStart, createdBy }) {
    return {
        restaurant_id: restaurantId,
        supplier_id: supplierId,
        invoice_number: doc.number,
        document_type: doc.kind,
        invoice_date: doc.date,
        total_amount: doc.goodsTotal,
        // The header category is what a screen shows before the lines are read
        // and what the cost view falls back on if they never are. The lines
        // decide once they exist.
        category: 'food',
        week_start: weekStart,
        entry_method: 'parsed',
        created_by: createdBy || null,
    }
}

// Whether this document may be written at all.
//
// The two self checks, and enough of a header to file it under. A parser that
// half works is worse than one that stops: half a document in the food cost
// looks exactly like a quiet week.
export function documentBlocks(doc) {
    const out = []
    if (!doc) return ['That file is not a supplier document the Hub can read.']
    if (!doc.number) out.push('There is no document number on it.')
    if (!doc.date) out.push('There is no date on it.')
    if (!doc.lines?.length) out.push('No lines could be read off it.')

    if (!doc.checks?.values?.ok) {
        out.push(`The lines come to ${fixed(doc.checks?.values?.got)} and the goods total says `
            + `${fixed(doc.checks?.values?.expected)}, so something on it was not read.`)
    }
    if (!doc.checks?.cases?.ok) {
        out.push(`The lines come to ${fixed(doc.checks?.cases?.got)} cases and the header says `
            + `${fixed(doc.checks?.cases?.expected)}, so a line is missing or doubled.`)
    }
    return out
}

function fixed(n) {
    return n == null ? 'nothing' : Number(n).toFixed(2)
}
