import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { fmtMoney, fmtUnitCost, fmtPct, num } from '@/lib/format'
import { shortDate } from '@/lib/dates'
import { friendlyError } from '@/lib/errors'
import { REASONS } from '@/lib/priceEvents'
import { claimIsOpen, claimBalance } from '@/lib/invoiceClaims'
import {
    movesFromEvents, refusedFrom, claimActions, invoiceWeekWords,
} from '@/lib/invoiceReport'
import { badge, rowButton, captionClass, hintClass } from '@/lib/controlStyles'
import ErrorBanner from '@/components/ui/ErrorBanner'

// What the invoices did to this week, on the report.
//
// It sits under the profit and loss because that is where the food cost is, and
// the whole reason for it is that a food cost which moved two points should
// have its reason on the same page rather than in somebody's head.
//
// Three things, and they are three different questions. What the Hub now costs
// from that it did not last week. What a supplier charged that we decided not to
// follow, which is not nothing: the money went out at the new price either way.
// And what is still owed back, which becomes a job on the support list and
// stays there until it is ticked, because an action already carries from week
// to week and that is exactly the list he asked for.

export default function InvoiceWeek({
    restaurantId, weekStart, weekEnd, canEdit, supportSection, onAddActions,
}) {
    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const [said, setSaid] = useState('')

    useEffect(() => {
        if (!restaurantId || !weekStart) return
        let alive = true

        async function load() {
            const [events, refused, claims, credits] = await Promise.all([
                supabase.from('product_price_events')
                    .select('*, products(id, name, unit)')
                    .eq('restaurant_id', restaurantId)
                    .gte('at', `${weekStart}T00:00:00`)
                    .lte('at', `${weekEnd}T23:59:59`)
                    .order('at'),
                supabase.from('invoice_lines')
                    .select('*, products(id, name, unit), product_supplier_prices(price_per_case), invoices!inner(invoice_number, invoice_date, restaurant_id)')
                    .eq('decision', 'rejected')
                    .eq('invoices.restaurant_id', restaurantId)
                    .gte('invoices.invoice_date', weekStart)
                    .lte('invoices.invoice_date', weekEnd),
                // Every open claim, not only this week's. One raised a
                // fortnight ago and still unpaid is exactly the one worth
                // putting in front of somebody.
                supabase.from('invoice_line_claims')
                    .select('*')
                    .eq('restaurant_id', restaurantId)
                    .or(`status.eq.open,settled_on.gte.${weekStart}`),
                supabase.from('invoices')
                    .select('total_amount')
                    .eq('restaurant_id', restaurantId)
                    .eq('document_type', 'credit')
                    .gte('invoice_date', weekStart)
                    .lte('invoice_date', weekEnd),
            ])

            if (!alive) return
            const failed = [events, refused, claims, credits].map(r => r.error).find(Boolean)
            if (failed) { setError(friendlyError(failed)); return }

            setData({
                events: events.data || [],
                refused: refused.data || [],
                claims: claims.data || [],
                credited: Math.abs((credits.data || []).reduce((t, c) => t + num(c.total_amount), 0)),
            })
        }

        load()
        return () => { alive = false }
    }, [restaurantId, weekStart, weekEnd])

    const moves = useMemo(() => movesFromEvents(data?.events), [data])
    const refused = useMemo(() => refusedFrom(data?.refused), [data])
    const jobs = useMemo(
        () => claimActions(data?.claims, supportSection?.items, weekStart),
        [data, supportSection, weekStart],
    )

    if (!data) return null

    const open = data.claims.filter(claimIsOpen)
    const words = invoiceWeekWords({ moves, refused, claims: data.claims, credited: data.credited })

    async function putOnList() {
        setBusy(true)
        setSaid('')
        const failed = await onAddActions(jobs)
        setBusy(false)
        if (failed) { setError(failed); return }
        setSaid('The support list has them now, and they stay on it until they are ticked.')
    }

    return (
        <div className="mt-6 pt-5 border-t border-border">
            <p className={captionClass}>What the invoices did</p>
            <p className="text-sm text-gray-900 mt-1 mb-4">{words}</p>

            {error && <ErrorBanner className="mb-3">{error}</ErrorBanner>}
            {said && <p className="text-sm text-green-700 mb-3">{said}</p>}

            {moves.length > 0 && (
                <div className="mb-5">
                    <p className={captionClass}>What we cost from now</p>
                    <ul className="mt-2 space-y-1">
                        {moves.map(move => (
                            <li key={move.productId} className="flex flex-wrap items-baseline justify-between gap-3 text-sm">
                                <span className="text-gray-900">
                                    {move.product?.name || 'A product'}
                                    <span className="text-xs text-muted">
                                        {' '}&#183; {REASONS[move.reason] || move.reason}
                                        {move.steps > 1 ? `, ${move.steps} changes` : ''}
                                    </span>
                                </span>
                                <span className="tabular-nums whitespace-nowrap">
                                    {move.from == null ? (
                                        <span className="text-muted">first price {fmtUnitCost(move.to)}</span>
                                    ) : (
                                        <>
                                            <span className="text-muted">{fmtUnitCost(move.from)}</span>
                                            {' to '}
                                            <span className="font-bold">{fmtUnitCost(move.to)}</span>
                                            <span className={move.up ? 'text-red-700 ml-2' : 'text-green-700 ml-2'}>
                                                {move.up ? '+' : ''}{fmtPct(move.share)}
                                            </span>
                                        </>
                                    )}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {refused.length > 0 && (
                <div className="mb-5">
                    <p className={captionClass}>Charged, and not taken into our costing</p>
                    <p className={hintClass}>
                        The money went out at the new price either way. This is only where the Hub
                        was told to keep costing from the old one.
                    </p>
                    <ul className="mt-2 space-y-1">
                        {refused.map(row => (
                            <li key={row.lineId} className="flex flex-wrap items-baseline justify-between gap-3 text-sm">
                                <span className="text-gray-900">
                                    {row.product?.name || row.description}
                                    <span className="text-xs text-muted">
                                        {' '}&#183; {row.invoiceNumber} of {shortDate(row.date)}
                                    </span>
                                </span>
                                <span className="tabular-nums whitespace-nowrap text-muted">
                                    they charged {fmtMoney(row.charged)}, we cost from{' '}
                                    {fmtMoney(row.costingFrom)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {open.length > 0 && (
                <div>
                    <p className={captionClass}>Still owed back</p>
                    <ul className="mt-2 space-y-1">
                        {open.map(claim => (
                            <li key={claim.id} className="flex flex-wrap items-baseline justify-between gap-3 text-sm">
                                <span className="text-gray-900">{claim.what}</span>
                                <span className="tabular-nums text-muted whitespace-nowrap">
                                    {claim.amount == null
                                        ? 'not priced yet'
                                        : fmtMoney(claimBalance(claim))}
                                    {' '}&#183; since {shortDate(claim.raised_on)}
                                </span>
                            </li>
                        ))}
                    </ul>

                    {canEdit && (jobs.add.length > 0 || jobs.tick.length > 0) && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button type="button" disabled={busy} onClick={putOnList} className={rowButton('good')}>
                                {busy ? 'Adding...' : 'Put these on the support list'}
                            </button>
                            {jobs.add.length > 0 && (
                                <span className={`${badge} bg-amber-50 text-amber-800 border border-amber-200`}>
                                    {jobs.add.length} to add
                                </span>
                            )}
                            {jobs.tick.length > 0 && (
                                <span className={`${badge} bg-green-50 text-green-800 border border-green-200`}>
                                    {jobs.tick.length} to cross off
                                </span>
                            )}
                        </div>
                    )}
                </div>
            )}

        </div>
    )
}
