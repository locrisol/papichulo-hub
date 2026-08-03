import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useRestaurant } from '../../context/RestaurantContext'
import { fmtMoney } from '../../lib/format'
import { todayISO, addDays, shortDate } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import PageContainer from '../../components/layout/PageContainer'
import { secondaryButton, tableHeadRow } from '../../lib/controlStyles'

// Invoice history. The entry screen only shows the week you are working on,
// which is what you want while typing them in, but not when you are looking for
// something. This is the whole record, filtered.
//
// Line items are not shown. They only exist once AI extraction fills them in,
// and that is deferred (#48), so expanding a row would open onto nothing. The
// same goes for a manual or AI badge: everything is manual at the moment.

const CATEGORIES = [
    { value: 'food', label: 'Food' },
    { value: 'packaging', label: 'Packaging' },
    { value: 'cleaning', label: 'Cleaning' },
    { value: 'other', label: 'Other' },
]

// Packaging and cleaning are shown together, because that is how the weekly
// report treats them, against one 2.5% target. They are stored separately, so
// splitting them later is a change here rather than a migration.
const SUMMARY_GROUPS = [
    { label: 'Food', cats: ['food'] },
    { label: 'Packaging and cleaning', cats: ['packaging', 'cleaning'] },
    { label: 'Other', cats: ['other'] },
]

function num(v) {
    if (v === '' || v == null) return 0
    const n = parseFloat(v)
    return isNaN(n) ? 0 : n
}

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
                .select('*, suppliers(name)')
                .eq('restaurant_id', restaurantId)
                .gte('invoice_date', fromDate)
                .lte('invoice_date', toDate)

            if (supplierId) q = q.eq('supplier_id', supplierId)
            if (category) q = q.eq('category', category)

            const { data, error: iErr } = await q.order('invoice_date', { ascending: !sortDesc })

            if (iErr) { setError(friendlyError(iErr)); setLoading(false); return }
            setInvoices(data || [])
            setLoading(false)
        }

        load()
    }, [restaurantId, fromDate, toDate, supplierId, category, sortDesc])

    function totalFor(cats) {
        return invoices
            .filter(i => cats.includes(i.category))
            .reduce((sum, i) => sum + num(i.total_amount), 0)
    }
    const total = invoices.reduce((sum, i) => sum + num(i.total_amount), 0)

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

    const fieldCls = 'w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white'
    const labelCls = 'text-xs text-gray-500 mb-1 block'

    return (
        <PageContainer>
            <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Invoice history</h2>
                    <p className="text-sm text-gray-500 mt-1">{activeRestaurant?.name}</p>
                </div>
                <button
                    onClick={() => navigate('/invoices')}
                    className={secondaryButton}
                >
                    Add an invoice
                </button>
            </div>

            {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}

            {/* Filters */}
            <div className="bg-white rounded-xl border border-border p-4 mb-4">
                <div className="grid grid-cols-4 gap-3 mb-3">
                    <div>
                        <label className={labelCls}>From</label>
                        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className={fieldCls} />
                    </div>
                    <div>
                        <label className={labelCls}>To</label>
                        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className={fieldCls} />
                    </div>
                    <div>
                        <label className={labelCls}>Supplier</label>
                        <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className={fieldCls}>
                            <option value="">All suppliers</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelCls}>Category</label>
                        <select value={category} onChange={e => setCategory(e.target.value)} className={fieldCls}>
                            <option value="">All categories</option>
                            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={() => setRange(7)} className="px-3 py-1.5 border border-border rounded-lg text-xs text-gray-600 hover:bg-gray-50">Last 7 days</button>
                    <button type="button" onClick={() => setRange(30)} className="px-3 py-1.5 border border-border rounded-lg text-xs text-gray-600 hover:bg-gray-50">Last 30 days</button>
                    <button type="button" onClick={() => setRange(90)} className="px-3 py-1.5 border border-border rounded-lg text-xs text-gray-600 hover:bg-gray-50">Last 90 days</button>
                    <button type="button" onClick={clearFilters} className="px-3 py-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium">Clear</button>
                    <span className="ml-auto text-xs text-gray-500">
                        {invoices.length} {invoices.length === 1 ? 'invoice' : 'invoices'}
                    </span>
                </div>
            </div>

            {/* Totals for whatever is showing */}
            <div className="grid grid-cols-4 gap-3 mb-4">
                {SUMMARY_GROUPS.map(g => (
                    <div key={g.label} className="bg-white rounded-xl border border-border p-4">
                        <p className="text-xs text-gray-500 uppercase tracking-wider">{g.label}</p>
                        <p className="text-lg font-semibold text-gray-900 mt-1">{fmtMoney(totalFor(g.cats))}</p>
                    </div>
                ))}
                <div className="bg-white rounded-xl border border-border p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Total</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">{fmtMoney(total)}</p>
                </div>
            </div>

            {/* The invoices */}
            <div className="bg-white rounded-xl border border-border p-5">
                {loading ? (
                    <p className="text-sm text-gray-400">Loading...</p>
                ) : invoices.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No invoices match those filters.</p>
                ) : (
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
                                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Supplier</th>
                                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Category</th>
                                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.map(inv => (
                                <tr key={inv.id} className="border-b border-border hover:bg-gray-50">
                                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{shortDate(inv.invoice_date)}</td>
                                    <td className="px-3 py-2 text-gray-900">
                                        {inv.suppliers?.name || 'Unknown supplier'}
                                        {inv.notes && <span className="block text-xs text-gray-400">{inv.notes}</span>}
                                    </td>
                                    <td className="px-3 py-2 text-gray-500 capitalize">{inv.category}</td>
                                    <td className="px-3 py-2 text-right text-gray-900 font-medium whitespace-nowrap">{fmtMoney(inv.total_amount)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </PageContainer>
    )
}