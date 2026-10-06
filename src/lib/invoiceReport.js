// What the week's invoices say about prices, for the report.
//
// Agreed on 25 September 2026, after the first real fortnight of documents
// showed what the old section got wrong. It quoted prices by the day somebody
// pressed a button in the review, so twenty five prices accepted on one
// evening all landed on the wrong week, and a price rise somebody chose not to
// cost from was mentioned once and never again.
//
// **A product is what the kitchen uses. Every code a supplier sells it under
// is a version of it, with its own price.** That one idea decides everything
// below:
//
//   Same product, new price     the same code, against its own last delivery,
//                               dated by the invoice. The only thing ever
//                               called a price rise or a price drop.
//   Bought as something else    a code that is not the one usually bought,
//                               against the usual one, per unit. Never a
//                               price rise, and never moves a recipe.
//   Recipes not costing what    the usual version's last price against what
//   you pay                     recipes cost the product at. On every report
//                               until the two are within the restaurant's
//                               own threshold, whatever was pressed in the
//                               review: keeping the old price is "not now",
//                               never "do not tell me".
//   Came back, and why          every credit note, with the reason logged at
//                               the door, what is still owed, and any claim
//                               this week takes off for an earlier delivery
//                               whose report had already gone out.
//
// The usual version is the one recipes cost from: the code on the preferred
// price. After three deliveries in a row of something else, the report asks
// whether that is the usual one now.
//
// **What is worked out here is frozen onto the report when it is published**,
// so it is plain figures and words, nothing the mail would have to work out
// again. The mail cannot import anything from the app.

import { num, fmtMoney, fmtQty, namesList, round2, round4 } from '@/lib/format'
import { renumberPlan } from '@/lib/priceEvents'
import { pricesAsAt } from '@/lib/pricesAsAt'
import { addDays, dayMonth, stampDay } from '@/lib/dates'
import { samePrice, sameWords, SAME_WORDS, byPieceWeight } from '@/lib/invoiceImport'
import { readPackSize, mend } from '@/lib/invoiceSysco'
import {
    claimBalance, claimIsOpen, claimKind, CLAIM_KINDS, NOT_LOGGED, voidedBy, sentBack, fromEarlierWeeks,
} from '@/lib/invoiceClaims'

// How far back a code's last delivery is looked for. Half a year covers the
// things bought every couple of months, spices and cleaning, and a code last
// seen before that is as good as new.
export const LOOK_BACK_DAYS = 182

// Three deliveries in a row of another version and the report asks.
export const IN_A_ROW = 3

// How far back the recipe check averages a group of codes bought either way.
// Four weeks is a dozen deliveries or so, enough that buying one then the
// other does not put a product on the report and off it again.
export const GROUP_DAYS = 28

// What a restaurant that has never said gets. It is a setting, not a rule.
export const DEFAULT_RECIPE_GAP = 5

// **Four times dearer or cheaper is not a price, it is two different ways of
// counting.** The first real fortnight had ginger at 0.0046 against 4.64 and
// limes at 0.26 against 2.44: prices typed per gram and per lime, compared with
// an invoice read per kilo. Said as a percentage that is a hundred thousand per
// cent, which reads as the report being broken. So anything further apart than
// this is "cannot be compared", which is true, and says what to fix.
export const PLAUSIBLE = 4

export function outOfReason(a, b) {
    const x = num(a)
    const y = num(b)
    if (!x || !y) return true
    return x / y > PLAUSIBLE || y / x > PLAUSIBLE
}

const pctOf = (now, was) => (was ? Math.round(((now - was) / was) * 1000) / 10 : null)
const versionKey = (supplierId, code) => `${supplierId}|${code}`

// ---------------------------------------------------------------------------
// The deliveries
// ---------------------------------------------------------------------------

// Every line that is evidence of what something costs, in the order it was
// printed.
//
// Not a credit note's lines, which are money coming back at a price already
// charged. Not a delivery reversed in full, nor a line sent back in full, which
// were never bought. Not a code somebody said is not stock.
//
// **Per unit is worked out from the case and the pack**, not read from the
// stored unit price, because the pack is what somebody checked in the review
// and six tomato lines on the first fortnight carried the old week's unit
// price beside the new week's case price.
export function deliveriesFrom(lines, credits = []) {
    const gone = sentBack(lines || [], credits || [])
    return (lines || [])
        .filter(l => l.invoices?.document_type !== 'credit')
        .filter(l => !voidedBy(l.invoices, credits || []))
        .filter(l => !gone.has(l.id))
        .filter(l => l.decision !== 'ignored')
        .filter(l => l.supplier_code && num(l.price_per_case) > 0)
        .map(delivery)
        .sort(paperOrder)
        .map((d, at) => ({ ...d, at }))
}

function delivery(l) {
    // In the product's own unit through what one piece weighs, where the
    // product says: ten cabbages at about a kilo are ten kilos, whatever the
    // line was stored as before anybody said.
    const weighed = byPieceWeight(readPackSize(l.pack_size), l.products)
    const units = weighed ?? (l.units_per_case == null ? null : num(l.units_per_case))
    const perCase = num(l.price_per_case)
    const perUnit = units > 0
        ? perCase / units
        : (l.unit_price == null ? null : num(l.unit_price))
    return {
        id: l.id,
        invoiceId: l.invoice_id || l.invoices?.id || null,
        code: l.supplier_code,
        supplierId: l.invoices?.supplier_id || null,
        key: versionKey(l.invoices?.supplier_id || null, l.supplier_code),
        date: l.invoices?.invoice_date || null,
        number: l.invoices?.invoice_number || null,
        lineNo: num(l.line_no),
        productId: l.product_id || null,
        product: l.products || null,
        priceId: l.price_id || null,
        description: l.raw_description || '',
        pack: l.pack_size || null,
        units,
        perCase,
        perUnit,
        cases: num(l.cases),
        loose: num(l.units),
        // What the line came to on the paper, before VAT. The prices are
        // compared without VAT, so what a change was worth is too.
        cost: num(l.line_total),
    }
}

function paperOrder(a, b) {
    return String(a.date).localeCompare(String(b.date))
        || String(a.number).localeCompare(String(b.number))
        || a.lineNo - b.lineNo
        || String(a.id).localeCompare(String(b.id))
}

// The same price, whatever the pack. A case of ten cabbages and one cabbage
// on its own are the same price if one tenth of the case is the one, to what
// printing it to the cent can explain. See samePrice.
function sameAs(before, after) {
    return samePrice(
        { perCase: after.perCase, units: after.units },
        { price_per_case: before.perCase, units_per_case: before.units, price_per_unit: before.perUnit },
    )
}

// A code and every code it replaced.
//
// A supplier renumbering something is still the same version of it, so its
// price history carries on across the change: the first delivery under the
// new number is compared with the last under the old one.
//
// It also knows which group a code is in, for codes bought either way: see
// isUsual. One function carrying both, so nothing that asks one question can
// forget the other.
export function lineageOf(codes) {
    const replaced = new Map()
    const groups = new Map()
    for (const c of codes || []) {
        const key = versionKey(c.supplier_id, c.supplier_code)
        if (c.alternate_group) groups.set(key, c.alternate_group)
        if (!c.replaces_code) continue
        replaced.set(key, versionKey(c.supplier_id, c.replaces_code))
    }
    const lineage = key => {
        const out = [key]
        let at = replaced.get(key)
        while (at && !out.includes(at)) {
            out.push(at)
            at = replaced.get(at)
        }
        return out
    }
    lineage.groupOf = key => groups.get(key) || null
    return lineage
}

// What a thing is called on the report: its name in the Hub, or the
// supplier's words tidied up when it has not been matched to anything yet.
//
// Mended on the way, because lines read before the reader learnt to put the
// supplier's garbled apostrophes back still carry them.
export function nameOf(d) {
    if (d?.product?.name) return d.product.name
    return mend(d?.description || '')
        .toLowerCase()
        // A capital at the start of each word, and not after an apostrophe or
        // a digit: 9x50's, not 9X50'S.
        .replace(/(^|[^a-z0-9'])([a-z])/g, (_, before, c) => before + c.toUpperCase())
}

// What one unit is, said the way a person says a price.
export function unitWord(unit) {
    if (unit === 'KG') return 'a kg'
    if (unit === 'Litre') return 'a litre'
    return 'each'
}

function unitOf(d) {
    return unitWord(d?.product?.unit || readPackSize(d?.pack)?.unit || 'Units')
}

// Not something anybody eats: a drink, or anything kept with the packaging or
// the cleaning.
export function notFood(product) {
    return product?.category === 'drink' || ['Packaging', 'Cleaning'].includes(product?.section)
}

// **Recipes count it in kilos and the supplier sells it one at a time.** Then
// nothing on the paper says what one weighs, and any comparison is a guess.
// White Cabbage is the one on the first fortnight.
//
// Unless the product says what one weighs, which is the whole point of saying.
export function cannotCompare(d, product = d?.product) {
    if (d?.perUnit == null) return true
    if (num(product?.piece_weight) > 0) return false
    const printed = readPackSize(d?.pack)
    return printed?.unit === 'Units' && !!product?.unit && product.unit !== 'Units'
}

// ---------------------------------------------------------------------------
// The version usually bought
// ---------------------------------------------------------------------------

// The one recipes cost from: the preferred price, and the code on it.
export function usualFor(productId, prices, codes) {
    const row = (prices || []).find(p => p.product_id === productId && p.is_preferred)
    if (!row) return null
    const pointing = (codes || []).find(c => c.price_id === row.id && !c.ignored)
    const code = pointing?.supplier_code || row.supplier_code || null
    return {
        row,
        code,
        codeRowId: pointing?.id || null,
        key: code ? versionKey(row.supplier_id, code) : null,
        description: pointing?.last_description || null,
        pack: pointing?.pack_size || null,
        replaces: pointing?.replaces_code || null,
        group: pointing?.alternate_group || null,
    }
}

// **Sysco has been renumbering things**, mostly at the same price and not
// always. A new code with the same words and the same pack as the one usually
// bought is almost certainly that, and the report offers to say so, which
// joins the two into one version with one price history. It never does it on
// its own: the two green pepper codes read the same, and so do a five kilo box
// and five one kilo bags until the pack is looked at.
//
// Near enough the same words, not just alike: see SAME_WORDS. Anything less
// stays "bought as something else" and gets asked about after three in a row.
export function looksRenumbered(d, usual) {
    if (!usual?.description || !d?.description) return false
    if (d.supplierId && usual.row?.supplier_id && d.supplierId !== usual.row.supplier_id) return false
    if (usual.pack && d.pack && tidyPack(usual.pack) !== tidyPack(d.pack)) return false
    return sameWords(d.description, usual.description) >= SAME_WORDS
}

const tidyPack = p => String(p || '').toUpperCase().replace(/\s+/g, '')

// Whether this code came along after the usual one, which is which way round a
// renumbering goes: the newer number replaces the older.
//
// **Asked of the code table first**, which knows when each code was first seen
// whatever week the report is about. The deliveries in the report's own
// stretch only reach its last day, so on the report for an earlier week the
// new number has not come yet and the old one looks newer. The green peppers
// were joined the wrong way round on exactly that.
function isNewer(first, usual, all, lineage, codes) {
    const seen = key => (codes || []).find(c => versionKey(c.supplier_id, c.supplier_code) === key)?.first_seen_on || null
    const mine = seen(first.key)
    const theirs = usual.key ? seen(usual.key) : null
    if (mine && theirs && mine !== theirs) return mine > theirs
    const usualFirst = all.find(d => d.productId === first.productId && isUsual(d, usual, lineage))
    return !usualFirst || usualFirst.at < first.at
}

// **A code in the same group as the usual one is the usual one**: the green
// peppers come as 483508 or 5018758 depending on what Sysco has, and neither
// is ever bought instead of the other.
function isUsual(d, usual, lineage) {
    if (!usual) return false
    if (d.priceId && d.priceId === usual.row.id) return true
    if (!usual.key) return false
    if (usual.group && lineage.groupOf?.(d.key) === usual.group) return true
    return lineage(d.key).includes(usual.key) || lineage(usual.key).includes(d.key)
}

function lastOf(list, test) {
    for (let i = list.length - 1; i >= 0; i--) if (test(list[i])) return list[i]
    return null
}

// ---------------------------------------------------------------------------
// Same product, new price
// ---------------------------------------------------------------------------

// How much a move came to on each thing bought at the new price: "6 cases,
// €3.15 less each", "36 kg, €0.53 less a kg". Nothing to say when nothing was
// bought at it, and only the count when the difference on one rounds to
// nothing, because a figure past two places is not one anybody reads.
export function eachWords({ quantity, each, unit, mixed = false }) {
    if (!(quantity > 0) || each == null) return ''
    const q = Math.round(quantity * 100) / 100
    const many = q !== 1
    const count = unit === 'a case' ? `${fmtQty(q)} ${many ? 'cases' : 'case'}`
        : unit === 'a kg' ? `${fmtQty(q)} kg`
            : unit === 'a litre' ? `${fmtQty(q)} ${many ? 'litres' : 'litre'}`
                : `${fmtQty(q)} ${many ? 'units' : 'unit'}`
    if (Math.abs(each) < 0.005) return `${count} at the new price`
    const per = unit === 'a case' || unit === 'each' ? 'each' : unit
    return `${count}, ${fmtMoney(Math.abs(each))} ${each > 0 ? 'more' : 'less'} ${per}`
        + (mixed ? ' on average' : '')
}

// Every code whose price moved this week, against its own last delivery.
//
// Several deliveries in a week are one story: where it started and where it
// ended, dated by the first invoice that changed it. A price that went up and
// came back down inside the week is not news.
//
// What it was worth is what the week's deliveries would have cost at the old
// price, the difference and nothing else.
export function priceMoves(all, { weekStart, weekEnd, codes = [] }) {
    const lineage = lineageOf(codes)
    const inWeek = all.filter(d => d.date >= weekStart && d.date <= weekEnd)
    const byVersion = new Map()
    for (const d of inWeek) {
        if (!byVersion.has(d.key)) byVersion.set(d.key, [])
        byVersion.get(d.key).push(d)
    }

    const out = []
    const raw = new Map()
    for (const [key, week] of byVersion) {
        const family = lineage(key)
        const group = lineage.groupOf?.(key) || null
        const before = lastOf(all, d => d.at < week[0].at && family.includes(d.key))
        const series = before ? [before, ...week] : week

        let changedAt = null
        for (let i = 1; i < series.length; i++) {
            if (!sameAs(series[i - 1], series[i])) { changedAt = i; break }
        }
        if (changedAt == null) continue

        const from = series[0]
        const to = series[series.length - 1]
        if (sameAs(from, to) || from.perUnit == null || to.perUnit == null) continue

        const samePack = from.units != null && to.units != null && Math.abs(from.units - to.units) < 0.0005
        const change = pctOf(to.perUnit, from.perUnit)
        const effect = round2(week.reduce((t, d) => (
            t + (d.perUnit ? d.cost * (1 - from.perUnit / d.perUnit) : 0)
        ), 0))

        // What it came to on each one, and on how many.
        //
        // Only the deliveries at a new price carry any of it. The tomatoes came
        // on the 13th and 16th at 11.75 and on the 17th and 19th at 8.60:
        // fourteen cases that week, six of them cheaper, and the eight before
        // the change saved nothing. The report said fourteen cases beside a
        // saving of six, and the two did not multiply out. Now the count is the
        // six and the each is the saving over them, so they always do; a week
        // with more than one new price gives the average and says so. In
        // cases when both packs are the same and nothing came loose, otherwise
        // in the product's own unit.
        const moved = week.filter(d => !sameAs(from, d))
        const byCase = samePack && moved.every(d => !d.loose)
        const quantity = byCase
            ? moved.reduce((t, d) => t + d.cases, 0)
            : moved.reduce((t, d) => t + (d.perUnit ? d.cost / d.perUnit : 0), 0)
        const split = eachWords({
            quantity,
            each: quantity > 0 ? effect / quantity : null,
            unit: byCase ? 'a case' : unitOf(to),
            mixed: new Set(moved.map(d => round4(d.perUnit))).size > 1,
        })

        raw.set(key, {
            moved,
            byCase,
            unit: byCase ? 'a case' : unitOf(to),
            // What the week's deliveries would have cost at the old price,
            // for the change of codes shown together. See together.
            old: week.reduce((t, d) => t + (d.perUnit ? d.cost * (from.perUnit / d.perUnit) : 0), 0),
        })
        out.push({
            // More likely a pack read wrong on one of the two than a real
            // price. Kept, so it can be said and checked, but never added up.
            doubtful: outOfReason(to.perUnit, from.perUnit),
            key,
            group,
            code: to.code,
            productId: to.productId,
            name: nameOf(to),
            pack: to.pack,
            per: samePack ? 'a case' : unitOf(to),
            was: samePack ? round2(from.perCase) : round4(from.perUnit),
            now: samePack ? round2(to.perCase) : round4(to.perUnit),
            change,
            up: change > 0,
            effect,
            // "6 cases, €3.15 less each", in words here because the mail
            // cannot import this file and must say exactly what the page says.
            split,
            deliveries: week.length,
            on: series[changedAt].date,
            invoice: series[changedAt].number,
            since: before?.date || null,
            // Every delivery of it over the last eight weeks, so the chart
            // shows where the price has been and not only last time and now
            // (his, 7 October). The third figure is one for this week's.
            series: historyOf(all, d => family.includes(d.key) || (!!group && lineage.groupOf(d.key) === group),
                weekStart, weekEnd),
        })
    }

    const byChange = (a, b) => Math.abs(b.effect) - Math.abs(a.effect) || Math.abs(b.change) - Math.abs(a.change)
    return together(out.sort(byChange), raw).sort(byChange)
}

// How far back the chart on a price move goes.
export const MOVE_WEEKS = 8

function historyOf(all, mine, weekStart, weekEnd) {
    const from = addDays(weekEnd, -(MOVE_WEEKS * 7 - 1))
    return all
        .filter(d => d.date >= from && d.date <= weekEnd && d.perUnit != null && mine(d))
        .map(d => [d.date, round4(d.perUnit), d.date >= weekStart ? 1 : 0])
}

// **Codes bought either way are one product on the report** (his, 7 October).
// The green peppers come as 483508 or 5018758, both went up that week, and
// the report said Green Peppers twice. Shown as one: the money added up, the
// change as what the week paid over what it would have at the old prices, and
// what each code went from and to said in words, because the two can be priced
// differently. One that looks like a pack read wrong stays on its own.
function together(moves, raw) {
    const out = []
    const groups = new Map()
    for (const m of moves) {
        if (!m.group || m.doubtful) { out.push(m); continue }
        const key = `${m.productId}|${m.group}`
        if (!groups.has(key)) { groups.set(key, []); out.push(key) }
        groups.get(key).push(m)
    }
    return out.map(m => (typeof m === 'string' ? oneRow(groups.get(m), raw) : m))
}

function oneRow(moves, raw) {
    if (moves.length === 1) return moves[0]
    const [first] = moves
    const parts = moves.map(m => raw.get(m.key))
    const effect = round2(moves.reduce((t, m) => t + m.effect, 0))
    const old = parts.reduce((t, r) => t + r.old, 0)
    const moved = parts.flatMap(r => r.moved)
    const byCase = parts.every(r => r.byCase) && new Set(moves.map(m => m.per)).size === 1
    const quantity = byCase
        ? moved.reduce((t, d) => t + d.cases, 0)
        : moved.reduce((t, d) => t + (d.perUnit ? d.cost / d.perUnit : 0), 0)
    const earliest = moves.reduce((a, m) => (m.on < a.on ? m : a), first)
    const series = moves.flatMap(m => m.series)
        .filter((p, i, list) => list.findIndex(q => q[0] === p[0] && q[1] === p[1]) === i)
        .sort((a, b) => a[0].localeCompare(b[0]))
    const change = old > 0 ? Math.round((effect / old) * 1000) / 10 : first.change
    return {
        ...first,
        key: `${first.productId}|${first.group}`,
        code: moves.map(m => m.code).join(', '),
        codes: moves.map(m => m.code),
        pack: new Set(moves.map(m => m.pack)).size === 1 ? first.pack : null,
        change,
        up: change > 0,
        effect,
        split: eachWords({
            quantity,
            each: quantity > 0 ? effect / quantity : null,
            unit: byCase ? 'a case' : parts[0].unit,
            mixed: true,
        }),
        // Each code's own, in words here because the mail says the same.
        prices: moves.map(m => `${fmtMoney(m.was)} to ${fmtMoney(m.now)} ${m.per} on ${m.code}`).join(', '),
        deliveries: moves.reduce((t, m) => t + m.deliveries, 0),
        on: earliest.on,
        invoice: earliest.invoice,
        since: moves.map(m => m.since).filter(Boolean).sort()[0] || null,
        series,
    }
}

// ---------------------------------------------------------------------------
// Bought as something else
// ---------------------------------------------------------------------------

// Every product bought this week under a code that is not the usual one.
//
// Compared per unit with the usual version's last delivery, or with what
// recipes cost it at when the usual one has never come on an invoice. Never a
// price rise: the plain wraps costing more than the Santa Maria tortillas is a
// different thing being dearer, not the tortillas going up.
export function switchesIn(all, { weekStart, weekEnd, prices = [], codes = [] }) {
    const lineage = lineageOf(codes)
    const groups = new Map()

    for (const d of all) {
        if (d.date < weekStart || d.date > weekEnd || !d.productId) continue
        const usual = usualFor(d.productId, prices, codes)
        if (!usual || isUsual(d, usual, lineage)) continue
        const key = `${d.productId}|${d.key}`
        if (!groups.has(key)) groups.set(key, { usual, list: [] })
        groups.get(key).list.push(d)
    }

    const out = []
    for (const { usual, list } of groups.values()) {
        const last = list[list.length - 1]
        const usualLast = lastOf(all, d => d.at < last.at && d.productId === last.productId && isUsual(d, usual, lineage))
        const usualPer = usualLast?.perUnit ?? (usual.row.price_per_unit == null ? null : num(usual.row.price_per_unit))
        const weight = cannotCompare(last)
        const cannot = weight || usualPer == null || outOfReason(last.perUnit, usualPer)

        // **A drink, a box or a cleaning product at the same price is not
        // news.** Ballygowan instead of River Rock at the same price told
        // nobody anything. Food is still listed at the same price, because a
        // different product can carry different allergens.
        const change = cannot ? null : pctOf(last.perUnit, usualPer)
        if (change != null && Math.abs(change) < 0.05 && notFood(last.product)) continue
        const codeRow = (codes || []).find(c => (
            versionKey(c.supplier_id, c.supplier_code) === last.key && !c.ignored
        ))
        const own = codeRow?.price_id ? (prices || []).find(p => p.id === codeRow.price_id) : null
        out.push({
            productId: last.productId,
            name: nameOf(last),
            code: last.code,
            codeRowId: codeRow?.id || null,
            ownPriceId: own?.id || null,
            // Joining folds the code's own price away, which is only safe for
            // a price of this product that nothing is costed from.
            ownPriceOk: !codeRow?.price_id || (!!own && own.product_id === last.productId && !own.is_preferred),
            replaces: codeRow?.replaces_code || null,
            usualReplaces: usual.replaces,
            group: codeRow?.alternate_group || null,
            usualGroup: usual.group,
            renumbered: looksRenumbered(last, usual),
            newer: isNewer(list[0], usual, all, lineage, codes),
            why: cannot ? (weight ? 'weight' : 'units') : null,
            usualPriceId: usual.row.id,
            usualCodeRowId: usual.codeRowId,
            bought: nameOf({ description: last.description }),
            usualCode: usual.code,
            usualName: usual.description
                ? nameOf({ description: usual.description })
                : 'the one recipes cost from',
            usualFrom: usualLast ? 'delivery' : 'recipes',
            usualPer: usualPer == null ? null : round4(usualPer),
            per: round4(last.perUnit),
            unit: unitOf(last),
            change,
            effect: cannot ? 0 : round2(list.reduce((t, d) => (
                t + (d.perUnit ? d.cost * (1 - usualPer / d.perUnit) : 0)
            ), 0)),
            cannot,
            deliveries: list.length,
            on: list[0].date,
            invoice: list[0].number,
        })
    }

    return out.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))
}

// ---------------------------------------------------------------------------
// Three in a row
// ---------------------------------------------------------------------------

// A product whose last three deliveries were all the same other version.
//
// By delivery rather than by line: two lines of it on one invoice are one
// delivery, and an invoice carrying the usual one as well breaks the run. Only
// asked while one of the three is this week's, so it is a question about now.
export function usualSuggestions(all, { weekStart, weekEnd, prices = [], codes = [] }) {
    const lineage = lineageOf(codes)
    const byProduct = new Map()
    for (const d of all) {
        if (!d.productId || d.date > weekEnd) continue
        if (!byProduct.has(d.productId)) byProduct.set(d.productId, [])
        byProduct.get(d.productId).push(d)
    }

    const out = []
    for (const [productId, list] of byProduct) {
        const usual = usualFor(productId, prices, codes)
        if (!usual) continue

        const visits = []
        for (const d of list) {
            const last = visits[visits.length - 1]
            if (last && last.invoiceId === d.invoiceId) last.items.push(d)
            else visits.push({ invoiceId: d.invoiceId, date: d.date, items: [d] })
        }
        const recent = visits.slice(-IN_A_ROW)
        if (recent.length < IN_A_ROW || !recent.some(v => v.date >= weekStart)) continue

        const keys = new Set(recent.flatMap(v => v.items.map(d => d.key)))
        if (keys.size !== 1) continue
        const [key] = keys
        const sample = recent[recent.length - 1].items[0]
        if (isUsual(sample, usual, lineage)) continue
        // Never offered when the two are not counted the same way. Ginger
        // typed at a price a gram and bought by the kilo would move every
        // recipe a thousandfold.
        const recipe = usual.row.price_per_unit == null ? null : num(usual.row.price_per_unit)
        if (cannotCompare(sample) || outOfReason(sample.perUnit, recipe)) continue

        const codeRow = (codes || []).find(c => (
            versionKey(c.supplier_id, c.supplier_code) === key && c.price_id && !c.ignored
        ))
        const row = codeRow && (prices || []).find(p => p.id === codeRow.price_id)
        if (!row || row.id === usual.row.id || row.product_id !== productId || row.is_preferred) continue
        // Recipes would cost from this row's own price, so it has to have one.
        if (row.price_per_unit == null || !num(row.price_per_unit)) continue

        out.push({
            productId,
            name: nameOf(sample),
            code: sample.code,
            codeRowId: codeRow.id,
            ownPriceId: row.id,
            ownPriceOk: true,
            replaces: codeRow.replaces_code || null,
            usualReplaces: usual.replaces,
            group: codeRow.alternate_group || null,
            usualGroup: usual.group,
            rowPer: round4(row.price_per_unit),
            renumbered: looksRenumbered(sample, usual),
            newer: isNewer(recent[0].items[0], usual, all, lineage, codes),
            usualPriceId: usual.row.id,
            usualCodeRowId: usual.codeRowId,
            bought: nameOf({ description: sample.description }),
            usualCode: usual.code,
            usualName: usual.description ? nameOf({ description: usual.description }) : null,
            priceId: row.id,
            fromPriceId: usual.row.id,
            per: round4(sample.perUnit),
            recipe: usual.row.price_per_unit == null ? null : round4(usual.row.price_per_unit),
            unit: unitOf(sample),
        })
    }
    return out
}

// ---------------------------------------------------------------------------
// Recipes not costing what we pay
// ---------------------------------------------------------------------------

// Every product whose recipes are costed further from what was last paid for
// the usual version than the restaurant allows.
//
// Every product with a delivery in the last half year, not only this week's,
// because this is the part of the section that never goes quiet: a price rise
// somebody decided not to cost from stays here until recipes catch up or the
// price comes back. What the week paid over or under is only for what came
// this week.
//
// One that cannot be compared is said, rather than left out, but only in a
// week it was bought: the answer is to fix how the product is counted, and
// saying so every week would be noise.
export function recipeGaps(all, { weekStart, weekEnd, prices = [], codes = [], threshold = DEFAULT_RECIPE_GAP }) {
    const lineage = lineageOf(codes)
    const productIds = [...new Set(all.filter(d => d.productId && d.date <= weekEnd).map(d => d.productId))]

    const out = []
    for (const productId of productIds) {
        const usual = usualFor(productId, prices, codes)
        if (!usual) continue
        const mine = all.filter(d => d.productId === productId && d.date <= weekEnd && isUsual(d, usual, lineage))
        const last = mine[mine.length - 1]
        if (!last) continue

        // **A group bought either way is checked against what it cost on
        // average**, weighted by how much of each came, over the last four
        // weeks. Against the last delivery, buying one then the other would
        // put the product on the report and off it again.
        const lately = usual.group
            ? mine.filter(d => d.date >= addDays(weekEnd, -(GROUP_DAYS - 1)) && d.perUnit > 0 && d.cost > 0)
            : []
        const averaged = lately.length > 1
            ? lately.reduce((t, d) => t + d.cost, 0) / lately.reduce((t, d) => t + d.cost / d.perUnit, 0)
            : null

        const rowUnits = num(usual.row.units_per_case)
        const recipe = usual.row.price_per_unit != null
            ? num(usual.row.price_per_unit)
            : (rowUnits > 0 ? num(usual.row.price_per_case) / rowUnits : 0)
        if (!recipe) continue

        const thisWeek = mine.filter(d => d.date >= weekStart)
        const base = {
            productId,
            name: nameOf(last),
            code: usual.code,
            priceId: usual.row.id,
            lineId: last.id,
            paidOn: last.date,
            invoice: last.number,
            unit: unitOf(last),
            recipe: round4(recipe),
            paid: round4(averaged ?? last.perUnit),
            // How many deliveries the average is over, and since when, or
            // nothing when it is the last delivery on its own.
            averaged: averaged == null ? null : { deliveries: lately.length, since: lately[0].date },
        }

        if (cannotCompare(last) || outOfReason(averaged ?? last.perUnit, recipe)) {
            const why = cannotCompare(last) ? 'weight' : 'units'
            if (thisWeek.length) out.push({ ...base, state: 'cannot', why, gap: null, effect: 0 })
            continue
        }

        const paid = averaged ?? last.perUnit
        const gap = pctOf(paid, recipe)
        if (Math.abs(gap) <= num(threshold)) continue

        out.push({
            ...base,
            state: gap > 0 ? 'behind' : 'high',
            gap,
            effect: round2(thisWeek.reduce((t, d) => (
                t + (d.perUnit ? d.cost * (1 - recipe / d.perUnit) : 0)
            ), 0)),
            // What the price row becomes if recipes are to cost from this:
            // the case exactly as printed when it is the same pack, otherwise
            // the unit price carried up to the row's own pack.
            newCase: rowUnits <= 0
                ? null
                : averaged == null && last.units != null && Math.abs(last.units - rowUnits) < 0.0005
                    ? round2(last.perCase)
                    : round2(paid * rowUnits),
        })
    }

    const order = { behind: 0, high: 0, cannot: 1 }
    return out.sort((a, b) => order[a.state] - order[b.state] || Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0))
}

// ---------------------------------------------------------------------------
// Came back, and why
// ---------------------------------------------------------------------------

// Every credit note dated this week, with why.
//
// The reason is the claim logged at the door that the credit settled. Where
// nothing was logged, or the credit gave back more than was asked, that part
// has no reason until somebody gives it one afterwards, and giving it one is a
// label on the credit note and nothing else: it moves no money and no week.
export function cameBack(credits, claims, { weekStart, weekEnd, invoices = [] }) {
    const byId = new Map((invoices || []).map(i => [i.id, i]))
    return (credits || [])
        .filter(c => c.invoice_date >= weekStart && c.invoice_date <= weekEnd)
        .sort((a, b) => String(a.invoice_date).localeCompare(String(b.invoice_date))
            || String(a.invoice_number).localeCompare(String(b.invoice_number)))
        .map(credit => {
            const money = round2(Math.abs(num(credit.total_amount)))
            const logged = (claims || []).filter(c => (
                c.credit_invoice_id === credit.id && c.status !== 'void' && c.kind !== NOT_LOGGED.value
            ))

            const parts = new Map()
            let explained = 0
            for (const claim of logged) {
                const got = Math.min(num(claim.credited_amount), money - explained)
                if (got <= 0.004) continue
                parts.set(claim.kind, round2(num(parts.get(claim.kind)) + got))
                explained = round2(explained + got)
            }
            const rest = round2(money - explained)
            if (rest > 0.004) {
                const kind = credit.credit_reason || NOT_LOGGED.value
                parts.set(kind, round2(num(parts.get(kind)) + rest))
            }

            const against = byId.get(credit.credit_of_invoice_id) || null
            const whole = !!against && !!voidedBy(against, [credit])
            const lines = (credit.invoice_lines || []).map(l => nameOf({
                product: l.products, description: l.raw_description,
            }))
            const what = whole
                ? `The whole delivery of ${dayMonth(against.invoice_date)}`
                : lines.length
                    ? lines.slice(0, 3).join(', ') + (lines.length > 3 ? ` and ${lines.length - 3} more` : '')
                    : 'A credit note'

            return {
                id: credit.id,
                number: credit.invoice_number || null,
                date: credit.invoice_date,
                against: against ? { number: against.invoice_number || null, date: against.invoice_date } : null,
                whole,
                what,
                money,
                parts: [...parts.entries()].map(([kind, amount]) => ({
                    kind, label: claimKind(kind).label, colour: claimKind(kind).colour, money: amount,
                })),
                logged: logged.length > 0,
                // Money on it nobody has said anything about yet.
                unexplained: rest > 0.004 && !credit.credit_reason ? rest : 0,
                given: credit.credit_reason || null,
            }
        })
}

// What is still owed, oldest first. Every open claim, not only this week's:
// one raised a fortnight ago and still unpaid is the one worth putting in front
// of somebody.
export function stillOwed(claims) {
    return (claims || [])
        .filter(claimIsOpen)
        .sort((a, b) => String(a.raised_on).localeCompare(String(b.raised_on)))
        .map(c => ({
            id: c.id,
            what: c.what || 'A delivery problem',
            kind: c.kind,
            label: claimKind(c.kind).label,
            colour: claimKind(c.kind).colour,
            money: claimBalance(c),
            since: c.raised_on,
            docket: c.docket_number || null,
        }))
}

// ---------------------------------------------------------------------------
// New to the Hub
// ---------------------------------------------------------------------------

// Codes delivered for the first time this week. A handful in a normal week;
// the first week of documents is every code there is.
export function newCodes(all, { weekStart, weekEnd, codes = [] }) {
    const lineage = lineageOf(codes)
    const firstSeen = new Map((codes || []).map(c => [versionKey(c.supplier_id, c.supplier_code), c.first_seen_on]))
    const out = new Map()
    for (const d of all) {
        if (d.date < weekStart || d.date > weekEnd || out.has(d.key)) continue
        const family = lineage(d.key)
        if (family.length > 1) continue
        if (all.some(e => e.at < d.at && e.key === d.key)) continue
        const seen = firstSeen.get(d.key)
        if (seen && seen < weekStart) continue
        out.set(d.key, {
            code: d.code,
            name: nameOf(d),
            matched: !!d.productId,
            on: d.date,
            invoice: d.number,
        })
    }
    return [...out.values()]
}

// ---------------------------------------------------------------------------
// The whole section
// ---------------------------------------------------------------------------

// Everything the section says, as it will be frozen.
//
// `lines` are the invoice lines from half a year before the week to its end,
// `credits` every credit note in the same stretch with its own lines,
// `invoices` the invoices those credits are against, `claims` every claim
// open or settled, and `threshold` the restaurant's own.
// ---------------------------------------------------------------------------
// Where it was read from
// ---------------------------------------------------------------------------

// Which suppliers the section was read from, and which only have a total.
//
// Only a document read line by line can say anything about a price. The rest
// are totals somebody typed, and on the first real week that was four
// suppliers and €2,258.43, two fifths of the invoices, with nothing on the
// report saying so. So the section says where it came from before anything
// else, his choice on 27 September over a section per supplier or a supplier
// on every row. A document with lines is one that was read, whatever the
// supplier, so a second supplier the reader learns is one more name here.
//
// `documents` is every invoice and credit note dated in the week, with its
// supplier's name and a count of its lines.
const docCount = (invoices, credits) => [
    invoices ? `${invoices} ${invoices === 1 ? 'invoice' : 'invoices'}` : '',
    credits ? `${credits} credit ${credits === 1 ? 'note' : 'notes'}` : '',
].filter(Boolean).join(' and ')

export function readFrom(documents = []) {
    const read = new Map()
    const typed = new Map()
    for (const d of documents || []) {
        const name = d.suppliers?.name || 'A supplier with no name'
        const into = num(d.invoice_lines?.[0]?.count) > 0 ? read : typed
        const s = into.get(name) || { name, invoices: 0, credits: 0, money: 0, withoutCodes: !!d.suppliers?.works_without_codes }
        if (d.document_type === 'credit') s.credits += 1
        else s.invoices += 1
        s.money = round2(s.money + num(d.total_amount))
        into.set(name, s)
    }
    const byMoney = (a, b) => Math.abs(b.money) - Math.abs(a.money) || a.name.localeCompare(b.name)
    const readList = [...read.values()].sort(byMoney)
    const typedList = [...typed.values()].sort((a, b) => a.name.localeCompare(b.name))

    const first = readList.length
        ? namesList(readList.map(s => `${s.name} (${docCount(s.invoices, s.credits)})`)) + '.'
        : (typedList.length ? 'none of this week\'s invoices.' : 'no invoices this week.')

    let second = ''
    if (typedList.length) {
        const one = typedList.length === 1
        const invoices = typedList.reduce((t, s) => t + s.invoices, 0)
        const credits = typedList.reduce((t, s) => t + s.credits, 0)
        const money = round2(typedList.reduce((t, s) => t + s.money, 0))
        const single = invoices + credits === 1
        second = ` ${namesList(typedList.map(s => s.name))} ${one ? 'was' : 'were'} typed in as `
            + `${single ? 'a total' : 'totals'} (${docCount(invoices, credits)}, ${fmtMoney(money)}), `
            + `so ${one ? 'its' : 'their'} prices are not checked here.`
    }

    return {
        read: readList,
        typed: typedList,
        words: `Read from: ${first}${second}`,
        // Only what was read, for the page once Not checked says the rest.
        readWords: `Read from: ${first}`,
    }
}

// ---------------------------------------------------------------------------
// The brand's recommendations
// ---------------------------------------------------------------------------

// What was bought this week that the brand does not recommend, each product
// once: what was bought beside what the brand recommends, each at its price
// per unit here, so 1 kg bags and a 5 kg case are both a price a kg (layout
// D, his pick of 4 October).
//
// Only lines read off an invoice can say which version was bought. Not a
// product the brand leaves free (recommends any), nor one with nothing
// recommended yet, which would have nothing to set beside it. `versions` are
// the brand's versions of the products bought; `prices` this restaurant's,
// which say which version each line was bought as.
//
// A line waiting on a review is said under that, not here as well.
export function notAsRecommended(all, { weekStart, weekEnd, prices = [], versions = [], requests = [] }) {
    const priceById = new Map((prices || []).map(p => [p.id, p]))
    const waiting = new Set((requests || []).filter(r => r.supplier_code && !r.answer)
        .map(r => versionKey(r.supplier_id, r.supplier_code)))
    const out = new Map()
    for (const d of all) {
        if (d.date < weekStart || d.date > weekEnd || !d.productId || !d.priceId) continue
        if (waiting.has(d.key)) continue
        if (d.product?.recommends === 'any') continue
        const bought = (versions || []).find(v => v.id === priceById.get(d.priceId)?.version_id)
        if (!bought || bought.is_recommended) continue
        const recommended = (versions || [])
            .filter(v => v.product_id === d.productId && v.is_recommended && v.is_active !== false)
        if (!recommended.length) continue

        const seen = out.get(d.productId)
        if (seen) {
            seen.cases += d.cases
            seen.money = round2(seen.money + d.cost)
            continue
        }
        // The recommended version this restaurant has a price for, when one
        // does, so its price can stand beside what was paid.
        const priced = recommended
            .map(v => ({ v, price: (prices || []).find(p => p.version_id === v.id) }))
        const best = priced.find(x => x.price) || priced[0]
        const name = d.product?.name || nameOf(d)
        out.set(d.productId, {
            name,
            unit: unitOf(d),
            // Not a per piece price shown as a price a kg.
            bought: { name: bought.name || nameOf({ description: d.description }), per: cannotCompare(d) ? null : d.perUnit },
            recommended: {
                name: best.v.name || name,
                per: best.price && num(best.price.price_per_unit) > 0 ? num(best.price.price_per_unit) : null,
            },
            others: recommended.length - 1,
            cases: d.cases,
            money: round2(d.cost),
        })
    }
    return [...out.values()].sort((a, b) => b.money - a.money || a.name.localeCompare(b.name))
}

// What was bought this week that is waiting on a review: the lines carrying a
// code a store manager sent for review, with when it was sent. It does not
// hold the report (his answer, 3 October), so it is said here instead.
export function waitingOnReview(all, requests = [], { weekStart, weekEnd }) {
    return (requests || [])
        .filter(r => r.supplier_code && !r.answer)
        .map(r => {
            const key = versionKey(r.supplier_id, r.supplier_code)
            const lines = all.filter(d => d.key === key && d.date >= weekStart && d.date <= weekEnd)
            if (!lines.length) return null
            return {
                name: r.name || nameOf({ description: r.description || lines[0].description }),
                cases: lines.reduce((t, d) => t + d.cases, 0),
                loose: lines.reduce((t, d) => t + d.loose, 0),
                money: round2(lines.reduce((t, d) => t + d.cost, 0)),
                sent: stampDay(r.sent_at),
            }
        })
        .filter(Boolean)
        .sort((a, b) => b.money - a.money || a.name.localeCompare(b.name))
}

// The money this week that nothing here could check, supplier by supplier:
// typed in as a total, either because the supplier works without codes or
// because its invoices are not read line by line yet.
export function notChecked(read) {
    return (read?.typed || []).map(s => ({
        name: s.name,
        money: s.money,
        why: s.withoutCodes ? 'works without codes' : 'not read line by line yet',
    }))
}

// **Read against the prices as they stood at the end of the week**, when
// `events` are given, so deciding next week's invoices cannot change what this
// week says (his, 5 October). `prices` are today's: the buttons on the
// decisions change today's prices, so a decision that today's prices have
// already moved past says so instead of offering one. See withSince.
export function priceWeek({
    weekStart, weekEnd, lines = [], credits = [], invoices = [], prices = [], codes = [], claims = [],
    documents = [], versions = [], requests = [], events = null, threshold = DEFAULT_RECIPE_GAP, today = null,
}) {
    const all = deliveriesFrom(lines, credits)
    const then = events ? pricesAsAt(prices, events, weekEnd) : prices
    const scope = { weekStart, weekEnd, prices: then, codes, threshold }

    const everyMove = priceMoves(all, scope)
    const moves = everyMove.filter(m => !m.doubtful)
    const doubtful = everyMove.filter(m => m.doubtful)
    const switches = withSince(switchesIn(all, scope), 'switch', prices, codes)
    // One fixed since, so recipes cost now what the week paid, is not said
    // at all (his, 7 October): only a costing still out of line is news.
    const recipes = withSince(recipeGaps(all, scope), 'recipe', prices, codes)
        .filter(r => !fixedSince(r, threshold))
    const suggestions = withSince(usualSuggestions(all, scope), 'usual', prices, codes)
    const back = cameBack(credits, claims, { weekStart, weekEnd, invoices })
    const owed = stillOwed(claims)
    // `invoices` also carries the documents this week's claims were put
    // against, so each one knows the day its delivery landed.
    const earlier = fromEarlierWeeks(claims, invoices, weekStart)
    const fresh = newCodes(all, scope)
    const read = readFrom(documents)
    const brand = notAsRecommended(all, { weekStart, weekEnd, prices: then, versions, requests })
    const waiting = waitingOnReview(all, requests, { weekStart, weekEnd })
    const unchecked = notChecked(read)

    const section = {
        weekStart,
        weekEnd,
        // As at the end of the week, once it is over.
        checkedOn: events && today && today > weekEnd ? weekEnd : today,
        threshold: num(threshold),
        readFrom: read,
        notRecommended: brand,
        waiting,
        notChecked: unchecked,
        moves,
        doubtful,
        switches,
        recipes,
        suggestions,
        back,
        owed,
        earlier,
        newCodes: fresh,
        reasons: reasonsOf(back),
        totals: {
            moves: round2(moves.reduce((t, m) => t + m.effect, 0)),
            movesUp: moves.filter(m => m.up).length,
            movesDown: moves.filter(m => !m.up).length,
            switches: round2(switches.reduce((t, s) => t + s.effect, 0)),
            recipes: recipes.filter(r => r.state !== 'cannot').length,
            cannot: recipes.filter(r => r.state === 'cannot').length,
            back: round2(back.reduce((t, b) => t + b.money, 0)),
            owed: round2(owed.reduce((t, o) => t + num(o.money), 0)),
            owedCount: owed.length,
            earlier: round2(earlier.reduce((t, e) => t + e.money, 0)),
            earlierCount: earlier.length,
            newCodes: fresh.length,
            notRecommended: brand.length,
            waiting: round2(waiting.reduce((t, w) => t + w.money, 0)),
            notChecked: round2(unchecked.reduce((t, u) => t + u.money, 0)),
        },
    }
    return { ...section, words: priceWords(section) }
}

// What recipes cost a product from today, per unit.
function costsNow(productId, prices, codes) {
    const usual = usualFor(productId, prices, codes)
    if (!usual) return null
    const units = num(usual.row.units_per_case)
    const per = usual.row.price_per_unit != null
        ? num(usual.row.price_per_unit)
        : (units > 0 ? num(usual.row.price_per_case) / units : null)
    return { id: usual.row.id, per: per == null ? null : round4(per) }
}

// Whether a decision still means what it says, against today's prices.
//
// The section is read as at the end of its week and the buttons change today's
// prices. Costing week 38's recipes from what week 38 paid, after week 39 moved
// them on, would pull them back, so a decision today's prices have moved past
// carries `since`, what recipes cost it at now and whether the one bought is
// the usual one now, and is not asked about. A switch whose usual one has
// changed since the same, or joining codes would join it to the old one.
function withSince(items, kind, prices, codes) {
    return items.map(item => {
        const now = costsNow(item.productId, prices, codes)
        const moved = kind === 'recipe'
            ? !now || now.id !== item.priceId || now.per !== item.recipe
            : kind === 'switch'
                ? !now || now.id !== item.usualPriceId
                : !now || now.id !== item.fromPriceId || per4Of(prices, item.fromPriceId) !== item.recipe
                    || per4Of(prices, item.priceId) !== item.rowPer
        const usual = !!now && now.id === (kind === 'switch' ? item.ownPriceId : item.priceId)
        return moved ? { ...item, since: { per: now?.per ?? null, usual } } : item
    })
}

// Whether recipes cost now what the week paid, near enough.
function fixedSince(item, threshold) {
    if (!item.since || item.since.per == null || item.state === 'cannot') return false
    return Math.abs(pctOf(item.paid, item.since.per)) <= num(threshold)
}

const per4Of = (prices, id) => {
    const row = (prices || []).find(p => p.id === id)
    return row?.price_per_unit == null ? null : round4(row.price_per_unit)
}

// What came back, by reason, biggest first. One bar on the page and one list
// in the mail.
export function reasonsOf(back) {
    const by = new Map()
    for (const row of back || []) {
        for (const part of row.parts) {
            const seen = by.get(part.kind) || { kind: part.kind, label: part.label, colour: part.colour, money: 0 }
            seen.money = round2(seen.money + part.money)
            by.set(part.kind, seen)
        }
    }
    return [...by.values()].sort((a, b) => b.money - a.money)
}

// The credit notes under each reason, biggest reason first, each with the part
// of it that reason covers, so the reason is said once with its total rather
// than on every line (his, 4 October). A credit note with two reasons is under
// both. The mail has its own copy, kept equal by a test.
export function backByReason(reasons, back) {
    return (reasons || []).map(reason => ({
        reason,
        rows: (back || []).flatMap(b => b.parts
            .filter(part => part.kind === reason.kind)
            .map(part => ({ ...b, money: part.money, whole: b.money }))),
    }))
}

// What somebody has to decide, for the box at the top.
//
// Recipes that are off, a version bought three times in a row, and a credit
// with nobody saying why. Nothing in it has to be answered this week: leave it
// and it is on next week's report too.
//
// Not one today's prices have moved past (`since`): there is nothing left to
// decide about it from this week, and its button would pull today's back.
export function decisionsFrom(section) {
    if (!section) return []
    const suggestions = (section.suggestions || []).filter(s => !s.since)
    return [
        ...(section.recipes || []).filter(r => r.state !== 'cannot' && !r.since).map(r => ({ kind: 'recipe', ...r })),
        ...suggestions.map(s => ({ kind: 'usual', ...s })),
        // A switch that reads like the usual one under a new number, and that
        // is not already being asked about as three in a row.
        ...(section.switches || [])
            .filter(s => s.renumbered && !s.since && renumberPlan(s)
                && !suggestions.some(g => g.productId === s.productId && g.code === s.code))
            .map(s => ({ kind: 'renumbered', ...s })),
        ...(section.back || []).filter(b => b.unexplained > 0).map(b => ({ kind: 'reason', ...b })),
    ]
}

// ---------------------------------------------------------------------------
// The week in words
// ---------------------------------------------------------------------------

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const round = n => Math.round(Math.abs(num(n)))

// A list said the way a person says it: A, B and C, and 2 others.
function listed(names, most = 3) {
    const shown = names.slice(0, most)
    const rest = names.length - shown.length
    if (rest > 0) return `${shown.join(', ')} and ${plural(rest, 'other', 'others')}`
    if (shown.length < 2) return shown.join('')
    return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
}

const moneyWay = (n, against) => (Math.abs(num(n)) < 0.005
    ? `about the same money as ${against}`
    : `${fmtMoney(Math.abs(n))} ${n > 0 ? 'more' : 'less'} than ${against}`)

// **A headline a kind, each starting with what kind of thing it is** (his
// choice on 26 September, B in the mail). One line says only what moved the
// money, and the cards under it on the page carry everything else. The line
// before the colon is what the mail sets in bold.
//
// Worked out once, here, and frozen with the figures, so the page and the mail
// cannot say the week two ways.
export function priceWords(section) {
    const out = []
    const {
        moves = [], doubtful = [], switches = [], recipes = [], back = [], owed = [], earlier = [], totals = {},
    } = section || {}

    if (moves.length) {
        const way = totals.movesUp && totals.movesDown
            ? `New prices on the same code: ${totals.movesUp} up and ${totals.movesDown} down,`
            : totals.movesUp ? 'Dearer on the same code:' : 'Cheaper on the same code:'
        const money = Math.abs(num(totals.moves)) < 0.005
            ? ''
            : `, ${fmtMoney(Math.abs(totals.moves))} ${totals.moves > 0 ? 'more' : 'less'} this week`
        out.push(`${way} ${listed(moves.map(m => m.name))}${money}.`)
    }

    if (doubtful.length) {
        out.push(`Left out: ${listed(doubtful.map(m => m.name))}, more likely a pack read wrong than a real price.`)
    }

    if (switches.length) {
        const compared = switches.filter(x => !x.cannot)
        const what = switches.length === 1
            ? `${switches[0].bought} for ${switches[0].name}`
            : plural(switches.length, 'product', 'products')
        out.push(`Bought as something else: ${what}`
            + (compared.length ? `, ${moneyWay(totals.switches, switches.length === 1 ? 'the usual one' : 'the usual ones')}` : '')
            + '.')
    }

    const off = recipes.filter(r => r.state !== 'cannot')
    if (off.length) {
        out.push(`Recipes out of line: ${listed(off.map(r => (
            `${r.name} (costed ${round(r.gap)}% ${r.gap > 0 ? 'under' : 'over'} what we pay)`
        )), 2)}.`)
    }
    const cannot = recipes.filter(r => r.state === 'cannot')
    if (cannot.length) out.push(`Cannot be checked: ${listed(cannot.map(r => r.name))}.`)

    if (back.length) {
        const [most] = reasonsOf(back)
        const why = most.kind === NOT_LOGGED.value ? 'with no reason logged yet' : most.label.toLowerCase()
        const share = Math.abs(most.money - totals.back) < 0.005
            ? `, all of it ${why}`
            : `, ${fmtMoney(most.money)} of it ${why}`
        out.push(`Came back: ${fmtMoney(totals.back)} on ${plural(back.length, 'credit note', 'credit notes')}${share}.`)
    }

    if (owed.length) {
        const priced = owed.filter(o => o.money != null)
        out.push(priced.length
            ? `Still owed: ${fmtMoney(totals.owed)} on ${plural(owed.length, 'delivery problem', 'delivery problems')}.`
            : `Still owed: ${plural(owed.length, 'delivery problem', 'delivery problems')} waiting for a credit.`)
    }

    // Money this week takes off for a delivery in an earlier one, because
    // that week's report had already gone out (claimWeek). Said with the week
    // it is from, his condition of 1 October for moving it at all.
    if (earlier.length) {
        const weeks = [...new Set(earlier.map(e => e.delivered))].sort()
        const one = weeks.length === 1
        out.push(earlier.length === 1
            ? `From an earlier week: ${fmtMoney(earlier[0].money)} on ${earlier[0].what}, from the delivery in the week of `
                + `${dayMonth(earlier[0].delivered)}, whose report had already been sent.`
            : `From earlier weeks: ${fmtMoney(totals.earlier)} on ${plural(earlier.length, 'delivery problem', 'delivery problems')}, `
                + `from the deliveries in the week${one ? '' : 's'} of ${listed(weeks.map(w => dayMonth(w)), weeks.length)}, `
                + `whose report${one ? '' : 's'} had already been sent.`)
    }

    if (!out.length) out.push('Nothing moved on prices this week and nothing came back.')
    return out
}

// ---------------------------------------------------------------------------
// The claims on the list of jobs
// ---------------------------------------------------------------------------

export const CLAIM_ACTION = 'claim'

// The key an action carries so the same claim never lands on the list twice.
export function claimKey(claim) {
    return `${CLAIM_ACTION}:${claim.id}`
}

// The claims that belong on the report's own list of jobs.
//
// An action already carries from week to week until it is ticked, so this only
// has to say which ones are missing and which ones are finished. Nothing is
// added twice, because the key is the claim.
export function claimActions(claims, items, weekStart) {
    const onList = new Map(
        (items || [])
            .filter(i => i.kind === 'action' && String(i.key || '').startsWith(`${CLAIM_ACTION}:`))
            .map(i => [i.key, i]),
    )

    const add = []
    for (const claim of claims || []) {
        if (!claimIsOpen(claim)) continue
        const key = claimKey(claim)
        if (onList.has(key)) continue
        add.push({
            kind: 'action',
            key,
            label: claimLabel(claim),
            note: claim.docket_number ? `Docket ${claim.docket_number}` : null,
            opened_on: claim.counted_week || weekStart,
        })
    }

    // A claim that has been settled, refused or taken back since the list was
    // made. The line stays on the report and gets crossed off, which is the
    // whole point of it being a task rather than a figure.
    //
    // **And the other way.** A job the Hub crossed off when they said no,
    // whose claim was asked again that same week, goes back on (`reopen`):
    // nothing else would chase it until next week's report added it fresh.
    // Only one the Hub crossed off, which is dated the day the button was
    // pressed. A tick by hand is dated the report's own week, and stays: the
    // claim is still open after a phone call, and somebody saying it is done
    // is theirs to say.
    //
    // A job still open whose money has moved, a claim changed, put on its
    // line or part credited, has its words brought up to date (`relabel`).
    // Both only change words the Hub wrote; what somebody typed over stays
    // theirs.
    const tick = []
    const reopen = []
    const relabel = []
    const byKey = new Map((claims || []).map(c => [claimKey(c), c]))
    for (const [key, item] of onList) {
        const claim = byKey.get(key)
        const open = !!claim && claimIsOpen(claim)
        const label = open && CLAIM_LABEL.test(item.label || '') && item.label !== claimLabel(claim)
            ? { label: claimLabel(claim) }
            : {}
        if (item.done_on) {
            if (open && item.done_on !== weekStart) reopen.push({ id: item.id, patch: { done_on: null, ...label } })
        } else if (!open) {
            tick.push(item)
        } else if (label.label) {
            relabel.push({ id: item.id, patch: label })
        }
    }

    return { add, tick, reopen, relabel }
}

// The words claimLabel writes, with or without the money on the end, and
// nothing typed after them. The bracket has to be one of the reasons, any of
// them because a claim's reason can be changed, so a remark typed in brackets
// on the end, "(rang Tuesday)", is not taken for the Hub's own words. The
// money used to be written with no euro sign, and a job written that way is
// still the Hub's to bring up to date.
const KIND_WORDS = [...CLAIM_KINDS, NOT_LOGGED].map(k => k.label.toLowerCase()).join('|')
const CLAIM_LABEL = new RegExp(String.raw`^Chase the credit for .+ \((?:${KIND_WORDS})\)( \(€?[\d,]+\.\d{2}\))?$`)

export function claimLabel(claim) {
    const kind = claimKind(claim.kind).label.toLowerCase()
    const balance = claimBalance(claim)
    const worth = balance == null ? '' : ` (${fmtMoney(balance)})`
    return `Chase the credit for ${claim.what} (${kind})${worth}`
}

// The first day of the stretch the section reads, for the query.
export function lookBackFrom(weekStart) {
    return addDays(weekStart, -LOOK_BACK_DAYS)
}
