import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useRestaurant } from '../../context/RestaurantContext'
import { fmtMoney } from '../../lib/format'
import { todayISO, weekStartOf, shortDate, addDays, fullDate } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import PageContainer from '../../components/layout/PageContainer'
import { secondaryButton, card, cardEdge } from '../../lib/controlStyles'
import { numberField } from '../../lib/numberInput'
import { INVOICE_CATEGORIES, INVOICE_SUMMARY_CARDS, invoiceCategory, groupByDay } from '../../lib/invoiceCategories'

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
    // Nothing chosen to start with. It used to default to food, which is the
    // commonest, but a default that is right most of the time is exactly the
    // one nobody checks, and filing a packaging invoice under food moves money
    // between two different cost targets.
    const [category, setCategory] = useState('')
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
        if (!category) { setError('Pick a category'); return }
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

        // Everything clears, including the supplier and the category.
        //
        // It used to keep them, on the grounds that invoices arrive in batches
        // from the same place. They do, but a form that comes back already
        // filled in is a form nobody reads, and the cost of getting it wrong is
        // an invoice filed under the wrong target. The date stays, since that
        // is the one thing a batch really does share.
        setSupplierId('')
        setCategory('')
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
            <form onSubmit={handleSave} className={`${card} p-5 mb-4`}>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Add an invoice</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                        <label className={labelCls}>Supplier</label>
                        <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className={fieldCls}>
                            <option value="">Pick a supplier</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    {/* Buttons rather than a dropdown.
                        //
                        A dropdown only shows the colour once the choice is
                        already made, and browsers will not colour the options
                        inside one in any way that can be relied on. With four
                        buttons all the colours are visible while you are
                        choosing, which is the point, and on a phone it is one
                        tap instead of two. */}
                    <div>
                        <label className={labelCls}>Category</label>
                        <div className="flex flex-wrap gap-2">
                            {INVOICE_CATEGORIES.map(c => (
                                <button
                                    key={c.value}
                                    type="button"
                                    onClick={() => setCategory(c.value)}
                                    aria-pressed={category === c.value}
                                    className={`px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                                        category === c.value ? c.solid : `${c.soft} hover:brightness-95`
                                    }`}
                                >
                                    {c.label}
                                </button>
                            ))}
                        </div>
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
                        <input {...numberField({ value: totalAmount, onChange: setTotalAmount })}
                            className={`${fieldCls} text-right`} placeholder="0.00" />
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
                {INVOICE_SUMMARY_CARDS.map(g => (
                    <div
                        key={g.label}
                        className={`${cardEdge} p-4 ${g.tint || 'bg-white'}`}
                        style={g.split ? { backgroundImage: g.split } : undefined}
                    >
                        <p className={`text-xs uppercase tracking-wider ${g.labelText}`}>{g.label}</p>
                        <p className="text-lg font-semibold text-gray-900 mt-1">{fmtMoney(totalFor(...g.cats))}</p>
                    </div>
                ))}
                {/* The sum of the three, so it is the dark one rather than a
                    fourth colour competing with them. */}
                <div className={`${cardEdge} p-4 bg-sidebar`}>
                    <p className="text-xs text-green-300 uppercase tracking-wider">Week total</p>
                    <p className="text-lg font-semibold text-white mt-1">{fmtMoney(weekTotal)}</p>
                </div>
            </div>

            {/* This week's invoices */}
            <div className={`${card} p-5`}>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    Invoices for the week starting {shortDate(weekStart)}
                </h3>
                {loading ? (
                    <p className="text-sm text-gray-400">Loading...</p>
                ) : invoices.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Nothing recorded for this week yet.</p>
                ) : (
                    // One block per day, newest first, each with its own
                    // total. It used to be one long run of rows, so on a busy
                    // week there was no telling where Monday's deliveries ended
                    // and Tuesday's began without reading every date.
                    //
                    // Still in a scrolling wrapper: it sits inside a padded card
                    // rather than the usual table box, and without it the Total
                    // column and the Delete buttons are off the edge of a phone.
                    <div className="overflow-x-auto space-y-4">
                        {groupByDay(invoices).map(day => (
                            <div key={day.date} className="border border-border rounded-lg overflow-hidden">
                                <div className="bg-gray-100 border-b border-border px-3 py-2 flex items-center justify-between gap-3">
                                    <span className="text-sm font-semibold text-gray-800">{fullDate(day.date)}</span>
                                    <span className="text-sm text-gray-600">
                                        {day.rows.length} {day.rows.length === 1 ? 'invoice' : 'invoices'}
                                        <span className="ml-3 font-semibold text-gray-900">{fmtMoney(day.total)}</span>
                                    </span>
                                </div>

                                <table className="w-full text-sm">
                                    <tbody>
                                        {day.rows.map(inv => {
                                            const cat = invoiceCategory(inv.category)
                                            return (
                                                // last:border-b-0, not last:border-0. The short one sets every
                                                // border to nothing, so the last invoice of each day
                                                // lost the colour stripe down its side and only some
                                                // rows appeared to be colour coded.
                                                <tr key={inv.id} className={`border-b border-border last:border-b-0 border-l-4 ${cat.stripe}`}>
                                                    <td className="px-3 py-2 text-gray-900">
                                                        {inv.suppliers?.name || 'Unknown supplier'}
                                                        {inv.notes && <span className="block text-xs text-gray-400">{inv.notes}</span>}
                                                    </td>
                                                    <td className="px-3 py-2 w-32">
                                                        {/* Same colour as the button it was filed with */}
                                                        <span className={`inline-block px-2 py-1 rounded-full border text-xs font-semibold whitespace-nowrap ${cat.soft}`}>
                                                            {cat.label}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-gray-900 font-medium w-28 whitespace-nowrap">
                                                        {fmtMoney(inv.total_amount)}
                                                    </td>
                                                    <td className="px-3 py-2 w-20">
                                                        <button onClick={() => handleDelete(inv)}
                                                            className="text-xs font-medium text-red-500 hover:text-red-700">Delete</button>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </PageContainer>
    )
}