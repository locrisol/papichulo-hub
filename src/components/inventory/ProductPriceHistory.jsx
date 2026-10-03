import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { seriesFor } from '@/lib/priceHistory'
import { card, cardHeader, hintClass } from '@/lib/controlStyles'
import ErrorBanner from '@/components/ui/ErrorBanner'
import PriceHistoryChart from '@/components/inventory/PriceHistoryChart'

// The chart's data, kept apart from its drawing.
//
// Two different questions are being answered at once and they come from two
// different places, which is the whole reason this feature was built the way it
// was. **What a supplier charged is evidence** and comes off the invoice lines.
// **What the Hub costs from is a decision** and comes off the price events,
// because buying from somebody else moves it and no document is ever sent about
// that.
//
// A voided invoice is left out. A delivery that was reversed in full the next
// day is not evidence of what anything costs, and three of those turned up in
// the one month this was designed against.
//
// refresh is bumped by the page whenever it moves a price, so the chart above
// the rows follows the change straight away. What is drawn stays until the new
// answer replaces it, so the chart does not blink out and back.
export default function ProductPriceHistory({ productId, restaurantId, product, suppliers, refresh = 0 }) {
    const [data, setData] = useState(null)
    const [error, setError] = useState('')

    useEffect(() => {
        if (!productId || !restaurantId) return
        let alive = true

        async function load() {
            setError('')
            const [lines, events, credits] = await Promise.all([
                supabase.from('invoice_lines')
                    .select('unit_price, invoices!inner(id, invoice_date, invoice_number, supplier_id, document_type, restaurant_id, total_amount)')
                    .eq('product_id', productId)
                    .eq('invoices.restaurant_id', restaurantId),
                supabase.from('product_price_events')
                    .select('at, price_per_unit, reason')
                    .eq('product_id', productId)
                    .eq('restaurant_id', restaurantId)
                    .order('at'),
                // Every credit that points at an invoice. Whether it reverses
                // the whole of one is worked out below rather than in the
                // query, because that takes both totals and a self join for a
                // handful of rows is not worth the shape it forces.
                supabase.from('invoices')
                    .select('id, credit_of_invoice_id, total_amount')
                    .eq('restaurant_id', restaurantId)
                    .eq('document_type', 'credit')
                    .not('credit_of_invoice_id', 'is', null),
            ])

            if (!alive) return
            const failed = lines.error || events.error || credits.error
            if (failed) { setError(friendlyError(failed)); return }

            // A delivery reversed in full the next day is not evidence of what
            // anything costs. Three of those turned up in the one month this
            // was designed against, a whole day's deliveries sent back.
            const totals = new Map(
                (lines.data || []).map(l => [l.invoices?.id, Number(l.invoices?.total_amount)]),
            )
            const voided = new Set(
                (credits.data || [])
                    .filter(c => totals.has(c.credit_of_invoice_id)
                        && Math.abs(Number(c.total_amount) + totals.get(c.credit_of_invoice_id)) < 0.005)
                    .map(c => c.credit_of_invoice_id),
            )

            setData({
                lines: (lines.data || []).filter(l => !voided.has(l.invoices?.id)),
                events: events.data || [],
            })
        }

        load()
        return () => { alive = false }
    }, [productId, restaurantId, refresh])

    const series = useMemo(
        () => (data ? seriesFor({ ...data, suppliers }) : null),
        [data, suppliers],
    )

    if (error) return <ErrorBanner className="mb-6">{error}</ErrorBanner>
    if (!series) return null

    return (
        <div className={`${card} mb-6 overflow-hidden`}>
            <div className={cardHeader}>What it has cost</div>
            <div className="p-4 sm:p-5">
                <PriceHistoryChart series={series} unit={product?.unit || 'unit'} />
                <p className={hintClass}>
                    Prices are per {product?.unit || 'unit'}, so suppliers with different case sizes
                    can be compared. A filled dot is from an invoice and a hollow dot is a change
                    made in the Hub. The thick line is the cost the Hub uses. It moves when a
                    supplier's price changes or when a different price is set as preferred.
                </p>
            </div>
        </div>
    )
}
