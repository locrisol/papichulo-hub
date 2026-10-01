import { useState, useEffect, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase, everyRow } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { useRestaurant } from '@/context/restaurant'
import { useConfirm } from '@/context/confirm'
import { fmtMoney, num } from '@/lib/format'
import { shortDate } from '@/lib/dates'
import { friendlyError } from '@/lib/errors'
import {
    matchLines, pilesOf, storedLine, lineCategory, samePrice, unitsForPack, packReadings, unitsPatch,
} from '@/lib/invoiceImport'
import { storedTotals, mainCategory } from '@/lib/invoiceCategories'
import { acceptPrice, movePreferred, codeRow, ignoreCode, ownedByAnother, newGroupId } from '@/lib/priceEvents'
import { prefillLink } from '@/lib/products'
import { readToDecide } from '@/lib/invoiceReview'
import {
    card, cardHeader, pageTitle, secondaryButton, primaryButton, rowButton, badge,
    hintClass,
} from '@/lib/controlStyles'
import ErrorBanner from '@/components/ui/ErrorBanner'
import MatchLineModal from '@/components/invoices/MatchLineModal'

// What the week's invoices want somebody to decide.
//
// **Nothing changes a cost without him.** An invoice proposes and he accepts,
// which is the whole reason this screen exists between the import and the
// prices. The food cost already moved when the document went in, because money
// spent is money spent. What a portion costs waits here.
//
// Four piles, and only one of them takes any thought most weeks. A line the
// same as last week's was settled as it was written, so the two hundred lines a
// twenty document week carries arrive here as a handful.
//
// It is set based on purpose: the same screen over a bigger batch rather than
// one document at a time, because the question "has anything moved" is about
// the week and not about one piece of paper.
//
// **It asks until every line is decided** (his answer, 30 September). It used
// to look back thirty days, and a line nobody got to dropped off without ever
// being answered: the week's cost had it, but the product's price never moved
// and its category stayed a guess.

const PILE_CARDS = [
    {
        key: 'new_to_us',
        title: 'Never bought before',
        under: 'A code nobody has ever bought under. Either it is new, or it is something we already have that the supplier has renamed, or it is not stock at all.',
    },
    {
        key: 'new_code',
        title: 'The same thing under a new code',
        under: 'A code we have never had, that reads like one we already buy. If the old code has stopped, it is a code update: one price and one price history for both. If Sysco sends either one depending on what it has, we usually buy both: each keeps its own price and neither is ever counted as bought instead of the other.',
    },
    {
        key: 'price_changed',
        title: 'The price changed',
        under: 'What the supplier charged is already in the week. This is only about what the Hub costs a portion at. Not now leaves the costing as it is, and the weekly report keeps saying so until the two agree.',
    },
    {
        key: 'unchanged',
        title: 'Nothing to decide',
        under: 'Matched and the same as before. Listed rather than hidden, and one press clears them.',
    },
]

export default function InvoiceReviewPage() {
    const { user } = useAuth()
    const { activeRestaurant } = useRestaurant()
    const confirm = useConfirm()
    const location = useLocation()
    const navigate = useNavigate()
    const restaurantId = activeRestaurant?.id

    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    // Opened by an import, which says what went in.
    const [said, setSaid] = useState(() => location.state?.said || '')
    const [busy, setBusy] = useState('')
    const [matching, setMatching] = useState(null)
    const [refresh, setRefresh] = useState(0)

    // Said once. Left in the history, a reload would say it again.
    useEffect(() => {
        if (location.state?.said) navigate(location.pathname, { replace: true, state: null })
    }, [location, navigate])

    useEffect(() => {
        if (!restaurantId) return
        let alive = true

        async function load() {
            setError('')
            // Every price and code the restaurant has, a page at a time. Read
            // in one go, whatever sat past the thousandth row was unknown here,
            // and a code bought every week went back to Never bought before.
            const [waiting, prices, codes, suppliers, products] = await Promise.all([
                readToDecide(restaurantId),
                everyRow(() => supabase.from('product_supplier_prices')
                    .select('*, products(id, name, section, unit, piece_weight)')
                    .eq('restaurant_id', restaurantId)
                    .order('id')),
                everyRow(() => supabase.from('supplier_codes').select('*').eq('restaurant_id', restaurantId).order('id')),
                supabase.from('suppliers').select('id, name, category'),
                // Anything we buy. A MIX is made here out of other products
                // and has no supplier, so offering one as the thing a code
                // means would be offering to price something that is priced by
                // its recipe.
                everyRow(() => supabase.from('products')
                    .select('id, name, section, unit, is_mix, category, is_active, piece_weight')
                    .eq('is_active', true)
                    .eq('is_mix', false)
                    .order('name')
                    .order('id')),
            ])

            if (!alive) return
            const failed = [waiting, prices, codes, suppliers, products].map(r => r.error).find(Boolean)
            if (failed) { setError(friendlyError(failed)); return }

            setData({
                lines: waiting.lines,
                prices: prices.data || [],
                codes: codes.data || [],
                suppliers: suppliers.data || [],
                products: products.data || [],
            })
        }

        load()
        return () => { alive = false }
    }, [restaurantId, refresh])

    // The same matching the import ran, over the rows as they were stored.
    //
    // Run again rather than remembered, because a price accepted on Tuesday
    // changes the answer for a line imported on Monday, and a screen showing
    // last week's answer about this week's prices would be worse than useless.
    //
    // Document by document, as the import did, because whether an old code has
    // gone quiet is a question about the day that document was printed. Asked
    // about today, a code replaced last week would not look replaced yet.
    const rows = useMemo(() => {
        if (!data) return []
        const byDocument = new Map()
        for (const stored of inPaperOrder(data.lines)) {
            const id = stored.invoices.id
            if (!byDocument.has(id)) byDocument.set(id, [])
            byDocument.get(id).push(stored)
        }

        return [...byDocument.values()].flatMap(stored => {
            const { supplier_id: supplierId, invoice_date: date } = stored[0].invoices
            const supplier = data.suppliers.find(s => s.id === supplierId) || null
            const matched = matchLines({
                lines: stored.map(storedLine),
                codes: data.codes.filter(c => c.supplier_id === supplierId),
                prices: data.prices.filter(p => p.supplier_id === supplierId),
                supplier,
                date,
            })
            return matched.map((row, i) => ({
                ...row, stored: stored[i], supplier, supplierId,
            }))
        })
    }, [data])

    const piles = useMemo(() => pilesOf(rows), [rows])
    const waiting = rows.length

    // Nothing to decide, but a line that only matched once its pack was read
    // again keeps that reading, so the weekly report prices it the same way.
    // See unitsPatch.
    async function clearUnchanged(list) {
        for (const row of list) {
            const patch = unitsPatch(row)
            if (!patch) continue
            const { error: e1 } = await supabase.from('invoice_lines').update(patch).eq('id', row.stored.id)
            if (e1) return friendlyError(e1)
        }
        return decide(list.map(r => r.stored.id), 'matched')
    }

    async function decide(ids, decision) {
        const { error: e1 } = await supabase.from('invoice_lines')
            .update({ decision, decided_at: new Date().toISOString(), decided_by: user?.id || null })
            .in('id', ids)
        return e1 ? friendlyError(e1) : null
    }

    // Every line on the batch carrying this code, not just the one in front of
    // you. The same code on three deliveries is one decision, and asking three
    // times is how a review stops getting finished.
    function sameCode(row) {
        return rows.filter(r => r.supplierId === row.supplierId && r.line.code === row.line.code)
    }

    async function run(key, work) {
        setBusy(key)
        setError('')
        setSaid('')
        const failed = await work()
        setBusy('')
        if (failed) { setError(failed); return }
        setRefresh(n => n + 1)
    }

    // ---- accepting and refusing a price ---------------------------------

    async function accept(row, alsoPrefer = false) {
        const at = new Date().toISOString()
        const out = acceptPrice(row, {
            restaurantId, userId: user?.id, at, prices: data.prices, codes: data.codes,
        })
        if (!out) return 'That line has no product behind it yet.'

        let priceId = out.priceId
        let costed
        if (out.what === 'update') {
            const { error: e1 } = await supabase.from('product_supplier_prices')
                .update(out.patch).eq('id', out.priceId)
            if (e1) return friendlyError(e1)
            costed = { ...(out.packRow || row.price), ...out.patch }
        } else {
            const { data: made, error: e1 } = await supabase.from('product_supplier_prices')
                .insert(out.row).select().single()
            if (e1) return friendlyError(e1)
            priceId = made.id
            costed = made
        }

        // A second pack, and he said to cost from it. Whatever the product was
        // costed from before stops being, whichever supplier it was, or two
        // prices would both say they are the one.
        if (alsoPrefer && row.packMoved) {
            const before = data.prices.find(p => (
                p.product_id === row.product.id && p.is_preferred && p.id !== priceId
            )) || null
            const move = movePreferred(row.product, costed, {
                restaurantId, userId: user?.id, from: before, at,
            })
            if (move.off) {
                await supabase.from('product_supplier_prices')
                    .update({ is_preferred: false }).eq('id', move.off)
            }
            const { error: e2 } = await supabase.from('product_supplier_prices')
                .update({ is_preferred: true }).eq('id', priceId)
            if (e2) return friendlyError(e2)
            await supabase.from('product_price_events').insert(move.event)
        }

        const { error: e3 } = await supabase.from('product_price_events')
            .insert({ ...out.event, price_id: priceId, invoice_line_id: row.stored.id })
        if (e3) return friendlyError(e3)

        // The code follows the price row it now means, so the next document
        // matches itself. Not for an old number that means its replacement's
        // price already: that price belongs to the new number, and the old one
        // reaches it through replaces_code.
        if (!(row.replacedBy && row.replacedBy.price_id === priceId)) await pointCode(row, priceId)
        return decide(agreeing(row, costed), 'accepted')
    }

    // This line and the others with its code that charged the same price per
    // unit as the one the Hub now has. The same code at a different price, a
    // case at one price and loose at another, is its own question and waits.
    function agreeing(row, priceRow) {
        return sameCode(row)
            .filter(r => r.stored.id === row.stored.id
                || samePrice({ perCase: r.line.price_per_case, units: r.wantedUnits }, priceRow))
            .map(r => r.stored.id)
    }

    async function reject(row) {
        // He paid the new price whatever the Hub costs from. This says only
        // that the costing does not follow, and the week's food cost already
        // has the real figure in it.
        return decide([row.stored.id], 'rejected')
    }

    // ---- matching a code to something ------------------------------------

    async function pointCode(row, priceId) {
        const existing = data.codes.find(c => (
            c.supplier_id === row.supplierId && c.supplier_code === row.line.code
        ))
        const patch = { price_id: priceId, last_description: row.line.description }

        const { error: e1 } = existing
            ? await supabase.from('supplier_codes').update(patch).eq('id', existing.id)
            : await supabase.from('supplier_codes').insert(codeRow({
                code: row.line.code,
                line: row.line,
                supplierId: row.supplierId,
                restaurantId,
                priceId,
                date: row.stored.invoices.invoice_date,
            }))
        if (e1) return friendlyError(e1)

        // A price typed with no code on it belongs to this code from now on,
        // and says so, the way the rows made from an invoice already do.
        const { error: e2 } = await supabase.from('product_supplier_prices')
            .update({ supplier_code: row.line.code })
            .eq('id', priceId)
            .is('supplier_code', null)
        return e2 ? friendlyError(e2) : null
    }

    // The supplier renumbered something. The old code's price row is the one
    // this belongs to, and saying so keeps the product's line on the graph in
    // one piece across the change.
    async function sameProduct(row) {
        const successor = row.successor
        const price = data.prices.find(p => p.id === successor.price_id)
        if (!price) return 'That code points at a price the Hub no longer has.'

        // The old code lets go of the price row first, because a price row
        // belongs to one code, and it stops being offered: the thing it named
        // is bought under the new number now.
        const { error: e0 } = await supabase.from('supplier_codes')
            .update({ price_id: null })
            .eq('supplier_id', row.supplierId)
            .eq('restaurant_id', restaurantId)
            .eq('supplier_code', successor.supplier_code)
        if (e0) return friendlyError(e0)

        const { error: e1 } = await supabase.from('supplier_codes')
            .upsert({
                supplier_id: row.supplierId,
                restaurant_id: restaurantId,
                supplier_code: row.line.code,
                price_id: price.id,
                last_description: row.line.description,
                pack_size: row.line.pack_size,
                first_seen_on: row.stored.invoices.invoice_date,
                last_seen_on: row.stored.invoices.invoice_date,
                replaces_code: successor.supplier_code,
                ignored: false,
            }, { onConflict: 'supplier_id,restaurant_id,supplier_code' })
        if (e1) return friendlyError(e1)

        // The row carries the code it is for, and that is the new one now. The
        // report follows the old number's deliveries through replaces_code, so
        // the price history stays in one piece.
        const { error: e3 } = await supabase.from('product_supplier_prices')
            .update({ supplier_code: row.line.code })
            .eq('id', price.id)
        if (e3) return friendlyError(e3)

        const { error: e2 } = await supabase.from('invoice_lines')
            .update({
                price_id: price.id,
                product_id: price.product_id,
                category: lineCategory(price.products, row.supplier),
            })
            .in('id', sameCode(row).map(r => r.stored.id))
        if (e2) return friendlyError(e2)
        await refreshCategories(sameCode(row).map(r => r.stored.invoice_id))

        // Deliberately undecided. If the price also moved, the line belongs in
        // the pile that asks about that, and it will be there when this reloads.
        return null
    }

    // Sysco sends either code depending on what it has: the green peppers as
    // 483508 or 5018758. The new code gets a price of its own, the same way as
    // matching it to something we already have, and the two codes go in one
    // group, the old one's if it is in one already, so a third code joins the
    // same group.
    async function buyBoth(row) {
        const successor = row.successor
        const price = data.prices.find(p => p.id === successor.price_id)
        if (!price) return 'That code points at a price the Hub no longer has.'
        const product = data.products.find(p => p.id === price.product_id) || price.products
        const units = packReadings(row.line, product)[0] ?? num(price.units_per_case)

        const failed = await matchTo(row, { productId: price.product_id, unitsPerCase: units })
        if (failed) return failed

        const { error: e1 } = await supabase.from('supplier_codes')
            .update({ alternate_group: successor.alternate_group || newGroupId() })
            .eq('supplier_id', row.supplierId)
            .eq('restaurant_id', restaurantId)
            .in('supplier_code', [row.line.code, successor.supplier_code])
        return e1 ? friendlyError(e1) : null
    }

    async function matchTo(row, { productId, unitsPerCase }) {
        const product = data.products.find(p => p.id === productId)
        const perCase = num(row.line.price_per_case)
        const perUnit = unitsPerCase > 0
            ? Math.round((perCase / unitsPerCase) * 10000) / 10000
            : null

        // A price row for exactly this pack from this supplier, then one for a
        // different pack at the same price per unit, and only then a new one.
        // Looking first is the difference between adding a pack and failing on
        // the unique key, and the second is the cabbage: one bought loose
        // matches the price the Hub already has for them, whatever pack that
        // price was typed against.
        //
        // **Never another code's row.** Two codes are two versions of the
        // product, each with its own price, even in the same pack: the plain
        // wraps matched to the tortillas get a price of their own, and the
        // Santa Maria price recipes cost from is left alone.
        const ofProduct = data.prices.filter(p => (
            p.product_id === productId
            && p.supplier_id === row.supplierId
            && (p.purchase_type || 'case') === 'case'
            && !ownedByAnother(p, row.line.code, data.codes)
        ))
        const existing = ofProduct.find(p => num(p.units_per_case) === unitsPerCase)
            || ofProduct.find(p => samePrice({ perCase, units: unitsPerCase }, p))
            || null

        // **Pointing a code at a price we already have never changes that
        // price.** It used to write the invoice's price straight over it, which
        // is exactly how a bowl that should be 29.00 a case would have become
        // 49.00 across every dish it goes into, the day the supplier put it
        // under a new code at the wrong price. Nothing changes a cost without
        // him: the code is matched here, and if the invoice charged something
        // different the line goes on to the pile that asks about the price.
        let priceRow = existing
        if (!existing) {
            // Preferred only when the product has nothing else, because that is
            // not a choice, it is the only answer there is.
            const others = data.prices.filter(p => p.product_id === productId)
            const { data: made, error: e1 } = await supabase.from('product_supplier_prices')
                .insert({
                    product_id: productId,
                    supplier_id: row.supplierId,
                    restaurant_id: restaurantId,
                    purchase_type: 'case',
                    supplier_code: row.line.code,
                    price_per_case: perCase,
                    units_per_case: unitsPerCase,
                    price_per_unit: perUnit,
                    is_preferred: others.length === 0,
                })
                .select().single()
            if (e1) return friendlyError(e1)
            priceRow = made

            // An event is what the product itself costs, so only a price the
            // Hub now costs from gets one. A second supplier's price is a line
            // of its own on the graph and does not move the product's.
            if (others.length === 0) {
                await supabase.from('product_price_events').insert({
                    restaurant_id: restaurantId,
                    product_id: productId,
                    price_id: made.id,
                    price_per_unit: perUnit,
                    reason: 'created',
                    changed_by: user?.id || null,
                    invoice_line_id: row.stored.id,
                })
            }
        }

        const failed = await pointCode(row, priceRow.id)
        if (failed) return failed

        // **Every line with this code, each at its own pack.** It used to write
        // the pack of the line that was pressed onto all of them, so a loose
        // cabbage matched with a case of ten on the screen made the case one
        // cabbage too, and marked it done at a price it was never compared with.
        const lines = sameCode(row).map(r => {
            const units = unitsForPack(unitsPerCase, row.line.pack_size, r.line.pack_size)
            const charged = num(r.line.price_per_case)
            return {
                r,
                units,
                unitPrice: units > 0 ? Math.round((charged / units) * 10000) / 10000 : null,
                agrees: samePrice({ perCase: charged, units }, priceRow),
            }
        })
        const written = await Promise.all(lines.map(({ r, units, unitPrice }) => (
            supabase.from('invoice_lines')
                .update({
                    price_id: priceRow.id,
                    product_id: productId,
                    units_per_case: units,
                    unit_price: unitPrice,
                    category: lineCategory(product, r.supplier),
                })
                .eq('id', r.stored.id)
        )))
        const e2 = written.map(w => w.error).find(Boolean)
        if (e2) return friendlyError(e2)
        await refreshCategories(lines.map(({ r }) => r.stored.invoice_id))

        const waiting = lines.filter(l => !l.agrees)
        if (waiting.length) {
            setSaid(`Matched. ${waiting.length === 1 ? 'One line charged' : `${waiting.length} lines charged`} `
                + `a different price per unit from the ${fmtMoney(priceRow.price_per_case)} a case we `
                + 'cost it at, so it is waiting under The price changed.')
        }
        const settled = lines.filter(l => l.agrees).map(({ r }) => r.stored.id)
        return settled.length ? decide(settled, 'matched') : null
    }

    // What each invoice is filed under, after its lines have moved.
    //
    // An invoice shows one label on the History page and anywhere else that
    // lists invoices, and it is where most of its money went. Matching a line
    // here can change that, the mops going from packaging to cleaning, so it is
    // worked out again from every line on the invoice, decided or not.
    async function refreshCategories(invoiceIds) {
        const ids = [...new Set((invoiceIds || []).filter(Boolean))]
        if (!ids.length) return
        const { data: all } = await supabase.from('invoice_lines')
            .select('invoice_id, category, line_total, vat_amount, deposit_amount')
            .in('invoice_id', ids)
        await Promise.all(ids.map(id => {
            const category = mainCategory(storedTotals((all || []).filter(l => l.invoice_id === id)))
            return category ? supabase.from('invoices').update({ category }).eq('id', id) : null
        }))
    }

    // One line, set aside without teaching the Hub anything about its code:
    // ordered by mistake and sent back before any credit came, or a one off.
    // The next time the code turns up it is asked about again. Not stock is for
    // a code that is never stock, and there is nothing on screen to undo it.
    async function leaveOne(row) {
        return decide([row.stored.id], 'ignored')
    }

    // A delivery charge, a crate deposit, a fuel surcharge. They have codes and
    // they would turn up in this pile every single week.
    async function notStock(row) {
        const reason = await confirm({
            title: 'Not stock?',
            message: `${row.line.description} will stop being offered here, and lines carrying `
                + `code ${row.line.code} will still count towards the week's cost. `
                + 'This is for a delivery charge, a crate deposit and the like. For something '
                + 'ordered by mistake, use Leave this one instead.',
            confirmLabel: 'It is not stock',
        })
        if (!reason) return null

        const existing = data.codes.find(c => (
            c.supplier_id === row.supplierId && c.supplier_code === row.line.code
        ))
        const patch = ignoreCode(existing, row.line.description)

        const { error: e1 } = existing
            ? await supabase.from('supplier_codes').update(patch).eq('id', existing.id)
            : await supabase.from('supplier_codes').insert({
                ...codeRow({
                    code: row.line.code,
                    line: row.line,
                    supplierId: row.supplierId,
                    restaurantId,
                    priceId: null,
                    date: row.stored.invoices.invoice_date,
                }),
                ...patch,
            })
        if (e1) return friendlyError(e1)

        return decide(sameCode(row).map(r => r.stored.id), 'ignored')
    }

    if (!data) {
        return <p className="text-sm text-muted">Reading what is waiting...</p>
    }

    return (
        <>
            <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h2 className={pageTitle}>Review</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {activeRestaurant?.name},{' '}
                        {waiting === 0 ? 'nothing waiting' : `${waiting} ${waiting === 1 ? 'line' : 'lines'} waiting`}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Link to="/invoices/import" className={secondaryButton}>Import invoices</Link>
                    <Link to="/invoices" className={secondaryButton}>Invoices</Link>
                </div>
            </div>

            {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}
            {said && <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3 mb-4">{said}</div>}

            {waiting === 0 && (
                <div className={`${card} p-6 text-center`}>
                    <p className="text-sm font-semibold text-gray-900">Nothing is waiting.</p>
                    <p className={hintClass}>
                        Every line imported so far has been decided, or matched something the Hub
                        already knew at a price it already had.
                    </p>
                </div>
            )}

            {matching && (
                <MatchLineModal
                    row={matching}
                    products={data.products}
                    onClose={() => setMatching(null)}
                    onMatch={async chosen => {
                        setMatching(null)
                        await run('match', () => matchTo(matching, chosen))
                    }}
                />
            )}

            {PILE_CARDS.map(pile => (
                piles[pile.key]?.length > 0 && (
                    <div key={pile.key} className={`${card} mb-6 overflow-hidden`}>
                        <div className={`${cardHeader} flex items-center justify-between gap-3`}>
                            <span>{pile.title}</span>
                            <span className="normal-case tracking-normal font-normal">
                                {piles[pile.key].length}
                            </span>
                        </div>
                        <div className="p-4">
                            <p className="text-xs text-muted mb-4">{pile.under}</p>

                            {pile.key === 'unchanged' ? (
                                <>
                                    <ul className="text-sm text-gray-700 space-y-1 mb-4">
                                        {piles.unchanged.map(row => (
                                            <li key={row.stored.id} className="flex justify-between gap-4">
                                                <span className="truncate">{row.line.description}</span>
                                                <span className="tabular-nums text-muted whitespace-nowrap">
                                                    {fmtMoney(row.line.price_per_case)} a case
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                    <button
                                        type="button"
                                        disabled={!!busy}
                                        onClick={() => run('clear', () => clearUnchanged(piles.unchanged))}
                                        className={primaryButton('sm', 'good')}
                                    >
                                        {busy === 'clear' ? 'Clearing...' : 'Nothing to decide, clear them'}
                                    </button>
                                </>
                            ) : (
                                <div className="space-y-3">
                                    {piles[pile.key].map(row => (
                                        <ReviewRow
                                            key={row.stored.id}
                                            row={row}
                                            busy={busy}
                                            sameCodeCount={sameCode(row).length}
                                            onAccept={also => run(`accept-${row.stored.id}`, () => accept(row, also))}
                                            onReject={() => run(`reject-${row.stored.id}`, () => reject(row))}
                                            onSameProduct={() => run(`same-${row.stored.id}`, () => sameProduct(row))}
                                            onBuyBoth={() => run(`both-${row.stored.id}`, () => buyBoth(row))}
                                            onMatch={() => setMatching(row)}
                                            onNotStock={() => run(`skip-${row.stored.id}`, () => notStock(row))}
                                            onLeave={() => run(`leave-${row.stored.id}`, () => leaveOne(row))}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )
            ))}
        </>
    )
}

// One line, and what can be done about it.
function ReviewRow({
    row, busy, sameCodeCount, onAccept, onReject, onSameProduct, onBuyBoth, onMatch, onNotStock, onLeave,
}) {
    const { line, stored, supplier, pile } = row
    const doc = stored.invoices

    return (
        <div className="border border-border rounded-lg p-3">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900">{line.description}</p>
                    <p className="text-xs text-muted mt-0.5">
                        {supplier?.name || 'Unknown supplier'}, code {line.code}
                        {line.pack_size ? `, ${line.pack_size}` : ''}, on{' '}
                        {doc.document_type === 'credit' ? 'credit note' : 'invoice'}{' '}
                        {doc.invoice_number} of {shortDate(doc.invoice_date)}
                    </p>
                </div>
                <span className={`${badge} border bg-gray-100 text-gray-700 border-gray-300 tabular-nums`}>
                    {fmtMoney(line.price_per_case)} a case
                </span>
            </div>

            {pile === 'price_changed' && (
                <div className="mb-3">
                    <p className="text-sm text-gray-900">
                        <span className="tabular-nums">{fmtMoney(row.was)}</span>
                        {' to '}
                        <span className="tabular-nums font-bold">{fmtMoney(row.now)}</span>
                        {row.perUnitNow != null && (
                            <span className="text-muted">
                                {' '}({fmtMoney(row.perUnitWas)} to {fmtMoney(row.perUnitNow)} a unit)
                            </span>
                        )}
                    </p>
                    {row.packMoved && (
                        <p className="text-xs text-amber-800 mt-1">
                            <strong className="font-bold">The pack changed as well.</strong>{' '}
                            {row.price.units_per_case} to {row.wantedUnits} in a case, so this is a
                            second price rather than a change to the one we have. The pack we cost
                            from today is not the pack on this invoice.
                        </p>
                    )}
                </div>
            )}

            {pile === 'new_code' && row.successor && (
                <p className="text-sm text-gray-900 mb-3">
                    This looks like <strong className="font-bold">{row.successor.last_description}</strong>,
                    bought under code {row.successor.supplier_code}
                    {row.successor.stillBought
                        ? `, which is still coming as well (last on ${shortDate(row.successor.last_seen_on)}).`
                        : ` and not seen since ${shortDate(row.successor.last_seen_on)}.`}
                </p>
            )}

            {sameCodeCount > 1 && (
                <p className="text-xs text-muted mb-2">
                    This code is on {sameCodeCount} lines in here. Deciding once does every one of
                    them at the same price.
                </p>
            )}

            <div className="flex flex-wrap gap-2">
                {pile === 'price_changed' && !row.packMoved && (
                    <>
                        <button type="button" disabled={!!busy} onClick={() => onAccept(false)} className={rowButton('good')}>
                            Cost from the new price
                        </button>
                        <button type="button" disabled={!!busy} onClick={onReject} className={rowButton()}>
                            Not now
                        </button>
                    </>
                )}

                {pile === 'price_changed' && row.packMoved && (
                    <>
                        <button type="button" disabled={!!busy} onClick={() => onAccept(true)} className={rowButton('good')}>
                            Add the pack and cost from it
                        </button>
                        <button type="button" disabled={!!busy} onClick={() => onAccept(false)} className={rowButton()}>
                            Add the pack, keep the old one
                        </button>
                        <button type="button" disabled={!!busy} onClick={onReject} className={rowButton()}>
                            Not now
                        </button>
                    </>
                )}

                {pile === 'new_code' && (
                    <>
                        <button type="button" disabled={!!busy} onClick={onSameProduct} className={rowButton('good')}>
                            Same thing, this is a code update
                        </button>
                        <button type="button" disabled={!!busy} onClick={onBuyBoth} className={rowButton('good')}>
                            Same thing, we usually buy both
                        </button>
                    </>
                )}

                {(pile === 'new_to_us' || pile === 'new_code') && (
                    <>
                        <button type="button" disabled={!!busy} onClick={onMatch} className={rowButton('edit')}>
                            Something we already have
                        </button>
                        <Link
                            to={prefillLink('/catalogue/products', {
                                name: tidyName(line.description),
                                section: SECTION_FOR[line.storage] || 'Dry',
                                unit: 'KG',
                                supplierId: row.supplierId,
                                code: line.code,
                                pricePerCase: line.price_per_case,
                                unitsPerCase: row.wantedUnits,
                            })}
                            className={rowButton()}
                        >
                            Make it a new product
                        </Link>
                        <button type="button" disabled={!!busy} onClick={onLeave} className={rowButton()}>
                            Leave this one
                        </button>
                        <button type="button" disabled={!!busy} onClick={onNotStock} className={rowButton()}>
                            Not stock
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}

// The band the line sat under on the page already says where a thing is kept,
// so the creation form opens on the right section rather than on the first one
// in the list.
const SECTION_FOR = { frozen: 'Freezer', chilled: 'Cold Room', ambient: 'Dry' }

// The order the lines are shown in, the same every time: oldest document
// first, then by its number, then as they are printed on it.
//
// The database hands them back sorted by line number alone, and every document
// has a line 1, so which document's line 1 came first was up to it. Every press
// reloads the lines, and both lists were reshuffled under whoever was working
// through them.
function inPaperOrder(lines) {
    return [...(lines || [])].sort((a, b) => (
        String(a.invoices?.invoice_date).localeCompare(String(b.invoices?.invoice_date))
        || String(a.invoices?.invoice_number).localeCompare(String(b.invoices?.invoice_number))
        || num(a.line_no) - num(b.line_no)
        || String(a.id).localeCompare(String(b.id))
    ))
}

// A supplier writes in capitals and the catalogue does not. Title case is a
// better starting point than shouting, and it is a starting point: whoever
// creates the product types the name they actually use.
function tidyName(said) {
    return String(said || '')
        .toLowerCase()
        .replace(/\b[a-z]/g, c => c.toUpperCase())
}
