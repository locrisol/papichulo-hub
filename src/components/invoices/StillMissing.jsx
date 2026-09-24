import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { fmtMoney } from '@/lib/format'
import { shortDate } from '@/lib/dates'
import { friendlyError } from '@/lib/errors'
import { stillMissing } from '@/lib/supplierDocuments'
import { card, cardHeader, badge, hintClass } from '@/lib/controlStyles'
import ErrorBanner from '@/components/ui/ErrorBanner'

// What the suppliers' own lists say exists and the Hub still does not have.
//
// **The list of things still to go and download**, worked out from every list
// ever recorded rather than from what happens to be pasted in a box. Typed in by
// hand is not on it, and neither is a credit already taken off a total typed by
// hand: both are in the Hub already, just without a document behind them.
//
// It sits on the import screen because that is where somebody is the moment the
// question matters, straight after uploading a batch, and on the supplier list
// screen so the check is there without pasting anything. One list in both
// places, so they cannot disagree.
export default function StillMissing({ restaurantId, refresh = 0, pasteLink = false }) {
    const [data, setData] = useState(null)
    const [error, setError] = useState('')

    useEffect(() => {
        if (!restaurantId) return
        let alive = true

        async function load() {
            setError('')
            const [recorded, held, suppliers] = await Promise.all([
                supabase.from('supplier_documents')
                    .select('supplier_id, document_id, order_reference, document_date, document_type, value')
                    .eq('restaurant_id', restaurantId),
                supabase.from('invoices')
                    .select('id, supplier_id, invoice_number, invoice_date, total_amount')
                    .eq('restaurant_id', restaurantId),
                supabase.from('suppliers').select('id, name'),
            ])

            if (!alive) return
            const failed = recorded.error || held.error || suppliers.error
            if (failed) { setError(friendlyError(failed)); return }

            setData({
                recorded: recorded.data || [],
                held: held.data || [],
                suppliers: suppliers.data || [],
            })
        }

        load()
        return () => { alive = false }
    }, [restaurantId, refresh])

    const missing = useMemo(() => (data ? stillMissing(data.recorded, data.held) : []), [data])

    if (error) return <ErrorBanner className="mb-6">{error}</ErrorBanner>
    if (!data) return null

    const named = id => data.suppliers.find(s => s.id === id)?.name || 'A supplier'

    return (
        <div className={`${card} mb-6 overflow-hidden`}>
            <div className={`${cardHeader} flex items-center justify-between gap-3`}>
                <span>Still to download</span>
                <span className="normal-case tracking-normal font-normal">
                    {data.recorded.length ? missing.length : ''}
                </span>
            </div>
            <div className="p-4">
                {!data.recorded.length && (
                    <p className="text-sm text-muted">
                        Nothing to check against yet. Paste a supplier&apos;s list of documents and
                        record it, and anything on it the Hub does not have shows up here.
                        {pasteLink && (
                            <>
                                {' '}
                                <Link to="/invoices/documents" className="font-semibold text-accent-ink underline">
                                    Paste a list
                                </Link>
                            </>
                        )}
                    </p>
                )}

                {data.recorded.length > 0 && missing.length === 0 && (
                    <p className="text-sm text-muted italic">
                        Everything on the lists you have recorded is in the Hub.
                    </p>
                )}

                {missing.length > 0 && (
                    <>
                        <ul className="divide-y divide-border">
                            {missing.map(row => (
                                <li
                                    key={`${row.supplier_id}-${row.document_id}`}
                                    className="py-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
                                >
                                    <span className="text-sm text-gray-900 min-w-0">
                                        <span className="font-mono">{row.document_id}</span>
                                        <span className="text-xs text-muted">
                                            {' '}&#183; {named(row.supplier_id)}, {shortDate(row.document_date)}
                                            {row.document_type === 'credit' && row.order_reference
                                                ? `, credits ${row.order_reference}`
                                                : ''}
                                        </span>
                                    </span>
                                    <span className="flex items-center gap-2">
                                        {row.document_type === 'credit' && (
                                            <span className={`${badge} border bg-green-50 text-green-800 border-green-200`}>
                                                Credit
                                            </span>
                                        )}
                                        <span className="text-sm tabular-nums text-gray-900">{fmtMoney(row.value)}</span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <p className={hintClass}>
                            Oldest first. Download these off the supplier&apos;s own site and upload them
                            here, and each one drops off this list as it goes in.
                        </p>
                    </>
                )}
            </div>
        </div>
    )
}
