// The list of documents a supplier says it sent us, pasted off its own portal.
//
// There is no export, no API and no download of the list. There is a web page
// with a row per document and a View link on each, so the way in is to select
// the table in the browser and copy it, which gives tab separated rows:
//
//   2017891	45448455		2026-08-23	Invoice	€163.03	View
//   2017891	C45485340	45480809	2026-08-27	Credit	-€74.26	View
//
// Seven columns: the account number, the document id, an order reference, the
// date, the type, the value, and the word View which is thrown away.
//
// **Read from the right.** An invoice has no order reference, so its third
// column is empty, and a browser that collapses an empty cell hands back six
// fields instead of seven. Reading from the left, every field after it shifts
// along by one and the date lands in the type column, silently, on exactly the
// rows that are most of the list. Read from the right and the collapse costs
// nothing, because the fields that move are the two at the front and they are
// the two that can be told apart by what they look like.
//
// This is the cheapest thing in the whole invoice feature and it is first for a
// reason: it is the only way to find an invoice that was never downloaded at
// all. Comparing the documents we hold against the documents we hold cannot.

import { num } from '@/lib/format'

// The word at the end of every row, which is a link on the page and nothing
// once it has been copied.
const LINK_WORDS = ['view', 'download', 'open']

// The two kinds of document, as the portal writes them.
const TYPES = { invoice: 'invoice', credit: 'credit', 'credit note': 'credit' }

// Whatever the browser gave us, as rows of fields.
//
// Tabs are what a copied table produces. A run of two or more spaces is the
// fallback, for a paste that has been through something that ate them, and it
// is two rather than one because a description can hold a single space and a
// column boundary never looks like one.
export function portalFields(line) {
    const text = String(line ?? '').replace(/\r/g, '')
    const fields = text.includes('\t') ? text.split('\t') : text.split(/ {2,}/)
    return fields.map(f => f.trim())
}

// "€163.03", "-€74.26", "1,234.56". The sign can be in front of the symbol or
// behind it depending on where the page was rendered, so both are allowed.
export function portalValue(text) {
    const raw = String(text ?? '').trim()
    if (!raw) return null
    const negative = raw.includes('-') || /^\(.*\)$/.test(raw)
    const digits = raw.replace(/[^\d.]/g, '')
    if (!digits || !/\d/.test(digits)) return null
    const value = Number(digits)
    if (Number.isNaN(value)) return null
    return negative ? -value : value
}

// The portal writes an ISO date. The PDF writes 23/08/2026. They are the same
// supplier and they are not the same format, which is why there is no shared
// date reader between the two of them.
export function portalDate(text) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text ?? '').trim())
    if (!m) return null
    const month = Number(m[2])
    const day = Number(m[3])
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    return m[0]
}

// A row of column titles somebody copied along with the table.
//
// Told apart by having no date in it anywhere and saying one of the words a
// heading says. A row that simply failed to parse is not a heading and is
// reported, because silently dropping a document is the one thing this must
// not do.
function looksLikeHeading(fields) {
    if (fields.some(f => portalDate(f))) return false
    const said = fields.join(' ').toLowerCase()
    return /\b(date|type|value|document|invoice no|customer)\b/.test(said)
}

// One line, read from the right.
export function portalRow(line) {
    const fields = portalFields(line)
    // An empty field at either end is a stray tab. An empty one in the middle
    // is the order reference of an invoice and has to stay exactly where it is,
    // or reading from the right stops meaning anything.
    while (fields.length && fields[0] === '') fields.shift()
    while (fields.length && (fields[fields.length - 1] === ''
        || LINK_WORDS.includes(fields[fields.length - 1].toLowerCase()))) fields.pop()

    if (fields.length < 5) return null

    const value = portalValue(fields[fields.length - 1])
    const type = TYPES[fields[fields.length - 2].toLowerCase()]
    const date = portalDate(fields[fields.length - 3])
    if (value == null || !type || !date) return null

    const front = fields.slice(0, fields.length - 3)
    const accountNo = front[0] || null
    const documentId = front[1] || null
    if (!accountNo || !documentId) return null

    return {
        account_no: accountNo,
        document_id: documentId,
        // A credit carries the invoice it credits here and an invoice carries
        // nothing, which is how the two halves of a pair find each other.
        order_reference: front[2] || null,
        document_date: date,
        document_type: type,
        // The sign is normalised rather than trusted. A credit is money coming
        // back whatever the page printed, and an invoice is money going out.
        value: type === 'credit' ? -Math.abs(value) : Math.abs(value),
    }
}

// The whole paste.
//
// Nothing is dropped quietly. A line that cannot be read comes back in
// `problems` with its text, because a supplier changing one column of its
// portal would otherwise show up as a short list that looks perfectly fine.
export function readPortalList(text) {
    const lines = String(text ?? '').split('\n').map(l => l.trimEnd())
    const rows = []
    const problems = []
    const seen = new Map()

    for (const line of lines) {
        if (!line.trim()) continue
        const fields = portalFields(line)
        if (looksLikeHeading(fields)) continue

        const row = portalRow(line)
        if (!row) { problems.push({ why: 'unreadable', line: line.trim() }); continue }

        // The same document twice in one paste, which happens when two screens
        // of the list overlap. The first wins and the second is said out loud
        // rather than added, so a count of what was pasted means something.
        if (seen.has(row.document_id)) {
            problems.push({ why: 'twice', line: line.trim(), documentId: row.document_id })
            continue
        }
        seen.set(row.document_id, row)
        rows.push(row)
    }

    return { rows, problems }
}

// Whose lists the Hub can read.
//
// One so far. `readPortalList` was written against Sysco's portal, and another
// supplier's page is another layout nobody has seen yet. The rest are still
// offered on the screen, just not pickable, so a second one is an entry here and
// a reader beside the one above, and the page does not change.
//
// Matched on the supplier's name because the list itself says nothing about
// whose it is, only an account number, and an account is not linked to a
// supplier until its first invoice has been imported.
export const LIST_READERS = [
    { format: 'sysco', supplier: /\bsysco\b/i, read: readPortalList },
]

export function listReaderFor(supplier) {
    return LIST_READERS.find(r => r.supplier.test(supplier?.name || '')) || null
}

// What the paste amounts to, said in figures.
//
// Worth having on screen before anything is saved, because it is the one moment
// somebody can tell at a glance whether they pasted a month or a fortnight, and
// because the credit rate is a number nobody in the building has ever seen.
export function portalSummary(rows) {
    const list = rows || []
    const invoices = list.filter(r => r.document_type === 'invoice')
    const credits = list.filter(r => r.document_type === 'credit')

    const invoiced = invoices.reduce((t, r) => t + num(r.value), 0)
    const credited = credits.reduce((t, r) => t + Math.abs(num(r.value)), 0)
    const dates = list.map(r => r.document_date).sort()

    return {
        documents: list.length,
        invoices: invoices.length,
        credits: credits.length,
        invoiced: Math.round(invoiced * 100) / 100,
        credited: Math.round(credited * 100) / 100,
        // What share of the spend came back. Nothing else in the Hub can say
        // this, and it is the figure that decides whether chasing a forgotten
        // credit is worth anybody's afternoon.
        creditedPct: invoiced > 0 ? Math.round((credited / invoiced) * 1000) / 10 : null,
        accounts: [...new Set(list.map(r => r.account_no))],
        from: dates[0] || null,
        to: dates[dates.length - 1] || null,
    }
}

const cents = n => Math.round(num(n) * 100) / 100
const same = (a, b) => Math.abs(cents(a) - cents(b)) < 0.005

// Where each document on the supplier's list stands in the Hub.
//
//   held            imported, found by its number
//   by_hand         typed in off a total, found by its day and its total
//   in_hand_total   a credit that was taken off a total typed by hand
//   missing         nowhere in the Hub at all
//
// **Everything typed by hand has no number**, which is why the first version of
// this page called every one of them not downloaded: it only ever looked for
// the number. Eight months of invoices were entered that way, so what a hand
// entry looks like has to be worked out from the day and the money.
//
// A total typed by hand is usually net: a shortage was taken off before it was
// typed. So an invoice is looked for at its value less the credits against it
// first, which is also what says those credits were taken off by hand, then at
// its value as printed, and only then paired with whatever is left on the same
// day, with the difference said out loud rather than ignored.
export function documentStatus(portal, held) {
    const out = new Map()
    const numbered = new Map((held || []).filter(h => h.invoice_number).map(h => [String(h.invoice_number), h]))

    for (const row of portal || []) {
        const invoice = numbered.get(String(row.document_id))
        if (invoice) out.set(row.document_id, { status: 'held', invoice })
    }

    const creditsOf = new Map()
    for (const row of portal || []) {
        if (row.document_type !== 'credit' || !row.order_reference) continue
        if (!creditsOf.has(row.order_reference)) creditsOf.set(row.order_reference, [])
        creditsOf.get(row.order_reference).push(row)
    }

    const typed = new Map()
    for (const h of held || []) {
        if (h.invoice_number) continue
        if (!typed.has(h.invoice_date)) typed.set(h.invoice_date, [])
        typed.get(h.invoice_date).push(h)
    }

    const waiting = (portal || []).filter(r => r.document_type === 'invoice' && !out.has(r.document_id))
    const days = [...new Set(waiting.map(r => r.document_date))].sort()

    for (const day of days) {
        const pool = [...(typed.get(day) || [])]
        const take = test => {
            const i = pool.findIndex(test)
            return i < 0 ? null : pool.splice(i, 1)[0]
        }
        const todays = waiting.filter(r => r.document_date === day)

        for (const row of todays) {
            const credits = creditsOf.get(row.document_id) || []
            if (!credits.length) continue
            const net = cents(row.value + credits.reduce((t, c) => t + num(c.value), 0))
            const hit = take(h => same(h.total_amount, net))
            if (!hit) continue
            out.set(row.document_id, { status: 'by_hand', invoice: hit, net: true })
            for (const c of credits) out.set(c.document_id, { status: 'in_hand_total', invoice: hit })
        }

        for (const row of todays.filter(r => !out.has(r.document_id))) {
            const hit = take(h => same(h.total_amount, row.value))
            if (hit) out.set(row.document_id, { status: 'by_hand', invoice: hit })
        }

        // Whatever is left on the day, one for one, nearest total first. Said
        // with the difference, because a typing slip and a different delivery
        // look the same from here and somebody has to look.
        const rest = todays.filter(r => !out.has(r.document_id)).sort((a, b) => b.value - a.value)
        for (const row of rest) {
            if (!pool.length) break
            pool.sort((a, b) => Math.abs(num(a.total_amount) - row.value) - Math.abs(num(b.total_amount) - row.value))
            const hit = pool.shift()
            out.set(row.document_id, {
                status: 'by_hand', invoice: hit, differs: cents(num(hit.total_amount) - row.value),
            })
        }
    }

    for (const row of portal || []) {
        if (!out.has(row.document_id)) out.set(row.document_id, { status: 'missing' })
    }
    return out
}

// The list against what we actually hold.
//
// Separate answers, because they are separate jobs: `missing` is a list of
// things to go and download, `byHand` is what was typed in off a total and has
// no document behind it yet, `extra` is a document the Hub holds that the
// supplier's list does not mention, and `held` is everything already imported.
//
// `extra` is worth showing even though it will nearly always be empty. It is
// how a document filed against the wrong supplier shows itself, and how a
// paste covering the wrong month announces that it is.
export function compareDocuments(portal, held) {
    const status = documentStatus(portal, held)
    const listed = new Set((portal || []).map(r => String(r.document_id)))
    const pick = wanted => (portal || [])
        .filter(r => wanted.includes(status.get(r.document_id).status))
        .map(r => ({ ...r, ...status.get(r.document_id) }))

    return {
        status,
        held: pick(['held']),
        byHand: pick(['by_hand', 'in_hand_total']),
        missing: pick(['missing']),
        extra: (held || []).filter(h => h.invoice_number && !listed.has(String(h.invoice_number))),
    }
}

// A credit and the invoice it credits, paired off inside one paste.
//
// The reference is exact, so this is a lookup rather than a guess. A credit
// whose invoice is outside the range pasted keeps its reference and comes back
// as unpaired, which is a thing to say on screen and never a reason to refuse
// the row.
export function pairCredits(rows) {
    const byId = new Map((rows || []).map(r => [r.document_id, r]))
    const pairs = []
    const loose = []

    for (const row of rows || []) {
        if (row.document_type !== 'credit') continue
        const against = row.order_reference ? byId.get(row.order_reference) : null
        if (against) pairs.push({ credit: row, invoice: against })
        else loose.push(row)
    }

    return { pairs, loose }
}

// How long a credit took to arrive, in days, for each pair.
//
// Over the month this was designed against every credit came the same day or
// the next one and none came later, which is what makes a weekly upload work at
// all: the credits are already in the batch. A run of long waits would mean
// that assumption had stopped being true, and this is how it would show.
export function creditDelays(pairs) {
    return (pairs || []).map(({ credit, invoice }) => ({
        credit: credit.document_id,
        invoice: invoice.document_id,
        days: Math.round(
            (Date.parse(`${credit.document_date}T00:00:00Z`)
                - Date.parse(`${invoice.document_date}T00:00:00Z`)) / 86400000,
        ),
    }))
}

// What the recorded lists say exists and the Hub still does not have.
//
// The same test the paste page runs, over everything ever recorded rather than
// over the box, and supplier by supplier because a list belongs to one of them.
// Typed in by hand is not missing and neither is a credit already inside a
// typed total, so what is left is the list of things still to go and download.
//
// Oldest first, because the one that has been missing longest is the one most
// likely to have been forgotten rather than still on its way.
export function stillMissing(recorded, held) {
    const bySupplier = new Map()
    for (const row of recorded || []) {
        if (!bySupplier.has(row.supplier_id)) bySupplier.set(row.supplier_id, [])
        bySupplier.get(row.supplier_id).push({ ...row, value: num(row.value) })
    }

    const out = []
    for (const [supplierId, rows] of bySupplier) {
        const mine = (held || []).filter(h => h.supplier_id === supplierId)
        const status = documentStatus(rows, mine)
        for (const row of rows) {
            if (status.get(row.document_id)?.status === 'missing') out.push(row)
        }
    }

    return out.sort((a, b) => (
        String(a.document_date).localeCompare(String(b.document_date))
        || String(a.document_id).localeCompare(String(b.document_id))
    ))
}
