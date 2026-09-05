import { useState, useEffect, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useRestaurant } from '../../context/RestaurantContext'
import { fmtMoney } from '../../lib/format'
import { todayISO, weekStartOf, shortDate, addDays, fullDate } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { secondaryButton, card, cardEdge, cardHeader, rowButton } from '../../lib/controlStyles'
import InvoiceForm from '../../components/InvoiceForm'
import { useConfirm } from '../../context/ConfirmContext'
import Modal from '../../components/Modal'
import { INVOICE_SUMMARY_CARDS, invoiceCategory, groupByDay } from '../../lib/invoiceCategories'

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

// Nothing chosen to start with. The category used to default to food, which is
// the commonest, but a default that is right most of the time is exactly the one
// nobody checks, and filing a packaging invoice under food moves money between
// two different cost targets.
function emptyForm() {
    return {
        supplierId: '',
        invoiceDate: todayISO(),
        totalAmount: '',
        category: '',
        notes: '',
    }
}

// One set of rules for both, so an invoice cannot be edited into a state it
// could never have been created in.
function validate(f) {
    if (!f.supplierId) return 'Pick a supplier'
    if (!f.category) return 'Pick a category'
    const amount = parseFloat(f.totalAmount)
    if (isNaN(amount) || amount <= 0) return 'The total has to be a number above zero'
    return null
}

// week_start is worked back out from the date every time rather than kept as it
// was, so moving an invoice to a different day moves it into the right week too
// instead of leaving it filed under the old one and wrong on the cost dashboard.
function invoicePayload(f) {
    return {
        supplier_id: f.supplierId,
        invoice_date: f.invoiceDate,
        total_amount: parseFloat(f.totalAmount),
        category: f.category,
        week_start: weekStartOf(f.invoiceDate),
        notes: f.notes.trim() || null,
    }
}

export default function InvoicesPage() {
    const { user } = useAuth()
    const { activeRestaurant } = useRestaurant()
    const navigate = useNavigate()
    const confirm = useConfirm()

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

    // Adding and editing keep their own values on purpose.
    //
    // Sharing one set, the way the products screen does, would mean opening an
    // invoice to correct it wiped whatever was half typed at the top of the
    // screen. The add form here is always on show, so that would be a real loss
    // rather than a theoretical one.
    const [form, setForm] = useState(emptyForm())
    const [editingId, setEditingId] = useState(null)
    const [editForm, setEditForm] = useState(emptyForm())

    // The invoice the dialog is showing, looked up from the list rather than
    // kept as a second copy, so it cannot go stale if the list reloads.
    const editingInvoice = invoices.find(i => i.id === editingId) || null

    // Which week the list below is showing. Follows the date on the add form, so
    // entering an invoice from last week shows you last week's invoices.
    const weekStart = weekStartOf(form.invoiceDate)
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

    function setFormField(field, value) {
        setForm(prev => ({ ...prev, [field]: value }))
    }

    function setEditField(field, value) {
        setEditForm(prev => ({ ...prev, [field]: value }))
    }

    function startEdit(inv) {
        setError(''); setSuccess('')
        setEditingId(inv.id)
        setEditForm({
            supplierId: inv.supplier_id || '',
            invoiceDate: inv.invoice_date,
            totalAmount: inv.total_amount != null ? String(inv.total_amount) : '',
            category: inv.category || '',
            notes: inv.notes || '',
        })
    }

    function cancelEdit() {
        setEditingId(null)
        setEditForm(emptyForm())
    }

    async function handleSave(e) {
        e.preventDefault()
        setError(''); setSuccess('')

        const problem = validate(form)
        if (problem) { setError(problem); return }

        setSaving(true)
        const { error: e1 } = await supabase.from('invoices').insert({
            restaurant_id: restaurantId,
            ...invoicePayload(form),
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
        setForm(emptyForm())
        setSuccess('Invoice saved.')
        setRefresh(n => n + 1)
    }

    // Correcting one rather than deleting it and typing it again, which is what
    // people were doing and which loses who entered it and when.
    //
    // The week is worked back out from the date, so moving an invoice to a
    // different day also moves it into the right week rather than leaving it
    // filed under the old one and quietly wrong on the cost dashboard.
    async function handleUpdate(e) {
        e.preventDefault()
        setError(''); setSuccess('')

        const problem = validate(editForm)
        if (problem) { setError(problem); return }

        setSaving(true)
        const { error: e1 } = await supabase
            .from('invoices')
            .update(invoicePayload(editForm))
            .eq('id', editingId)
        setSaving(false)

        if (e1) { setError(friendlyError(e1)); return }

        cancelEdit()
        setSuccess('Invoice updated.')
        setRefresh(n => n + 1)
    }

    async function handleDelete(inv) {
        // Read back what is about to go, laid out rather than squeezed into one
        // sentence. Several invoices from the same supplier on the same day are
        // normal here, so the supplier's name on its own does not tell you which
        // one you are about to delete.
        const cat = invoiceCategory(inv.category)
        const ok = await confirm({
            title: 'Delete this invoice?',
            message: 'It will be taken off the week straight away and off the cost dashboard with it.',
            details: [
                { label: 'Supplier', value: inv.suppliers?.name || 'Unknown supplier' },
                { label: 'Category', value: cat.label },
                { label: 'Date', value: fullDate(inv.invoice_date) },
                { label: 'Total', value: fmtMoney(inv.total_amount) },
                ...(inv.notes ? [{ label: 'Notes', value: inv.notes }] : []),
            ],
            confirmLabel: 'Delete invoice',
            tone: 'danger',
        })
        if (!ok) return
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

    return (
        <>
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
            <div className={`${card} overflow-hidden mb-4`}>
                <h3 className={cardHeader}>Add an invoice</h3>
                <div className="p-5">
                    <InvoiceForm
                        formData={form}
                        onChange={setFormField}
                        onSubmit={handleSave}
                        submitLabel="Save invoice"
                        saving={saving}
                        suppliers={suppliers}
                        weekStart={weekStart}
                    />
                </div>
            </div>

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
            <div className={`${card} overflow-hidden`}>
                <h3 className={cardHeader}>
                    Invoices for the week starting {shortDate(weekStart)}
                </h3>
                <div className="p-5">
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
                                            const isEditing = editingId === inv.id
                                            return (
                                                <Fragment key={inv.id}>
                                                {/* last:border-b-0, not last:border-0. The short one sets
                                                    every border to nothing, so the last invoice of each
                                                    day lost the colour stripe down its side and only some
                                                    rows appeared to be colour coded. */}
                                                <tr className={`border-b border-border last:border-b-0 border-l-4 ${cat.stripe} ${isEditing ? 'bg-gray-50' : ''}`}>
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
                                                    <td className="px-3 py-2 w-28">
                                                        <div className="flex flex-wrap gap-2">
                                                            <button
                                                                onClick={() => isEditing ? cancelEdit() : startEdit(inv)}
                                                                className={rowButton('edit')}
                                                            >
                                                                {isEditing ? 'Cancel' : 'Edit'}
                                                            </button>
                                                            <button onClick={() => handleDelete(inv)}
                                                                className={rowButton('danger')}>Delete</button>
                                                        </div>
                                                    </td>
                                                </tr>

                                                </Fragment>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                    </div>
                )}
                </div>
            </div>
            {editingInvoice && (
                <Modal
                    title={`Edit the ${editingInvoice.suppliers?.name || 'invoice'} invoice`}
                    onClose={cancelEdit}
                    width="max-w-2xl"
                >
                    <div className="px-6 py-4">
                        <InvoiceForm
                            formData={editForm}
                            onChange={setEditField}
                            onSubmit={handleUpdate}
                            onCancel={cancelEdit}
                            submitLabel="Save changes"
                            saving={saving}
                            suppliers={suppliers}
                            weekStart={weekStartOf(editForm.invoiceDate)}
                        />
                    </div>
                </Modal>
            )}
        </>
    )
}