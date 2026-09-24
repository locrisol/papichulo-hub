import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { useRestaurant } from '@/context/restaurant'
import { useConfirm } from '@/context/confirm'
import { fmtMoney, fmtUnitCost, num } from '@/lib/format'
import { todayISO, addDays, shortDate } from '@/lib/dates'
import { friendlyError } from '@/lib/errors'
import { matchLines, pilesOf, storedLine, lineCategory } from '@/lib/invoiceImport'
import { acceptPrice, movePreferred, codeRow, ignoreCode } from '@/lib/priceEvents'
import { prefillLink } from '@/lib/products'
import {
    card, cardHeader, pageTitle, secondaryButton, primaryButton, rowButton, badge,
    hintClass, dateField,
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

const LOOK_BACK_DAYS = 30

const PILE_CARDS = [
    {
        key: 'new_to_us',
        title: 'Never bought before',
        under: 'A code nobody has ever bought under. Either it is new, or it is something we already have that the supplier has renamed, or it is not stock at all.',
    },
    {
        key: 'new_code',
        title: 'The code has moved',
        under: 'A code that stopped appearing and a new one with almost the same description. The supplier renumbering something is otherwise a new product beside an old one that quietly stops.',
    },
    {
        key: 'price_changed',
        title: 'The price changed',
        under: 'What the supplier charged is already in the week. This is only about what the Hub costs a portion at.',
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
    const restaurantId = activeRestaurant?.id

    const [from, setFrom] = useState(() => addDays(todayISO(), -LOOK_BACK_DAYS))
    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    const [said, setSaid] = useState('')
    const [busy, setBusy] = useState('')
    const [matching, setMatching] = useState(null)
    const [refresh, setRefresh] = useState(0)

    useEffect(() => {
        if (!restaurantId) return
        let alive = true

        async function load() {
            const [lines, prices, codes, suppliers, products] = await Promise.all([
                supabase.from('invoice_lines')
                    .select('*, invoices!inner(id, invoice_number, invoice_date, supplier_id, document_type, restaurant_id)')
                    .is('decision', null)
                    .eq('invoices.restaurant_id', restaurantId)
                    .gte('invoices.invoice_date', from)
                    .order('line_no'),
                supabase.from('product_supplier_prices')
                    .select('*, products(id, name, section, unit)')
                    .eq('restaurant_id', restaurantId),
                supabase.from('supplier_codes').select('*').eq('restaurant_id', restaurantId),
                supabase.from('suppliers').select('id, name, category'),
                // Anything we buy. A MIX is made here out of other products
                // and has no supplier, so offering one as the thing a code
                // means would be offering to price something that is priced by
                // its recipe.
                supabase.from('products')
                    .select('id, name, section, unit, is_mix, category, is_active')
                    .eq('is_active', true)
                    .eq('is_mix', false)
                    .order('name'),
            ])

            if (!alive) return
            const failed = [lines, prices, codes, suppliers, products].map(r => r.error).find(Boolean)
            if (failed) { setError(friendlyError(failed)); return }

            setData({
                lines: lines.data || [],
                prices: prices.data || [],
                codes: codes.data || [],
                suppliers: suppliers.data || [],
                products: products.data || [],
            })
        }

        load()
        return () => { alive = false }
    }, [restaurantId, from, refresh])

    // The same matching the import ran, over the rows as they were stored.
    //
    // Run again rather than remembered, because a price accepted on Tuesday
    // changes the answer for a line imported on Monday, and a screen showing
    // last week's answer about this week's prices would be worse than useless.
    const rows = useMemo(() => {
        if (!data) return []
        const bySupplier = new Map()
        for (const stored of data.lines) {
            const supplierId = stored.invoices.supplier_id
            if (!bySupplier.has(supplierId)) bySupplier.set(supplierId, [])
            bySupplier.get(supplierId).push(stored)
        }

        return [...bySupplier.entries()].flatMap(([supplierId, stored]) => {
            const supplier = data.suppliers.find(s => s.id === supplierId) || null
            const matched = matchLines({
                lines: stored.map(storedLine),
                codes: data.codes.filter(c => c.supplier_id === supplierId),
                prices: data.prices.filter(p => p.supplier_id === supplierId),
                supplier,
                date: todayISO(),
            })
            return matched.map((row, i) => ({
                ...row, stored: stored[i], supplier, supplierId,
            }))
        })
    }, [data])

    const piles = useMemo(() => pilesOf(rows), [rows])
    const waiting = rows.length

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
        const out = acceptPrice(row, { restaurantId, userId: user?.id, at })
        if (!out) return 'That line has no product behind it yet.'

        let priceId = out.priceId
        if (out.what === 'update') {
            const { error: e1 } = await supabase.from('product_supplier_prices')
                .update(out.patch).eq('id', out.priceId)
            if (e1) return friendlyError(e1)
        } else {
            const { data: made, error: e1 } = await supabase.from('product_supplier_prices')
                .insert(out.row).select().single()
            if (e1) return friendlyError(e1)
            priceId = made.id

            if (alsoPrefer) {
                const move = movePreferred(row.product, made, {
                    restaurantId, userId: user?.id, from: out.stranded, at,
                })
                if (move.off) {
                    await supabase.from('product_supplier_prices')
                        .update({ is_preferred: false }).eq('id', move.off)
                }
                const { error: e2 } = await supabase.from('product_supplier_prices')
                    .update({ is_preferred: true }).eq('id', made.id)
                if (e2) return friendlyError(e2)
                await supabase.from('product_price_events').insert(move.event)
            }
        }

        const { error: e3 } = await supabase.from('product_price_events')
            .insert({ ...out.event, price_id: priceId, invoice_line_id: row.stored.id })
        if (e3) return friendlyError(e3)

        // The code follows the price row it now means, so the next document
        // matches itself.
        await pointCode(row, priceId)
        return decide(sameCode(row).map(r => r.stored.id), 'accepted')
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
        return e1 ? friendlyError(e1) : null
    }

    // The supplier renumbered something. The old code's price row is the one
    // this belongs to, and saying so keeps the product's line on the graph in
    // one piece across the change.
    async function sameProduct(row) {
        const successor = row.successor
        const price = data.prices.find(p => p.id === successor.price_id)
        if (!price) return 'That code points at a price the Hub no longer has.'

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

        // The old code keeps its price row and stops being offered, because the
        // thing it named is now bought under the new number.
        await supabase.from('supplier_codes')
            .update({ price_id: null })
            .eq('supplier_id', row.supplierId)
            .eq('restaurant_id', restaurantId)
            .eq('supplier_code', successor.supplier_code)

        const { error: e2 } = await supabase.from('invoice_lines')
            .update({
                price_id: price.id,
                product_id: price.product_id,
                category: lineCategory(price.products, row.supplier),
            })
            .in('id', sameCode(row).map(r => r.stored.id))
        if (e2) return friendlyError(e2)

        // Deliberately undecided. If the price also moved, the line belongs in
        // the pile that asks about that, and it will be there when this reloads.
        return null
    }

    async function matchTo(row, { productId, unitsPerCase }) {
        const product = data.products.find(p => p.id === productId)
        const perCase = num(row.line.price_per_case)
        const perUnit = unitsPerCase > 0
            ? Math.round((perCase / unitsPerCase) * 10000) / 10000
            : null

        // A price row for exactly this pack from this supplier, or a new one.
        // The unique key on the table is what decides, so looking first is the
        // difference between adding a pack and failing on a conflict.
        const existing = data.prices.find(p => (
            p.product_id === productId
            && p.supplier_id === row.supplierId
            && num(p.units_per_case) === unitsPerCase
            && (p.purchase_type || 'case') === 'case'
        ))

        let priceId = existing?.id
        if (existing) {
            const { error: e1 } = await supabase.from('product_supplier_prices')
                .update({ supplier_code: row.line.code, price_per_case: perCase, price_per_unit: perUnit })
                .eq('id', existing.id)
            if (e1) return friendlyError(e1)
        } else {
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
            priceId = made.id

            await supabase.from('product_price_events').insert({
                restaurant_id: restaurantId,
                product_id: productId,
                price_id: priceId,
                price_per_unit: perUnit,
                reason: others.length === 0 ? 'created' : 'by_hand',
                changed_by: user?.id || null,
                invoice_line_id: row.stored.id,
            })
        }

        const failed = await pointCode(row, priceId)
        if (failed) return failed

        const { error: e2 } = await supabase.from('invoice_lines')
            .update({
                price_id: priceId,
                product_id: productId,
                units_per_case: unitsPerCase,
                unit_price: perUnit,
                category: lineCategory(product, row.supplier),
            })
            .in('id', sameCode(row).map(r => r.stored.id))
        if (e2) return friendlyError(e2)

        return decide(sameCode(row).map(r => r.stored.id), 'matched')
    }

    // A delivery charge, a crate deposit, a fuel surcharge. They have codes and
    // they would turn up in this pile every single week.
    async function notStock(row) {
        const reason = await confirm({
            title: 'Not stock?',
            message: `${row.line.description} will stop being offered here, and lines carrying `
                + `code ${row.line.code} will still count towards the week's cost. `
                + 'This is for a delivery charge, a crate deposit and the like.',
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
                        {activeRestaurant?.name}, {waiting === 0 ? 'nothing waiting' : `${waiting} lines waiting`}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        type="date"
                        value={from}
                        onChange={e => setFrom(e.target.value)}
                        aria-label="Look back to"
                        className={dateField}
                    />
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
                        Every line imported since {shortDate(from)} matched something the Hub already
                        knew, at a price it already had.
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
                                        onClick={() => run('clear', () => decide(
                                            piles.unchanged.map(r => r.stored.id), 'matched',
                                        ))}
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
                                            onMatch={() => setMatching(row)}
                                            onNotStock={() => run(`skip-${row.stored.id}`, () => notStock(row))}
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
    row, busy, sameCodeCount, onAccept, onReject, onSameProduct, onMatch, onNotStock,
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
                                {' '}({fmtUnitCost(row.perUnitWas)} to {fmtUnitCost(row.perUnitNow)} a unit)
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
                    which was bought under code {row.successor.supplier_code} and has not appeared
                    since {shortDate(row.successor.last_seen_on)}.
                </p>
            )}

            {sameCodeCount > 1 && (
                <p className="text-xs text-muted mb-2">
                    This code is on {sameCodeCount} lines in here. Deciding once does all of them.
                </p>
            )}

            <div className="flex flex-wrap gap-2">
                {pile === 'price_changed' && !row.packMoved && (
                    <>
                        <button type="button" disabled={!!busy} onClick={() => onAccept(false)} className={rowButton('good')}>
                            Cost from the new price
                        </button>
                        <button type="button" disabled={!!busy} onClick={onReject} className={rowButton()}>
                            Leave our costing alone
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
                    <button type="button" disabled={!!busy} onClick={onSameProduct} className={rowButton('good')}>
                        Yes, same product
                    </button>
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

// A supplier writes in capitals and the catalogue does not. Title case is a
// better starting point than shouting, and it is a starting point: whoever
// creates the product types the name they actually use.
function tidyName(said) {
    return String(said || '')
        .toLowerCase()
        .replace(/\b[a-z]/g, c => c.toUpperCase())
}
