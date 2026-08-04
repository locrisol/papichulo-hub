import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useRestaurant } from '../../context/RestaurantContext'
import { fmtMoney } from '../../lib/format'
import { todayISO, weekStartOf, shortDate, addDays } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import PageContainer from '../../components/layout/PageContainer'
import { secondaryButton, tableHeadRow } from '../../lib/controlStyles'

// Invoice entry, plus the invoices already recorded for that week.
//
// Categories are stored separately, including packaging and cleaning, even
// though the weekly reports add those two together against one 2.5% target.
// Storing them apart means the accountant's monthly split comes out of the same
// data, and separating them properly later is a reporting change rather than a
// migration.
//
// Several invoices from the same supplier on the same day are allowed on
// purpose. It happens often, so there is no uniqueness rule and no overwrite
// warning here. Sales work the other way round, one record per day, so the two
// screens deliberately behave differently.
const CATEGORIES = [
    { value: 'food', label: 'Food' },
    { value: 'packaging', label: 'Packaging' },
    { value: 'cleaning', label: 'Cleaning' },
    { value: 'other', label: 'Other' },
]

function num(v) {
    if (v === '' || v == null) return 0
    const n = parseFloat(v)
    return isNaN(n) ? 0 : n
}

export default function InvoicesPage() {
    const { user } = useAuth()
    const { activeRestaurant } = useRestaurant()
    const navigate = useNavigate()

    const [suppliers, setSuppliers] = useState([])
    const [invoices, setInvoices] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    // Bumped after saving or deleting to make the effect below run again.
    // Cheaper than keeping a load function outside the effect, which would be a
    // new function every render and either loop or need the lint rule silenced.
    const [refresh, setRefresh] = useState(0)

    // The form
    const [supplierId, setSupplierId] = useState('')
    const [invoiceDate, setInvoiceDate] = useState(todayISO())
    const [totalAmount, setTotalAmount] = useState('')
    const [category, setCategory] = useState('food')
    const [notes, setNotes] = useState('')

    // Which week the list below is showing. Follows the date on the form, so
    // entering an invoice from last week shows you last week's invoices.
    const weekStart = weekStartOf(invoiceDate)
    const restaurantId = activeRestaurant?.id

    useEffect(() => {
        if (!restaurantId) return

        // Defined inside the effect on purpose, so the dependency list below is
        // genuinely everything this uses and nothing has to be silenced.
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

            // The week runs Sunday to Saturday, so the end is six days on.
            const end = addDays(weekStart, 6)

            const { data: inv, error: iErr } = await supabase
                .from('invoices')
                .select('*, suppliers(name)')
                .eq('restaurant_id', restaurantId)
                .gte('invoice_date', weekStart)
                .lte('invoice_date', end)
                .order('invoice_date', { ascending: false })

            if (iErr) { setError(friendlyError(iErr)); setLoading(false); return }
            setInvoices(inv || [])
            setLoading(false)
        }

        load()
    }, [restaurantId, weekStart, refresh])

    async function handleSave(e) {
        e.preventDefault()
        setError(''); setSuccess('')

        if (!supplierId) { setError('Pick a supplier'); return }
        const amount = parseFloat(totalAmount)
        if (isNaN(amount) || amount <= 0) { setError('The total has to be a number above zero'); return }

        setSaving(true)
        const { error: e1 } = await supabase.from('invoices').insert({
            restaurant_id: restaurantId,
            supplier_id: supplierId,
            invoice_date: invoiceDate,
            total_amount: amount,
            category,
            week_start: weekStartOf(invoiceDate),
            notes: notes.trim() || null,
            entry_method: 'manual',
            created_by: user.id,
        })
        setSaving(false)

        if (e1) { setError(friendlyError(e1)); return }

        // Keep the supplier, the date and the category: invoices tend to arrive
        // in batches from the same place on the same day.
        setTotalAmount('')
        setNotes('')
        setSuccess('Invoice saved.')
        setRefresh(n => n + 1)
    }

    async function handleDelete(inv) {
        if (!window.confirm(`Delete the ${fmtMoney(inv.total_amount)} invoice from ${inv.suppliers?.name}?`)) return
        const { error: e1 } = await supabase.from('invoices').delete().eq('id', inv.id)
        if (e1) setError(friendlyError(e1))
        else setRefresh(n => n + 1)
    }

    // Weekly totals. Packaging and cleaning are shown together because that is
    // how the weekly report treats them, against a single 2.5% target.
    function totalFor(...cats) {
        return invoices
            .filter(i => cats.includes(i.category))
            .reduce((sum, i) => sum + num(i.total_amount), 0)
    }
    const weekTotal = invoices.reduce((sum, i) => sum + num(i.total_amount), 0)

    const fieldCls = 'w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white'
    const labelCls = 'text-xs text-gray-500 mb-1 block'

    return (
        <PageContainer>
            <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Invoices</h2>
                    <p className="text-sm text-gray-500 mt-1">{activeRestaurant?.name}</p>
                </div>
                {/* This screen only shows the week you are working on. The history
                    is where you go when you are looking for something older. */}
                <button
                    onClick={() => navigate('/invoices/history')}
                    className={secondaryButton}
                >
                    History
                </button>
            </div>

            {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}
            {success && <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3 mb-4">{success}</div>}

            {/* Entry form */}
            <form onSubmit={handleSave} className="bg-white rounded-xl border border-border p-5 mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Add an invoice</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                        <label className={labelCls}>Supplier</label>
                        <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className={fieldCls}>
                            <option value="">Pick a supplier</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelCls}>Category</label>
                        <select value={category} onChange={e => setCategory(e.target.value)} className={fieldCls}>
                            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                    </div>
                </div>

                {/* Two across on a phone, not three. A date box needs about
                    140px to show a whole date, and a third of a phone screen is
                    nowhere near that, so it was showing 04/0 with the rest cut
                    off. */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                    <div>
                        <label className={labelCls}>Invoice date</label>
                        <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className={fieldCls} />
                    </div>
                    <div>
                        <label className={labelCls}>Total</label>
                        <input type="number" step="0.01" inputMode="decimal" value={totalAmount}
                            onChange={e => setTotalAmount(e.target.value)} className={`${fieldCls} text-right`} placeholder="0.00" />
                    </div>
                    <div>
                        <label className={labelCls}>Week starting</label>
                        {/* Worked out from the date, not typed, so it always matches the sales week */}
                        <div className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500">
                            {shortDate(weekStart)}
                        </div>
                    </div>
                </div>

                <div className="mb-3">
                    <label className={labelCls}>Notes</label>
                    <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className={fieldCls}
                        placeholder="Anything worth remembering about this one" />
                </div>

                <div className="flex justify-end">
                    <button type="submit" disabled={saving}
                        className="px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50">
                        {saving ? 'Saving...' : 'Save invoice'}
                    </button>
                </div>
            </form>

            {/* This week's totals. Two across on a phone: these hold nothing but
                a label and a figure, so they do not need the full width, but
                four across left about 80px each and the amounts were cut off
                mid number. */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <div className="bg-white rounded-xl border border-border p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Food</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">{fmtMoney(totalFor('food'))}</p>
                </div>
                <div className="bg-white rounded-xl border border-border p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Packaging and cleaning</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">{fmtMoney(totalFor('packaging', 'cleaning'))}</p>
                </div>
                <div className="bg-white rounded-xl border border-border p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Other</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">{fmtMoney(totalFor('other'))}</p>
                </div>
                <div className="bg-white rounded-xl border border-border p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Week total</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">{fmtMoney(weekTotal)}</p>
                </div>
            </div>

            {/* This week's invoices */}
            <div className="bg-white rounded-xl border border-border p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    Invoices for the week starting {shortDate(weekStart)}
                </h3>
                {loading ? (
                    <p className="text-sm text-gray-400">Loading...</p>
                ) : invoices.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Nothing recorded for this week yet.</p>
                ) : (
                    // Sits inside a padded card rather than in the usual table
                    // box, so it needs its own scrolling wrapper. Without it the
                    // Total column and the Delete buttons are off the edge of a
                    // phone screen with no way to reach them.
                    <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className={tableHeadRow}>
                                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Supplier</th>
                                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Category</th>
                                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Total</th>
                                <th className="w-20"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.map(inv => (
                                <tr key={inv.id} className="border-b border-border">
                                    <td className="px-3 py-2 text-gray-700">{shortDate(inv.invoice_date)}</td>
                                    <td className="px-3 py-2 text-gray-900">
                                        {inv.suppliers?.name || 'Unknown supplier'}
                                        {inv.notes && <span className="block text-xs text-gray-400">{inv.notes}</span>}
                                    </td>
                                    <td className="px-3 py-2 text-gray-500 capitalize">{inv.category}</td>
                                    <td className="px-3 py-2 text-right text-gray-900 font-medium">{fmtMoney(inv.total_amount)}</td>
                                    <td className="px-3 py-2">
                                        <button onClick={() => handleDelete(inv)}
                                            className="text-xs font-medium text-red-500 hover:text-red-700">Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                )}
            </div>
        </PageContainer>
    )
}