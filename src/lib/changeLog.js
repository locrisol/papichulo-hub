// Turning a change_log row into something a person can read.
//
// The database stores column names and raw values, because that is what it has.
// Nobody wants to read `net_sales` or `2480.00` or a uuid, so everything here is
// about saying the same thing in English.
//
// The one rule throughout: never invent. If a value cannot be phrased properly
// it is shown as it was stored rather than guessed at, and a missing value says
// so instead of reading as a zero.

// Tables by the name they go under in the app rather than in the database.
// Anything not listed falls back to the column name tidied up, which is usually
// close enough and is at least honest.
const TABLES = {
    sales_records: 'Daily sales',
    sales_tenders: 'Till receipt',
    sales_platforms: 'Delivery platform',
    petty_cash_entries: 'Petty cash',
    invoices: 'Invoice',
    invoice_lines: 'Invoice line',
    labour_entries: 'Labour',
    waste_logs: 'Waste',
    stock_takes: 'Stock take',
    stock_take_lines: 'Stock take line',
    products: 'Product',
    product_supplier_prices: 'Supplier price',
    product_aliases: 'Product alias',
    product_allergens: 'Allergen',
    mix_recipes: 'Recipe',
    price_count_units: 'Count unit',
    menu_items: 'Menu item',
    menu_categories: 'Menu category',
    menu_item_components: 'Menu item component',
    suppliers: 'Supplier',
    users: 'Account',
    restaurants: 'Restaurant',
    employees: 'Employee',
    positions: 'Position',
    roster_shifts: 'Shift',
    absences: 'Absence',
    shift_requests: 'Time off request',
    day_notes: 'Day note',
    weekly_reports: 'Weekly report',
    report_sections: 'Report section',
    report_items: 'Report line',
    cost_target_overrides: 'Cost target',
    events: 'Event',
}

// Fields whose numbers are money. There is no way to tell from the value
// itself, and a euro sign in front of a headcount would be worse than none in
// front of a price.
//
// The exceptions are checked first and win, because several of them contain a
// word from the money list. Both halves were checked against the columns that
// actually exist rather than guessed at: hourly_rate is money and vat_rate is
// not, total_hours carries "total" and is a count of hours, and weight_loss_pct
// and food_cost_pct carry "cost" and are percentages.
//
// It will not always be right about a column added later. Being wrong here puts
// a euro sign where none belongs, which is visible and costs nothing, and never
// changes a figure.
const NOT_MONEY = /(pct|percent|vat|_id$|count|qty|quantity|hours|minutes|number|version)/
const MONEY = new RegExp('sales|cost|price|amount|total|value|pay|rate|float|variance'
    + '|spend|wage|food|salary|fee|charge|net|gross|revenue|takings|overhead'
    + '|discount|refund|tip')

function isMoney(field) {
    const name = field || ''
    return !NOT_MONEY.test(name) && MONEY.test(name)
}

// "a invoice" is the kind of thing that makes a screen look unfinished, and it
// is one line to not do it.
export function aOrAn(word) {
    return /^[aeiou]/i.test(word || '') ? `an ${word}` : `a ${word}`
}

// The day a change belongs to, in the reader's own time rather than the
// database's. Without this a change made at half past midnight is filed under
// the day before, which is exactly the sort of thing that makes somebody
// distrust the whole record.
export function dayOf(at) {
    // new Date(null) is the first of January 1970 rather than an error, so a
    // missing timestamp has to be caught before it becomes a day heading.
    if (!at) return ''
    const d = new Date(at)
    if (isNaN(d)) return ''
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        + `-${String(d.getDate()).padStart(2, '0')}`
}

// Columns nobody needs to see move.
const NOISE = new Set(['updated_at', 'created_at'])

export function tableWords(name) {
    if (!name) return 'Something'
    return TABLES[name] || fieldWords(name)
}

// A column name as a label. Trailing "id" goes, because "Restaurant id changed"
// is the database talking and "Restaurant changed" is the answer.
export function fieldWords(name) {
    if (!name) return ''
    const words = String(name).replace(/_id$/, '').replace(/_/g, ' ').trim()
    if (!words) return ''
    return words.charAt(0).toUpperCase() + words.slice(1)
}

export function money(n) {
    return `€${Number(n).toLocaleString('en-IE', {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
    })}`
}

// A stored value as words.
//
// Null is the one that matters. It is not zero and it is not an empty box, it
// is the absence of an answer, and on a figure the difference between "nothing"
// and "0.00" is the whole question.
export function valueWords(field, v) {
    if (v === null || v === undefined) return 'nothing'
    if (typeof v === 'boolean') return v ? 'Yes' : 'No'

    if (typeof v === 'number') {
        return isMoney(field) ? money(v) : String(v)
    }

    if (typeof v === 'string') {
        // Postgres hands decimals back as strings so nothing is lost on the way.
        if (/^-?\d+(\.\d+)?$/.test(v) && isMoney(field)) return money(v)

        // A timestamp reads as a date and a time; a plain date stays a date.
        const stamp = /^(\d{4})-(\d{2})-(\d{2})(T| )(\d{2}):(\d{2})/.exec(v)
        if (stamp) return `${stamp[3]}/${stamp[2]}/${stamp[1]}, ${stamp[5]}:${stamp[6]}`
        const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
        if (day) return `${day[3]}/${day[2]}/${day[1]}`

        // A uuid on its own tells nobody anything. The last block is enough to
        // tell two apart, which is all it is ever used for here.
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
            return `…${v.slice(-6)}`
        }

        if (!v.trim()) return 'nothing'
        return v
    }

    // The trigger writes a note in place of anything over 2000 characters, and
    // that note arrives here as a plain string, so this is objects and arrays.
    return Array.isArray(v) ? `${v.length} item${v.length === 1 ? '' : 's'}` : 'a set of values'
}

function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v)
}

// Several columns hold an object rather than a value: platform_sales keeps the
// day's takings per delivery platform, tender_amounts keeps them per till row.
// Saying "a set of values to a set of values" about those is the log throwing
// away the only part anybody wanted, so they are opened up and the keys that
// moved are reported one by one.
//
// Past a handful it stops being readable and goes back to a count, which is
// what an object being replaced wholesale looks like.
const MOST_INSIDE = 8

function inside(field, before, after) {
    const keys = [...new Set([
        ...Object.keys(isPlainObject(before) ? before : {}),
        ...Object.keys(isPlainObject(after) ? after : {}),
    ])].sort()

    const moved = keys.filter(k =>
        JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null))

    if (moved.length === 0 || moved.length > MOST_INSIDE) return null

    return moved.map(k => ({
        field: `${field}.${k}`,
        label: `${fieldWords(field)}, ${fieldWords(k)}`,
        // The two names joined, so the inner key is judged as money by the
        // company it keeps: "deliveroo" says nothing on its own but
        // "platform_sales_deliveroo" is plainly a figure in euro.
        was: valueWords(`${field}_${k}`, before?.[k] ?? null),
        became: valueWords(`${field}_${k}`, after?.[k] ?? null),
    }))
}

// The fields that moved, in a shape the screen can lay out.
//
// `was` and `became` are already words. Nothing downstream should have to know
// what the database stored.
export function changedFields(entry) {
    const changes = entry?.changes
    if (!changes || typeof changes !== 'object') return []

    const out = []

    for (const f of Object.keys(changes).filter(k => !NOISE.has(k)).sort()) {
        const before = changes[f]?.from ?? changes[f]?.was ?? null
        const after = changes[f]?.to ?? changes[f]?.became ?? null

        if (isPlainObject(before) || isPlainObject(after)) {
            const parts = inside(f, before, after)
            if (parts) {
                out.push(...parts)
                continue
            }
        }

        out.push({
            field: f,
            label: fieldWords(f),
            was: valueWords(f, before),
            became: valueWords(f, after),
        })
    }

    return out
}

// A deleted row, worth showing but not all of it. The keys that are plainly
// plumbing are dropped and the rest are shown in the order they were stored.
export function deletedFields(entry) {
    const row = entry?.deleted_row
    if (!row || typeof row !== 'object') return []

    return Object.keys(row)
        .filter(f => f !== 'id' && !NOISE.has(f) && row[f] !== null)
        .map(f => ({ field: f, label: fieldWords(f), value: valueWords(f, row[f]) }))
}

// Who did it.
//
// A null email is not a gap in the record, it is the record saying nobody was
// signed in through the app. That is worth reading as its own thing rather than
// as a blank, because it is the one that should make you look twice.
export function whoWords(entry) {
    if (entry?.email) return entry.email
    if (entry?.via === 'service_role') return 'The Hub itself'
    return 'Not through the app'
}

export function throughTheApp(entry) {
    return Boolean(entry?.email)
}

// One line saying what happened, for the places that have room for a sentence
// and not for a grid.
export function summarise(entry) {
    const what = tableWords(entry?.table_name)

    if (entry?.action === 'insert') return `Added ${aOrAn(what.toLowerCase())}`
    if (entry?.action === 'truncate') {
        const gone = entry?.changes?.rows_removed
        return `Emptied ${what.toLowerCase()}${gone != null ? `, ${gone} rows` : ''}`
    }
    if (entry?.action === 'delete') return `Deleted ${aOrAn(what.toLowerCase())}`

    const fields = changedFields(entry)
    if (fields.length === 0) return `Changed ${aOrAn(what.toLowerCase())}`
    if (fields.length === 1) {
        const f = fields[0]
        return `${f.label} on ${what.toLowerCase()}: ${f.was} to ${f.became}`
    }
    return `Changed ${fields.length} things on ${what.toLowerCase()}`
}

// The colour a row carries. Deleting and emptying are the two worth seeing from
// across the page.
export function actionTone(action) {
    if (action === 'delete' || action === 'truncate') return 'bad'
    if (action === 'insert') return 'new'
    return 'plain'
}

export function actionWords(action) {
    return { insert: 'Added', update: 'Changed', delete: 'Deleted', truncate: 'Emptied' }[action]
        || 'Changed'
}

// Grouped under a day heading, newest first, for the views that show a run of
// changes rather than one row's history.
export function byDay(entries) {
    const days = new Map()
    for (const e of entries || []) {
        const day = dayOf(e.changed_at)
        if (!day) continue
        if (!days.has(day)) days.set(day, [])
        days.get(day).push(e)
    }
    return [...days.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
}
