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
import { weekStartOf, addDays } from '@/lib/dates'
import { recognisesSysco, readSyscoInvoice, readPackSize } from '@/lib/invoiceSysco'
import { documentStatus } from '@/lib/supplierDocuments'

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
        const wanted = documentTotal(doc)
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
//
// **Except that a food supplier sells more than food.** A line the Hub does not
// recognise yet used to take the supplier's category, and for the supplier that
// is ninety per cent of what they buy that is food, so the first real week put
// foil, mops, bowls and lids on the food cost. The paper already says which is
// which: food is zero rated for VAT, and on every line of the first 37 real
// documents, everything taxed was either a drink carrying a container deposit
// or not food at all. So a taxed line with no deposit on it is packaging until
// somebody says otherwise. Packaging rather than cleaning because that is how
// those invoices were filed when they were typed by hand, and matching the
// line to a product in the review moves it to the product's own category.
export function lineCategory(product, supplier, line = null) {
    const own = SECTION_CATEGORY[product?.section]
    if (own) return own

    const theirs = supplier?.category || 'other'
    const notFood = !product && line && num(line.vat) !== 0 && !num(line.deposit)
    return theirs === 'food' && notFood ? 'packaging' : theirs
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

// How much two descriptions are the same words, measured against the longer
// of the two, so a name with an extra word in it is not the same thing:
// SANTA MARIA TORTILLA against SANTA MARIA TORTILLA WHOLEMEAL is 0.8 here and 1
// above.
export function sameWords(a, b) {
    const one = new Set(words(a))
    const two = new Set(words(b))
    if (!one.size || !two.size) return 0
    let shared = 0
    for (const w of one) if (two.has(w)) shared += 1
    return shared / Math.max(one.size, two.size)
}

// How alike two descriptions have to be before the Hub will suggest one became
// the other. Below this it says nothing rather than guessing.
export const SAME_PRODUCT = 0.7

// How long a code has to have been quiet before it counts as having stopped.
//
// Deliveries come two or three times a week, so a code seen three days ago has
// not gone anywhere. Without this, anything not on the document in front of you
// looks discontinued, and the Hub would offer a perfectly live product as the
// thing a new code replaced.
export const QUIET_DAYS = 10

// **Near enough the same words, not just alike.** A code that has stopped is
// judged at 0.7, and that is right for it. A code still being bought is judged
// here, because Sysco sells the same thing under two numbers at once (the green
// peppers, one of them labelled ReadyChef), and at 0.7 Ballygowan and River
// Rock sparkling water would be the same thing: they score 0.75 on the words
// they share. Every real pair on the first fortnight read word for word the
// same, and the pack has to match as well.
export const SAME_WORDS = 0.9

const tidyPack = p => String(p || '').toUpperCase().replace(/\s+/g, '')

// The same thing under another number, whether or not the other one has
// stopped: the same words and the same pack.
export function sameThing(line, code) {
    if (!line?.pack_size || !code?.pack_size) return false
    if (tidyPack(line.pack_size) !== tidyPack(code.pack_size)) return false
    return sameWords(line.description, code.last_description) >= SAME_WORDS
}

// A code that stopped appearing, that this new one looks like it replaced.
//
// The supplier renumbering something is otherwise a new product appearing
// beside an old one that quietly stops, and nobody notices for a year. It is
// deterministic and there is no AI in it: a code that has not been seen since
// before this document, with almost the same description, and the same pack
// size if both say one.
export function codeSuccessor(line, codes, { onThisDocument = [], date = null } = {}) {
    const here = new Set(onThisDocument)
    const quietBy = date ? addDays(date, -QUIET_DAYS) : null

    // One that has stopped, or one still being bought that reads word for
    // word the same in the same pack: Sysco sells some things under two
    // numbers at once, and asking about those only once one has gone quiet
    // meant ten days of the new one sitting under Never bought before.
    const gone = (codes || []).filter(c => (
        !c.ignored
        && c.price_id
        && c.supplier_code !== line.code
        && !here.has(c.supplier_code)
        && (!quietBy || !c.last_seen_on || c.last_seen_on <= quietBy || sameThing(line, c))
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

    if (!scored.length) return null
    const best = scored[0].code
    return {
        ...best,
        score: Math.round(scored[0].score * 100) / 100,
        // Still being bought, so the screen does not say it has stopped.
        stillBought: !!quietBy && !!best.last_seen_on && best.last_seen_on > quietBy,
    }
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

// Every way this line's pack can be counted in the product's units, the usual
// one first.
//
// Usually one. **Something the Hub counts in kilos or litres that the supplier
// sells by the each** can be read two ways, because nothing on the paper says
// what an each weighs: White Cabbage is counted in KG in the Hub and priced at
// one cabbage, and Sysco sells it as "1X1 EA" one day and "1X10 EA" the next.
// Read only as one pack, the case of ten looked like a cabbage at 14.33. So the
// number of items is offered too, and the price decides which one was meant.
//
// The printed pack is read again rather than trusted from the stored line,
// because a line stored before this was written carries the one reading only.
//
// **Once the product says what one piece weighs, that is the reading, and it
// comes first** (26 September): a case of ten cabbages at about a kilo each is
// ten kilos, so its price is a price a kilo like everything else the product is
// costed at. The other way round too: a four kilo box of something counted by
// the piece is four kilos over what one weighs. The two older readings stay
// behind it, so a price already kept per piece still agrees with itself and
// nothing asks a question that was answered before.
export function packReadings(line, product) {
    const first = unitsWanted(line?.pack, product)
    const printed = readPackSize(line?.pack_size)
    const items = printed?.unit === 'Units' && product?.unit && product.unit !== 'Units'
        ? printed.total
        : null
    return [byPieceWeight(printed, product), first, items]
        .filter((n, i, all) => n != null && n > 0 && all.indexOf(n) === i)
}

// A pack in the product's own unit, through what one piece weighs. Null when
// the product has not said, or the pack and the product already agree.
export function byPieceWeight(printed, product) {
    const weight = num(product?.piece_weight)
    if (!(weight > 0) || !printed?.total || !product?.unit) return null
    if (printed.unit === 'Units' && product.unit !== 'Units') return to(printed.total * weight, 3)
    if (printed.unit === 'KG' && product.unit === 'Units') return to(printed.total / weight, 3)
    return null
}

// Whether a line charged the same price the Hub already has, however many were
// in it.
//
// **Compared per unit, not per case.** A case of ten cabbages at 14.33 and one
// cabbage at 1.43 are the same price, 1.433 and 1.43 a cabbage, and asking about
// it every time somebody orders loose instead of by the case is what made the
// first real review untrustworthy. The gap allowed is only what printing the
// smaller of the two to the cent can explain: half a cent, spread over its
// units. The same pack is the printed prices side by side, to the half cent,
// exactly as before.
export function samePrice({ perCase, units }, price) {
    if (!price) return false
    const now = num(perCase)
    const rowUnits = price.units_per_case == null ? null : num(price.units_per_case)
    const rowCase = price.price_per_case == null ? null : num(price.price_per_case)

    const samePack = units != null && rowUnits != null && Math.abs(rowUnits - units) <= 0.0005
    if (rowCase != null && (samePack || !units)) return Math.abs(rowCase - now) <= SAME_PRICE

    const perUnitWas = price.price_per_unit != null ? num(price.price_per_unit)
        : rowCase != null && rowUnits ? rowCase / rowUnits
            : null
    // A price row with nothing on it to compare against asks nothing, as it
    // always has.
    if (perUnitWas == null) return true
    if (!units) return false

    const smallest = Math.min(units, rowUnits || units)
    return Math.abs(perUnitWas - now / units) <= SAME_PRICE / smallest + 0.00005
}

// How many units a line holds, given how many somebody said another line with
// the same code holds.
//
// Matching a code in the review is answered on one line and applies to every
// line carrying it, and they are not always the same pack: one cabbage one day,
// a case of ten the next. Each keeps its own count, scaled from the answer by
// what is printed on the two lines.
export function unitsForPack(chosen, fromPackSize, toPackSize) {
    if (chosen == null) return null
    if (fromPackSize === toPackSize) return chosen
    const from = readPackSize(fromPackSize)
    const into = readPackSize(toPackSize)
    if (!from?.total || !into?.total || from.unit !== into.unit) return chosen
    return to(num(chosen) * into.total / from.total, 3)
}

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

        // **A number somebody said is the same thing as another still means
        // its price.** Joining two codes gives the price to one of them and
        // the other remembers it through replaces_code, and Sysco goes on
        // sending both: without this the older green pepper code went back to
        // Never bought before the next time it came.
        const replacedBy = codeRow && !codeRow.price_id
            ? (codes || []).find(c => c.replaces_code === line.code && c.price_id && byId.get(c.price_id))
            : null
        const price = (codeRow?.price_id && byId.get(codeRow.price_id))
            || (replacedBy && byId.get(replacedBy.price_id))
            || (!codeRow && prices.find(p => p.supplier_code === line.code))
            || null
        const product = price?.products || price?.product || null

        if (!price) {
            const successor = codeSuccessor(line, codes, { onThisDocument, date })
            // A new number for something already bought is the same kind of
            // thing it was under the old one.
            const before = successor?.price_id ? byId.get(successor.price_id) : null
            return {
                line,
                codeRow,
                price: null,
                product: null,
                successor,
                pile: successor ? 'new_code' : 'new_to_us',
                category: lineCategory(before?.products || before?.product || null, supplier, line),
            }
        }

        const was = num(price.price_per_case)
        const now = num(line.price_per_case)
        // The reading of the pack that makes it the same price, if there is
        // one, and the usual reading if not.
        const readings = packReadings(line, product)
        const agrees = readings.length
            ? readings.find(units => samePrice({ perCase: now, units }, price))
            : (samePrice({ perCase: now, units: null }, price) ? null : undefined)
        const wantedUnits = agrees ?? readings[0] ?? null
        // A pack size change is not a price change and must never be treated as
        // one. The unique key on a price row includes units_per_case, so a new
        // pack is a new row, and is_preferred stays on the discontinued one
        // unless somebody moves it. That is how the app ends up costing from a
        // case nobody can buy any more.
        //
        // **The same price per unit in a different pack is not a question at
        // all.** It is the same thing bought another way, a case one day and
        // loose the next, and the Hub costs from the price per unit, which has
        // not moved.
        const packMoved = wantedUnits != null && price.units_per_case != null
            && Math.abs(num(price.units_per_case) - wantedUnits) > 0.0005

        const moved = agrees === undefined

        return {
            line,
            codeRow,
            replacedBy,
            price,
            product,
            was,
            now,
            wantedUnits,
            packMoved,
            perUnitWas: num(price.price_per_unit),
            perUnitNow: wantedUnits ? to(now / wantedUnits, 4) : null,
            pile: moved ? 'price_changed' : 'unchanged',
            category: lineCategory(product, supplier, line),
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

// ---------------------------------------------------------------------------
// What a document costs
// ---------------------------------------------------------------------------

// **An invoice costs what it charges**, VAT and container deposit included.
// That is how every invoice typed in by hand was entered, and it was decided on
// 24 September that the imported ones carry the same, so the food cost takes
// every charge on the paper. The prices on a line stay as printed, without
// either, because a price is compared against a price.
//
// The amount payable where the reader found one, and the goods total for a
// reader that has never met VAT.
export function documentTotal(doc) {
    return num(doc?.payable ?? doc?.goodsTotal)
}

// A line's share of that: what it says, plus its VAT and its deposit.
export function lineCost(line) {
    return num(line?.value) + num(line?.vat) + num(line?.deposit)
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
        byCategory.set(cat, num(byCategory.get(cat)) + lineCost(row.line))
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
        // Its share of the VAT and the deposit, which the cost view adds to
        // the line total. See documentTotal.
        vat_amount: to(line.vat ?? 0, 2),
        deposit_amount: to(line.deposit ?? 0, 2),
        storage: line.storage,
        category: row.category || null,
        product_id: row.product?.id || null,
        price_id: row.price?.id || null,
        // A line the same as last week's needs nobody, and a code somebody has
        // already said is not stock needs nobody either. Settling that here
        // means the review holds only what a person has to look at, which on a
        // twenty document week is a handful of lines instead of two hundred.
        decision: DECIDED_ON_IMPORT[row.pile] || null,
    }
}

const DECIDED_ON_IMPORT = { unchanged: 'matched', ignored: 'ignored' }

// A line read back out of the database, in the shape the matching works in.
//
// The review runs over lines that were written days ago, and it has to reach
// exactly the same answer as the import did or the two screens would disagree
// about the same piece of paper. So the stored row is turned back into a line
// and put through the same matching rather than compared a second way.
//
// units_per_case was settled at import and is carried as a count with no unit
// on it, which is what stops a pack that has not moved being read as one that
// has.
export function storedLine(stored) {
    const units = stored.units_per_case == null ? null : num(stored.units_per_case)
    return {
        line_no: stored.line_no,
        code: stored.supplier_code,
        description: stored.raw_description,
        pack_size: stored.pack_size,
        pack: units == null ? null : { count: units, size: null, unit: null, total: units },
        cases: num(stored.cases),
        units: num(stored.units),
        price_per_case: stored.price_per_case == null ? null : num(stored.price_per_case),
        value: num(stored.line_total),
        vat: num(stored.vat_amount),
        deposit: num(stored.deposit_amount),
        storage: stored.storage,
    }
}

// The document itself. A credit note is an invoice row with a negative total,
// which is what lets a week's cost read it without knowing there are two kinds.
export function invoicePayload(doc, { restaurantId, supplierId, weekStart, createdBy, category }) {
    return {
        restaurant_id: restaurantId,
        supplier_id: supplierId,
        invoice_number: doc.number,
        document_type: doc.kind,
        invoice_date: doc.date,
        total_amount: documentTotal(doc),
        // The header category is what a screen shows before the lines are read
        // and what the cost view falls back on when they never are, which is
        // every invoice from a supplier whose lines are not parsed at all. It
        // follows the supplier, so a delivery of equipment never lands against
        // the food target. Where there are lines, the lines decide.
        category: category || 'food',
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

    // A deposit of null is a box whose total could not be read. No deposit at
    // all is zero, or not there, for a reader that has never met one.
    if (!doc.checks?.values?.ok) {
        const said = doc.deposits === null
            ? `the container deposit on it could not be read`
            : doc.deposits
                ? `the goods come to ${fixed(doc.checks?.values?.expected)} before the `
                    + `${fixed(doc.deposits)} container deposit`
                : `the goods total says ${fixed(doc.checks?.values?.expected)}`
        out.push(`The lines come to ${fixed(doc.checks?.values?.got)} and ${said}, `
            + `so something on it was not read.`)
    }
    // Only a reader that reads VAT has this check at all.
    const payable = doc.checks?.payable
    if (payable && !payable.ok) {
        if (payable.expected == null) {
            out.push('The amount payable at the foot could not be read.')
        } else if (payable.codes === false) {
            out.push('The VAT codes on the lines do not add up to the VAT table at the foot, '
                + 'so the VAT would go on the wrong lines.')
        } else {
            out.push(`With VAT and deposit the lines come to ${fixed(payable.got)} and the amount `
                + `payable says ${fixed(payable.expected)}, so the VAT was not read right.`)
        }
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

// ---------------------------------------------------------------------------
// Filling in an invoice somebody typed off a total
// ---------------------------------------------------------------------------

// **A hand entered total is net and a document is gross**, and he confirmed
// why: he takes a shortage off before typing it in. So filling one in almost
// always raises the total, and raising the total would move the week's food
// cost for a delivery that happened months ago and has already been reported.
//
// The answer is to restore the real total and turn the hand deduction into a
// claim of exactly the same amount. The gross goes up, the claim takes the
// difference back off, and the week ends up on the same figure it has always
// been on. What was an unexplained lower number becomes a tracked shortage with
// a document behind it.
//
// If the typed total was higher than the document, that is not a shortage and
// there is nothing to claim. It is shown rather than absorbed, because a
// difference nobody can account for is exactly the thing worth looking at.
export function fillInPlan(doc, invoice) {
    // Both on the same footing: what was typed was the amount payable, and so
    // is what the document costs.
    const gross = round(documentTotal(doc))
    const net = round(num(invoice?.total_amount))
    const difference = round(gross - net)

    return {
        gross,
        net,
        difference,
        same: Math.abs(difference) < 0.005,
        deducted: difference > 0.005 ? difference : 0,
        over: difference < -0.005 ? round(-difference) : 0,
    }
}

// What the invoice row becomes. The total is the document's, because that is
// what the supplier charged, and the claim is what brings the week back.
export function fillInPayload(doc, { createdBy }) {
    return {
        invoice_number: doc.number,
        document_type: doc.kind,
        invoice_date: doc.date,
        total_amount: documentTotal(doc),
        entry_method: 'parsed',
        created_by: createdBy || null,
    }
}

// The claim that keeps the week still.
//
// Open rather than settled, and that is the point of doing it this way: the
// deduction was made by hand and nobody knows whether the credit ever came.
// From here it is a job on the list like any other until somebody says.
export function fillInClaim(plan, { invoice, doc, restaurantId, supplierId, raisedBy }) {
    if (!plan.deducted) return null
    return {
        restaurant_id: restaurantId,
        supplier_id: supplierId,
        invoice_id: invoice.id,
        docket_number: doc.number,
        what: 'Taken off the total by hand before the invoice was typed in',
        kind: 'short',
        cases: 0,
        units: 0,
        amount: plan.deducted,
        credited_amount: 0,
        status: 'open',
        raised_on: doc.date,
        raised_by: raisedBy || null,
        counted_week: weekStartOf(doc.date),
        note: `The total typed in was ${plan.net.toFixed(2)} and the document says `
            + `${plan.gross.toFixed(2)}.`,
    }
}

function round(n) {
    return Math.round(num(n) * 100) / 100
}

// ---------------------------------------------------------------------------
// A credit for an invoice that was typed in by hand
// ---------------------------------------------------------------------------

// **A total typed by hand is usually net**, because the shortage was taken off
// before it was typed. The credit note for that shortage is then already
// inside the typed total, and importing it would take the same money off a
// second time.
//
// It happens on the very first day of importing: the last invoices typed by
// hand have their credits dated the day after, which is the first day of
// importing documents instead.
//
// With the supplier's own list pasted in, the answer is exact: the invoice it
// credits is found at its value less this credit, or at its value as printed,
// and only the first means it was taken off. Without the list there is only the
// day to go on, so anything typed by hand on the day of the credit or the three
// before it is enough to ask.
export function creditOnHandEntry(doc, { held = [], documents = [], batch = [] } = {}) {
    if (doc?.kind !== 'credit' || !doc.orderReference) return null
    const reference = String(doc.orderReference)

    // Imported, or about to be. The credit then settles or counts the ordinary
    // way and there is nothing typed by hand to worry about.
    if (held.some(h => String(h.invoice_number) === reference)) return null
    if (batch.some(d => d && String(d.number) === reference)) return null

    const typed = held.filter(h => !h.invoice_number)
    if (!typed.length) return null

    if (documents.length && documents.some(d => String(d.document_id) === reference)) {
        const portal = documents.map(d => ({ ...d, value: num(d.value) }))
        if (!portal.some(d => String(d.document_id) === String(doc.number))) {
            portal.push({
                document_id: doc.number,
                order_reference: reference,
                document_date: doc.date,
                document_type: 'credit',
                value: documentTotal(doc),
            })
        }
        const found = documentStatus(portal, typed).get(doc.number)
        return found?.status === 'in_hand_total'
            ? { sure: true, invoiceNumber: reference, typed: found.invoice }
            : null
    }

    const days = [0, 1, 2, 3].map(n => addDays(doc.date, -n))
    const near = typed.find(h => days.includes(h.invoice_date))
    return near ? { sure: false, invoiceNumber: reference, typed: near } : null
}
