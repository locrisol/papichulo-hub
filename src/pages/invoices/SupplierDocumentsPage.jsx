import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase, everyRow } from '@/lib/supabase'
import { useRestaurant } from '@/context/restaurant'
import { fmtMoney, fmtPct } from '@/lib/format'
import { shortDate, fullDate, todayISO, addDays } from '@/lib/dates'
import { orderByUse, USE_WINDOW_DAYS } from '@/lib/supplierOrder'
import { friendlyError } from '@/lib/errors'
import {
    LIST_READERS, listReaderFor, portalSummary, compareDocuments, pairCredits, creditDelays,
} from '@/lib/supplierDocuments'
import {
    card, cardEdge, cardHeader, primaryButton, secondaryButton, labelClass,
    fieldClass, hintClass, badge, captionClass, tableCard, tableHeadRow, tableHeadCell,
} from '@/lib/controlStyles'
import ErrorBanner from '@/components/ui/ErrorBanner'
import Notice from '@/components/ui/Notice'
import PageHeader from '@/components/ui/PageHeader'
import StillMissing from '@/components/invoices/StillMissing'

// What the supplier says it sent us, against what we actually hold.
//
// The portal is a web page with a row per document and no export, no API and no
// way to download the list, so the way in is to select the table in the browser
// and copy it. That sounds crude and it is the cheapest useful thing in the
// whole feature: comparing the documents we hold against the documents we hold
// can never find one that was never downloaded at all.
//
// Recorded, it keeps working after the box is cleared. Still to download, at
// the foot of this page and of the import screen, is every recorded document
// the Hub does not have. And the import reads it to know for certain whether a
// credit note was already taken off a total typed in by hand, where without it
// all it has is the date to go on.
//
// It does not close a claim when it shows a credit has been issued. Only
// importing the credit note does that.

export default function SupplierDocumentsPage() {
    const { activeRestaurant } = useRestaurant()
    const restaurantId = activeRestaurant?.id

    const [suppliers, setSuppliers] = useState([])
    const [supplierId, setSupplierId] = useState('')
    const [paste, setPaste] = useState('')
    const [held, setHeld] = useState([])
    const [error, setError] = useState('')
    const [said, setSaid] = useState('')
    const [saving, setSaving] = useState(false)
    const [refresh, setRefresh] = useState(0)

    useEffect(() => {
        if (!restaurantId) return
        let alive = true

        async function load() {
            setError('')
            // Every invoice held, a page at a time, since there are more than
            // one read hands back. One missing would show a document the Hub
            // has as not downloaded.
            const [sup, inv] = await Promise.all([
                supabase.from('suppliers').select('id, name').eq('is_active', true),
                everyRow(() => supabase.from('invoices')
                    .select('id, invoice_number, invoice_date, total_amount, supplier_id, document_type')
                    .eq('restaurant_id', restaurantId)
                    .order('id')),
            ])
            if (!alive) return
            if (sup.error || inv.error) { setError(friendlyError(sup.error || inv.error)); return }
            // The order the Invoices page offers them in, most used first, so
            // the supplier this page is nearly always about is at the top.
            const recent = addDays(todayISO(), -USE_WINDOW_DAYS)
            const ordered = orderByUse(sup.data || [], (inv.data || []).filter(i => i.invoice_date >= recent))
            setSuppliers(ordered)
            setHeld(inv.data || [])

            // With one supplier whose list can be read there is nothing to
            // choose, so it is chosen already.
            const readable = ordered.filter(s => listReaderFor(s))
            if (readable.length === 1) setSupplierId(id => id || readable[0].id)
        }

        load()
        return () => { alive = false }
    }, [restaurantId, refresh])

    // Read as you type, because the one thing worth knowing before anything is
    // saved is whether the paste came out whole. Before a supplier is picked it
    // is read the only way there is so far.
    const reader = listReaderFor(suppliers.find(s => s.id === supplierId)) || LIST_READERS[0]
    const read = useMemo(() => reader.read(paste), [reader, paste])
    const readableNames = suppliers.filter(s => listReaderFor(s)).map(s => s.name)
    const summary = useMemo(() => portalSummary(read.rows), [read.rows])
    const mine = useMemo(
        () => held.filter(h => h.supplier_id === supplierId),
        [held, supplierId],
    )
    const against = useMemo(() => compareDocuments(read.rows, mine), [read.rows, mine])
    const pairs = useMemo(() => pairCredits(read.rows), [read.rows])
    const delays = useMemo(() => creditDelays(pairs.pairs), [pairs.pairs])

    const slowest = delays.length ? Math.max(...delays.map(d => d.days)) : null

    async function save() {
        if (!supplierId || !read.rows.length) return
        setSaving(true)
        setError('')
        setSaid('')

        const rows = read.rows.map(row => ({
            restaurant_id: restaurantId,
            supplier_id: supplierId,
            document_id: row.document_id,
            order_reference: row.order_reference,
            document_date: row.document_date,
            document_type: row.document_type,
            value: row.value,
            // The Hub's own row for this document: imported, or typed in by
            // hand at the same total. A pairing with a difference in it is left
            // unlinked, because it is a question rather than an answer.
            invoice_id: linkedTo(against.status.get(row.document_id)),
        }))

        // Pasting an overlapping month again is normal and must not fail, so
        // the document number is what decides and the newest paste wins.
        const { error: e1 } = await supabase.from('supplier_documents')
            .upsert(rows, { onConflict: 'supplier_id,restaurant_id,document_id' })

        setSaving(false)
        if (e1) { setError(friendlyError(e1)); return }
        setSaid(`${rows.length} ${rows.length === 1 ? 'document' : 'documents'} recorded.`)
        setRefresh(n => n + 1)
    }

    return (
        <>
            <PageHeader title="Supplier documents" subtitle={activeRestaurant?.name}>
                <Link to="/invoices/import" className={secondaryButton}>Import invoices</Link>
                <Link to="/invoices" className={secondaryButton}>Invoices</Link>
            </PageHeader>

            <ErrorBanner className="mb-4">{error}</ErrorBanner>
            <Notice tone="good" className="mb-4">{said}</Notice>

            <div className={`${card} mb-6 overflow-hidden`}>
                <div className={cardHeader}>Paste the supplier's list</div>
                <div className="p-5">
                    <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
                        <div>
                            <label className={labelClass} htmlFor="documents-supplier">Supplier</label>
                            <select
                                id="documents-supplier"
                                value={supplierId}
                                onChange={e => setSupplierId(e.target.value)}
                                className={fieldClass}
                            >
                                <option value="">Pick a supplier</option>
                                {suppliers.map(s => (
                                    <option key={s.id} value={s.id} disabled={!listReaderFor(s)}>
                                        {listReaderFor(s) ? s.name : `${s.name} (not available yet)`}
                                    </option>
                                ))}
                            </select>
                            {readableNames.length > 0 && (
                                <p className={hintClass}>
                                    Only {readableNames.length === 1 ? 'the list' : 'the lists'} from{' '}
                                    {readableNames.join(' and ')} can be read so far.
                                </p>
                            )}
                        </div>
                        <div>
                            <label className={labelClass} htmlFor="documents-paste">
                                Select their document table in the browser and paste it here
                            </label>
                            {/* A fixed height that scrolls, not one that grows: a
                                supplier's list can be hundreds of rows, and the page
                                under it disappeared (his ask, 5 October). */}
                            <textarea
                                id="documents-paste"
                                rows={8}
                                value={paste}
                                onChange={e => setPaste(e.target.value)}
                                className={`${fieldClass} font-mono resize-y overflow-y-auto`}
                                placeholder={'2017891\t45448455\t\t2026-08-23\tInvoice\t€163.03\tView'}
                            />
                            <p className={hintClass}>
                                Column headings can be included. Pasting the same list again is safe.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {read.rows.length > 0 && (
                <>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
                        <Figure label="Documents" value={summary.documents}
                            under={`${summary.invoices} invoices, ${summary.credits} credits`} />
                        <Figure label="Invoiced" value={fmtMoney(summary.invoiced)}
                            under={summary.from ? `${shortDate(summary.from)} to ${shortDate(summary.to)}` : ''} />
                        <Figure label="Credited" value={fmtMoney(summary.credited)}
                            under={summary.creditedPct == null ? '' : `${fmtPct(summary.creditedPct)} of what was invoiced`} />
                        <Figure
                            label="Not in the Hub"
                            value={against.missing.length}
                            under={against.byHand.length
                                ? `${against.byHand.length} more were typed in by hand`
                                : (against.missing.length ? 'never downloaded' : 'nothing at all')}
                        />
                    </div>

                    {read.problems.length > 0 && (
                        <div className={`${card} p-4 mb-6`}>
                            <p className={captionClass}>Lines that were not read</p>
                            <ul className="mt-2 space-y-1 text-xs text-red-800">
                                {read.problems.slice(0, 8).map((p, i) => (
                                    <li key={`${p.why}-${i}`} className="font-mono break-all">
                                        {p.why === 'twice' ? `${p.documentId} is in the paste twice` : p.line}
                                    </li>
                                ))}
                            </ul>
                            {read.problems.length > 8 && (
                                <p className={hintClass}>and {read.problems.length - 8} more.</p>
                            )}
                        </div>
                    )}

                    {summary.accounts.length > 1 && (
                        <Notice tone="warn" className="mb-6">
                            <strong className="font-bold">
                                There are {summary.accounts.length} account numbers in this paste.
                            </strong>{' '}
                            One account is one restaurant, so this is either two shops copied
                            together or a page that was not the document list.
                        </Notice>
                    )}

                    {/* Every credit over the month this was designed against came
                        the same day or the next, which is what makes uploading a
                        week at a time work at all. */}
                    {delays.length > 0 && (
                        <p className="text-xs text-muted mb-6">
                            {pairs.pairs.length} of the {summary.credits} credits point at an invoice
                            in this paste, the slowest {slowest} {slowest === 1 ? 'day' : 'days'}{' '}
                            after it.
                            {pairs.loose.length > 0 && (
                                <> {pairs.loose.length} point at an invoice outside it.</>
                            )}
                        </p>
                    )}

                    {/* A card a document on a phone, where five columns would
                        scroll sideways. The number and its value are the pair
                        anybody is matching against the paper. */}
                    <div className="md:hidden space-y-3 mb-6">
                        {read.rows.map(row => {
                            const where = against.status.get(row.document_id) || { status: 'missing' }
                            return (
                                <div
                                    key={row.document_id}
                                    className={`${cardEdge} p-4 ${where.status === 'missing' ? 'bg-amber-50' : 'bg-white'}`}
                                >
                                    <div className="flex items-baseline justify-between gap-3">
                                        <span className="text-sm font-mono text-gray-900 min-w-0 break-all">{row.document_id}</span>
                                        <span className="text-sm font-semibold tabular-nums text-gray-900 whitespace-nowrap">
                                            {fmtMoney(row.value)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted mt-1">
                                        {shortDate(row.document_date)}
                                        {row.order_reference && <> &#183; against <span className="font-mono">{row.order_reference}</span></>}
                                    </p>
                                    <div className="mt-2">
                                        <Held where={where} />
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    <div className={`${tableCard} hidden md:block mb-6`}>
                        <table className="w-full">
                            <thead>
                                <tr className={tableHeadRow}>
                                    <th className={`${tableHeadCell} text-left px-4 py-2`}>Document</th>
                                    <th className={`${tableHeadCell} text-left px-4 py-2`}>Date</th>
                                    <th className={`${tableHeadCell} text-left px-4 py-2`}>Against</th>
                                    <th className={`${tableHeadCell} text-right px-4 py-2`}>Value</th>
                                    <th className={`${tableHeadCell} text-left px-4 py-2`}>Held</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {read.rows.map(row => {
                                    const where = against.status.get(row.document_id) || { status: 'missing' }
                                    return (
                                        <tr key={row.document_id} className={where.status === 'missing' ? 'bg-amber-50/60' : ''}>
                                            <td className="px-4 py-2 text-sm font-mono text-gray-900">
                                                {row.document_id}
                                            </td>
                                            <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">
                                                {shortDate(row.document_date)}
                                            </td>
                                            <td className="px-4 py-2 text-xs font-mono text-muted">
                                                {row.order_reference || ''}
                                            </td>
                                            <td className="px-4 py-2 text-sm text-right tabular-nums text-gray-900">
                                                {fmtMoney(row.value)}
                                            </td>
                                            <td className="px-4 py-2">
                                                <Held where={where} />
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    {against.extra.length > 0 && (
                        <div className={`${card} p-4 mb-6`}>
                            <p className={captionClass}>Held here and not on their list</p>
                            <p className="text-xs text-muted mt-1 mb-2">
                                Nearly always empty. When it is not, it usually means a document was
                                filed against the wrong supplier, or the paste covers a different
                                month.
                            </p>
                            <ul className="text-sm text-gray-900 space-y-1">
                                {against.extra.map(h => (
                                    <li key={h.id} className="font-mono">
                                        {h.invoice_number} {fullDate(h.invoice_date)}{' '}
                                        {fmtMoney(h.total_amount)}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className={`${card} p-4 flex flex-wrap items-center justify-between gap-3`}>
                        <p className="text-sm text-muted">
                            Recording the list changes no figure anywhere. It is only what the Hub
                            checks itself against.
                        </p>
                        <button
                            type="button"
                            disabled={!supplierId || saving}
                            onClick={save}
                            className={primaryButton('md', 'good')}
                        >
                            {saving ? 'Recording...' : 'Record the list'}
                        </button>
                    </div>
                </>
            )}

            {/* Everything ever recorded, not only what is in the box, so the
                check is here without pasting anything. */}
            <StillMissing restaurantId={restaurantId} refresh={refresh} showCleared />
        </>
    )
}

// What each state is called on screen.
//
// **Typed in by hand is not missing.** Eight months of invoices went in that
// way, off a total with no number on it, and the first version of this page
// called every one of them not downloaded because a number was all it looked
// for. A credit taken off a total before it was typed is not missing either:
// its money is already in the Hub, inside that total.
const HELD = {
    held: { words: 'In the Hub', tint: 'bg-green-50 text-green-800 border-green-200' },
    by_hand: { words: 'Typed in by hand', tint: 'bg-blue-50 text-blue-800 border-blue-200' },
    in_hand_total: { words: 'In a typed total', tint: 'bg-blue-50 text-blue-800 border-blue-200' },
    missing: { words: 'Not in the Hub', tint: 'bg-amber-50 text-amber-800 border-amber-200' },
}

// Whether the Hub has it, and what it was typed as when that differs. The
// same on a phone card and in the table.
function Held({ where }) {
    const look = HELD[where.status]
    return (
        <>
            <span className={`${badge} border ${look.tint}`}>{look.words}</span>
            {where.differs ? (
                <span className="block text-xs text-muted mt-0.5 whitespace-nowrap">
                    typed as {fmtMoney(where.invoice.total_amount)}
                </span>
            ) : null}
        </>
    )
}

function linkedTo(where) {
    if (!where?.invoice) return null
    if (where.status === 'held') return where.invoice.id
    if (where.status === 'by_hand' && !where.differs) return where.invoice.id
    return null
}

function Figure({ label, value, under }) {
    return (
        <div className={`${card} p-4`}>
            <p className={captionClass}>{label}</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{value}</p>
            {under && <p className="text-xs text-muted mt-0.5">{under}</p>}
        </div>
    )
}
