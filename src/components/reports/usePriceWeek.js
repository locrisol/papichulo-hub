import { useState, useEffect } from 'react'
import { supabase, everyRow } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { addDays, todayISO } from '@/lib/dates'
import { priceWeek, lookBackFrom, DEFAULT_RECIPE_GAP } from '@/lib/invoiceReport'

// What the invoices said about prices, read live for a report still being
// written.
//
// Half a year of lines, because a code's last delivery before this week can be
// a couple of months back. That is more than a thousand rows on a busy
// restaurant, which is as many as the database hands back in one go, so the
// lines are read a page at a time in a fixed order until a page comes back
// short. Reading them in one request would quietly stop at a thousand and
// every price older than that would look new.

export default function usePriceWeek({ restaurantId, weekStart, threshold, enabled = true, refresh = 0 }) {
    const [data, setData] = useState(null)
    // What the section was worked out from, for the buttons on it: the price
    // rows a decision changes, and the claims the support list is kept from.
    const [rows, setRows] = useState({ prices: [], claims: [] })
    const [error, setError] = useState('')
    // Which read the section on screen came from. Publishing freezes it, so it
    // has to be this week's, read since the last decision, and finished: a
    // report sent while the half year of lines was still paging in went out
    // with no prices, and one sent just after a decision with the old ones.
    const wanted = `${restaurantId}|${weekStart}|${threshold}|${refresh}`
    const [readFor, setReadFor] = useState('')

    useEffect(() => {
        if (!enabled || !restaurantId || !weekStart) return
        let alive = true
        const weekEnd = addDays(weekStart, 6)
        const from = lookBackFrom(weekStart)

        async function load() {
            const [lines, credits, prices, codes, claims, documents, versions, requests] = await Promise.all([
                everyRow(() => supabase.from('invoice_lines')
                    .select('id, invoice_id, supplier_code, product_id, price_id, raw_description, pack_size, '
                        + 'units_per_case, price_per_case, unit_price, cases, units, line_no, line_total, decision, '
                        + 'products(id, name, unit, category, section, piece_weight, recommends), '
                        + 'invoices!inner(id, invoice_number, invoice_date, supplier_id, document_type, total_amount, restaurant_id)')
                    .eq('invoices.restaurant_id', restaurantId)
                    .gte('invoices.invoice_date', from)
                    .lte('invoices.invoice_date', weekEnd)
                    .order('id')),
                supabase.from('invoices')
                    .select('id, invoice_number, invoice_date, total_amount, credit_of_invoice_id, credit_reason, '
                        + 'supplier_id, invoice_lines(supplier_code, raw_description, line_total, products(name))')
                    .eq('restaurant_id', restaurantId)
                    .eq('document_type', 'credit')
                    .gte('invoice_date', from)
                    .lte('invoice_date', weekEnd),
                // Every price and every code ever printed, which grows past a
                // page as surely as the lines do.
                everyRow(() => supabase.from('product_supplier_prices')
                    .select('id, product_id, supplier_id, supplier_code, price_per_case, units_per_case, '
                        + 'price_per_unit, is_preferred, purchase_type, version_id')
                    .eq('restaurant_id', restaurantId)
                    .order('id')),
                everyRow(() => supabase.from('supplier_codes')
                    .select('id, supplier_id, supplier_code, price_id, last_description, pack_size, '
                        + 'first_seen_on, replaces_code, ignored, alternate_group')
                    .eq('restaurant_id', restaurantId)
                    .order('id')),
                // Every claim. Open ones are still owed whatever week they
                // came from, and settled ones carry the reason for a credit.
                supabase.from('invoice_line_claims')
                    .select('*')
                    .eq('restaurant_id', restaurantId),
                // Every document dated in the week, whoever it is from, to say
                // which suppliers the section was read from and which are only
                // a typed total. See readFrom.
                supabase.from('invoices')
                    .select('id, document_type, total_amount, suppliers(name, works_without_codes), invoice_lines(count)')
                    .eq('restaurant_id', restaurantId)
                    .gte('invoice_date', weekStart)
                    .lte('invoice_date', weekEnd),
                // The brand's versions, for what was bought that it does not
                // recommend, and what is waiting on a review here.
                everyRow(() => supabase.from('product_versions')
                    .select('id, product_id, name, is_recommended, is_active')
                    .order('id')),
                supabase.from('product_requests')
                    .select('id, supplier_id, supplier_code, name, description, sent_at, answer')
                    .eq('restaurant_id', restaurantId)
                    .is('answer', null),
            ])

            if (!alive) return
            const failed = [lines, credits, prices, codes, claims, documents, versions, requests].map(r => r.error).find(Boolean)
            if (failed) { setError(friendlyError(failed)); return }

            // The invoices the credits are against, to tell a whole delivery
            // sent back from a line or two. And the ones this week's claims
            // were put against, for the day each delivery landed: a claim
            // whose delivery's report had already gone out comes off this
            // week, and says which week it is from. See fromEarlierWeeks.
            const against = [...new Set([
                ...(credits.data || []).map(c => c.credit_of_invoice_id),
                ...(claims.data || []).filter(c => c.counted_week === weekStart).map(c => c.invoice_id),
            ].filter(Boolean))]
            const invoices = against.length
                ? await supabase.from('invoices')
                    .select('id, invoice_number, invoice_date, total_amount')
                    .in('id', against)
                : { data: [] }
            if (!alive) return
            if (invoices.error) { setError(friendlyError(invoices.error)); return }

            setError('')
            setRows({ prices: prices.data || [], claims: claims.data || [] })
            setData(priceWeek({
                weekStart,
                weekEnd,
                lines: lines.data,
                credits: credits.data || [],
                invoices: invoices.data || [],
                prices: prices.data || [],
                codes: codes.data || [],
                claims: claims.data || [],
                documents: documents.data || [],
                versions: versions.data || [],
                requests: requests.data || [],
                threshold: threshold ?? DEFAULT_RECIPE_GAP,
                today: todayISO(),
            }))
            setReadFor(`${restaurantId}|${weekStart}|${threshold}|${refresh}`)
        }

        load()
        return () => { alive = false }
    }, [restaurantId, weekStart, threshold, enabled, refresh])

    // Never another week's section under this week's heading.
    const shown = data?.weekStart === weekStart ? data : null
    return { data: shown, ready: !!shown && !error && readFor === wanted, error, ...rows }
}
