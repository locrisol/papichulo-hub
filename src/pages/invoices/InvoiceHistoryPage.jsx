import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useRestaurant } from '@/context/restaurant'
import { fmtMoney, num } from '@/lib/format'
import { todayISO, addDays, shortDate } from '@/lib/dates'
import { friendlyError } from '@/lib/errors'
import { secondaryButton, tableHeadRow, card, cardEdge, cardHeader, rowButton, labelClass, fieldClass, pageTitle } from '@/lib/controlStyles'
import {
    INVOICE_CATEGORIES, INVOICE_SUMMARY_CARDS, invoiceCategory, invoiceSplit, mainCategory, spentIn,
} from '@/lib/invoiceCategories'
import ErrorBanner from '@/components/ui/ErrorBanner'
import CategoryBadges from '@/components/invoices/CategoryBadges'

// Invoice history. The entry screen only shows the week you are working on,
// which is what you want while typing them in, but not when you are looking for
// something. This is the whole record, filtered.
//
// An invoice read off a document is shown by what its lines were spent on,
// VAT and deposit included, and one typed in off a total by its own category.
// The totals and the category filter go the same way, so a delivery of mops
// and foil is never counted as food because of the label it was filed under.


export default function InvoiceHistoryPage() {
    const navigate = useNavigate()
    const { activeRestaurant } = useRestaurant()

    const [invoices, setInvoices] = useState([])
    const [suppliers, setSuppliers] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    // Last 30 days to start with, which covers the usual "where is that invoice"
    // without pulling the whole history every time you open the page.
    const [fromDate, setFromDate] = useState(addDays(todayISO(), -30))
    const [toDate, setToDate] = useState(todayISO())
    const [supplierId, setSupplierId] = useState('')
    const [category, setCategory] = useState('')
    const [sortDesc, setSortDesc] = useState(true)

    const restaurantId = activeRestaurant?.id

    useEffect(() => {
        if (!restaurantId) return

        async function load() {
            setLoading(true)
            setError('')

            const { data: sup, error: sErr } = await supabase
                .from('suppliers')
                .select('*')
                .eq('is_active', true)
                .order('name')

            if (sErr) { setError(friendlyError(sErr)); setLoading(false); return }
            setSuppliers(sup || [])

            // Build the query up in pieces so the filters that are set are the
            // only ones applied.
            let q = supabase
                .from('invoices')
                .select('*, suppliers(name), invoice_lines(category, line_total, vat_amount, deposit_amount)')
                .eq('restaurant_id', restaurantId)
                .gte('invoice_date', fromDate)
                .lte('invoice_date', toDate)

            if (supplierId) q = q.eq('supplier_id', supplierId)

            const { data, error: iErr } = await q.order('invoice_date', { ascending: !sortDesc })

            if (iErr) { setError(friendlyError(iErr)); setLoading(false); return }
            setInvoices(data || [])
            setLoading(false)
        }

        load()
    }, [restaurantId, fromDate, toDate, supplierId, sortDesc])

    // By what the money went on rather than by the label, so an invoice that
    // was part packaging turns up under packaging too.
    const shown = category
        ? invoices.filter(inv => invoiceSplit(inv).some(s => s.category === category))
        : invoices

    function totalFor(cats) {
        return spentIn(shown, cats)
    }
    const total = shown.reduce((sum, i) => sum + num(i.total_amount), 0)

    // Jump the range to something common, rather than making you pick two dates
    // every time.
    function setRange(days) {
        setFromDate(addDays(todayISO(), -days))
        setToDate(todayISO())
    }

    function clearFilters() {
        setRange(30)
        setSupplierId('')
        setCategory('')
    }


    return (
        <>
            <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h2 className={pageTitle}>Invoice history</h2>
                    <p className="text-sm text-gray-500 mt-1">{activeRestaurant?.name}</p>
                </div>
                <button
                    onClick={() => navigate('/invoices')}
                    className={secondaryButton}
                >
                    Add an invoice
                </button>
            </div>

            {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}

            {/* Filters */}
            <div className={`${card} p-4 mb-4`}>
                {/* Two across on a phone. Four across gave each date box a
                    quarter of the screen, which showed a single digit. */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                    <div>
                        <label className={labelClass}>From</label>
                        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className={fieldClass} />
                    </div>
                    <div>
                        <label className={labelClass}>To</label>
                        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className={fieldClass} />
                    </div>
                    <div>
                        <label className={labelClass}>Supplier</label>
                        <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className={fieldClass}>
                            <option value="">All suppliers</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelClass}>Category</label>
                        <select value={category} onChange={e => setCategory(e.target.value)} className={fieldClass}>
                            <option value="">All categories</option>
                            {INVOICE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={() => setRange(7)} className="px-3 py-1.5 border border-border rounded-lg text-xs text-gray-600 hover:bg-gray-50">Last 7 days</button>
                    <button type="button" onClick={() => setRange(30)} className="px-3 py-1.5 border border-border rounded-lg text-xs text-gray-600 hover:bg-gray-50">Last 30 days</button>
                    <button type="button" onClick={() => setRange(90)} className="px-3 py-1.5 border border-border rounded-lg text-xs text-gray-600 hover:bg-gray-50">Last 90 days</button>
                    <button type="button" onClick={clearFilters} className={rowButton('edit')}>Clear</button>
                </div>
            </div>

            {/* Totals for whatever is showing. Two across on a phone, same as
                the invoices screen. */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                {INVOICE_SUMMARY_CARDS.map(g => (
                    <div
                        key={g.label}
                        className={`${cardEdge} p-4 ${g.tint || 'bg-white'}`}
                        style={g.split ? { backgroundImage: g.split } : undefined}
                    >
                        <p className={`text-xs uppercase tracking-wider ${g.labelText}`}>{g.label}</p>
                        <p className="text-lg font-semibold text-gray-900 mt-1">{fmtMoney(totalFor(g.cats))}</p>
                    </div>
                ))}
                {/* The sum of the three, so it is the dark one rather than a
                    fourth colour competing with them. */}
                <div className={`${cardEdge} p-4 bg-sidebar`}>
                    <p className="text-xs text-green-300 uppercase tracking-wider">Total</p>
                    <p className="text-lg font-semibold text-white mt-1">{fmtMoney(total)}</p>
                </div>
            </div>

            {/* The invoices */}
            <div className={`${card} overflow-hidden`}>
                <h3 className={cardHeader}>
                    {shown.length} {shown.length === 1 ? 'invoice' : 'invoices'} found
                </h3>
                <div className="p-5">
                {loading ? (
                    <p className="text-sm text-muted">Loading...</p>
                ) : shown.length === 0 ? (
                    <p className="text-sm text-muted italic">No invoices match those filters.</p>
                ) : (
                    // Same as the invoices screen: this table is inside a padded
                    // card, so it needs its own scrolling wrapper or the Total
                    // column is off the edge of a phone.
                    <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className={tableHeadRow}>
                                <th className="text-left px-3 py-2 w-28">
                                    {/* Sorting by date is the only one worth having: you are
                                        almost always looking for something recent or something
                                        from a particular week. */}
                                    <button
                                        onClick={() => setSortDesc(!sortDesc)}
                                        className="text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-900"
                                    >
                                        Date {sortDesc ? '↓' : '↑'}
                                    </button>
                                </th>
                                <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider">Supplier</th>
                                <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider w-28">Category</th>
                                <th className="text-right px-3 py-2 text-xs font-semibold uppercase tracking-wider w-28">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map(inv => {
                                const cat = invoiceCategory(mainCategory(invoiceSplit(inv), inv.category))
                                return (
                                <tr key={inv.id} className={`border-b border-border hover:bg-gray-50 border-l-4 ${cat.stripe}`}>
                                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{shortDate(inv.invoice_date)}</td>
                                    <td className="px-3 py-2 text-gray-900">
                                        {inv.suppliers?.name || 'Unknown supplier'}
                                        {inv.notes && <span className="block text-xs text-muted">{inv.notes}</span>}
                                    </td>
                                    <td className="px-3 py-2">
                                        {/* Same colours as the entry screen, so a
                                            category means one thing everywhere. */}
                                        <CategoryBadges invoice={inv} />
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-900 font-medium whitespace-nowrap">{fmtMoney(inv.total_amount)}</td>
                                </tr>
                                )
                            })}
                        </tbody>
                    </table>
                    </div>
                )}
                </div>
            </div>
        </>
    )
}