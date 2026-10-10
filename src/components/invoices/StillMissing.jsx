import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase, everyRow } from '@/lib/supabase'
import { fmtMoney } from '@/lib/format'
import { shortDate } from '@/lib/dates'
import { friendlyError } from '@/lib/errors'
import { stillMissing } from '@/lib/supplierDocuments'
import { card, cardHeader, badge, hintClass, rowButton } from '@/lib/controlStyles'
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
//
// **Clear the list** marks what is on it as not needed rather than deleting
// it: nine documents from before 12 September, the weeks he kept as typed
// totals, meant it could never empty itself. See not_needed_at. Anything
// cleared by mistake is put back from the same place, and anything new on a
// list pasted later still shows.
//
// **Cleared is kept, and kept out of the way** (his ask, 5 October): one at a
// time with Not needed, or the whole list. Deleting the row would forget it,
// and the next list pasted would bring it back, so the date it was cleared is
// what remembers. The import screen shows only what is still to download;
// Supplier documents, with `showCleared`, lists what was cleared, to put back.
export default function StillMissing({ restaurantId, refresh = 0, pasteLink = false, showCleared = false }) {
    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState('')
    const [again, setAgain] = useState(0)

    useEffect(() => {
        if (!restaurantId) return
        let alive = true

        async function load() {
            setError('')
            // Every list ever recorded against every invoice ever held, a
            // page at a time. Both pass a thousand rows, and a read that
            // stopped there listed the newest documents, the ones just
            // imported, as still to download.
            const [recorded, held, suppliers] = await Promise.all([
                everyRow(() => supabase.from('supplier_documents')
                    .select('id, supplier_id, document_id, order_reference, document_date, document_type, value, not_needed_at')
                    .eq('restaurant_id', restaurantId)
                    .order('id')),
                everyRow(() => supabase.from('invoices')
                    .select('id, supplier_id, invoice_number, invoice_date, total_amount')
                    .eq('restaurant_id', restaurantId)
                    .order('id')),
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
    }, [restaurantId, refresh, again])

    const missing = useMemo(() => (data ? stillMissing(data.recorded, data.held) : []), [data])
    const cleared = useMemo(() => (data ? stillMissing(data.recorded, data.held, { cleared: true }) : []), [data])

    async function mark(rows, when, key) {
        setBusy(key)
        setError('')
        const { error: e1 } = await supabase.from('supplier_documents')
            .update({ not_needed_at: when })
            .in('id', rows.map(r => r.id))
        setBusy('')
        if (e1) { setError(friendlyError(e1)); return }
        setAgain(n => n + 1)
    }

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
                        {cleared.length
                            ? 'Everything else on the lists you have recorded is in the Hub.'
                            : 'Everything on the lists you have recorded is in the Hub.'}
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
                                        <button
                                            type="button"
                                            disabled={!!busy}
                                            onClick={() => mark([row], new Date().toISOString(), `one-${row.id}`)}
                                            className={rowButton()}
                                        >
                                            {busy === `one-${row.id}` ? 'Clearing...' : 'Not needed'}
                                        </button>
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <p className={hintClass}>
                            Oldest first. Download these off the supplier&apos;s own site and upload them
                            here, and each one drops off this list as it goes in. Not needed takes off
                            one you are not going to download, and Clear the list takes them all.
                        </p>
                        <button
                            type="button"
                            disabled={!!busy}
                            onClick={() => mark(missing, new Date().toISOString(), 'clear')}
                            className={`${rowButton()} mt-3`}
                        >
                            {busy === 'clear' ? 'Clearing...' : 'Clear the list'}
                        </button>
                    </>
                )}

                {showCleared && cleared.length > 0 && (
                    <details className="mt-4 rounded-lg border border-border">
                        <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold text-gray-900 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                            Not needed: {cleared.length} {cleared.length === 1 ? 'document' : 'documents'}
                        </summary>
                        <ul className="divide-y divide-border px-3">
                            {cleared.map(row => (
                                <li
                                    key={`${row.supplier_id}-${row.document_id}`}
                                    className="py-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
                                >
                                    <span className="text-sm text-gray-900 min-w-0">
                                        <span className="font-mono">{row.document_id}</span>
                                        <span className="text-xs text-muted">
                                            {' '}&#183; {named(row.supplier_id)}, {shortDate(row.document_date)}
                                        </span>
                                    </span>
                                    <span className="flex items-center gap-2">
                                        <span className="text-sm tabular-nums text-gray-900">{fmtMoney(row.value)}</span>
                                        <button
                                            type="button"
                                            disabled={!!busy}
                                            onClick={() => mark([row], null, `back-${row.id}`)}
                                            className={rowButton()}
                                        >
                                            {busy === `back-${row.id}` ? 'Putting back...' : 'Put back'}
                                        </button>
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <div className="px-3 pb-3 pt-1">
                            <button
                                type="button"
                                disabled={!!busy}
                                onClick={() => mark(cleared, null, 'back')}
                                className={rowButton()}
                            >
                                {busy === 'back' ? 'Putting back...' : 'Put them all back'}
                            </button>
                        </div>
                    </details>
                )}
            </div>
        </div>
    )
}
