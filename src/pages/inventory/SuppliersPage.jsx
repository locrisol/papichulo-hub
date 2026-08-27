import { useState, useEffect, Fragment } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { can, MANAGERS } from '../../lib/access'
import { friendlyError } from '../../lib/errors'
import { tableHeadRow, tableHeadCell, tableCard, badge, card, cardHeader, rowButton } from '../../lib/controlStyles'
import SupplierForm from '../../components/SupplierForm'
import Modal from '../../components/Modal'

// Who we buy from.
//
// Suppliers are shared by both restaurants rather than owned by one, because it
// is the same company delivering to both. What differs by restaurant is which
// supplier is preferred for a given product, and that lives on the price, not
// here.
//
// The category is food, packaging, cleaning or other, and it is a check
// constraint in the database. It matters beyond tidiness: the cost dashboard
// splits food from packaging by the category on the invoice, so putting a
// supplier in the wrong one moves money between two cost targets.
//
// Suppliers are deactivated and never deleted. Old invoices and prices point at
// them, and those have to keep making sense.
export default function SuppliersPage() {
    const { user } = useAuth()

    // Employees can see this page on purpose: if a delivery is wrong they need
    // the rep's number. Nothing here is commercially sensitive. What they must
    // not have is the controls, which the database refuses anyway, so showing
    // them is just a button that does nothing.
    const isManager = can(user, MANAGERS)

    const [suppliers, setSuppliers] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [showForm, setShowForm] = useState(false)
    const [editingSupplier, setEditingSupplier] = useState(null)
    const [formData, setFormData] = useState({
        name: '',
        category: 'food',
        contact_email: '',
        contact_phone: '',
        notes: '',
    })
    const [showInactive, setShowInactive] = useState(() => {
        return localStorage.getItem('suppliersShowInactive') === 'true'
    })

    const categoryOrder = ['food', 'packaging', 'cleaning', 'other']

    const filteredSuppliers = suppliers
        .filter(s => showInactive || s.is_active)
        .sort((a, b) => {
            const categoryDiff = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category)
            if (categoryDiff !== 0) return categoryDiff
            return a.name.localeCompare(b.name)
        })

    useEffect(() => {
        fetchSuppliers()
    }, [])

    async function fetchSuppliers() {
        setLoading(true)
        // Ordered by name. Without an order the database returns the rows
        // however it likes, and updating a row moves it, so deactivating a
        // supplier and turning it back on sent it somewhere else in the list.
        const { data, error } = await supabase
            .from('suppliers')
            .select('*')
            .order('name')

        if (error) setError(friendlyError(error))
        else setSuppliers(data)
        setLoading(false)
    }

    async function handleSave(e) {
        e.preventDefault()
        setError('')

        if (editingSupplier) {
            const { error } = await supabase
                .from('suppliers')
                .update(formData)
                .eq('id', editingSupplier.id)

            if (error) setError(friendlyError(error))
            else {
                fetchSuppliers()
                resetForm()
            }
        } else {
            const { error } = await supabase
                .from('suppliers')
                .insert(formData)

            if (error) setError(friendlyError(error))
            else {
                fetchSuppliers()
                resetForm()
            }
        }
    }

    // The form hands back the field and the value rather than an event, the
    // same as every other form in the app.
    function handleFieldChange(field, value) {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    function resetForm() {
        setFormData({ name: '', category: 'food', contact_email: '', contact_phone: '', notes: '' })
        setEditingSupplier(null)
        setShowForm(false)
    }

    function startEdit(supplier) {
        setFormData({
            name: supplier.name,
            category: supplier.category,
            contact_email: supplier.contact_email || '',
            contact_phone: supplier.contact_phone || '',
            notes: supplier.notes || '',
        })
        setEditingSupplier(supplier)
        setShowForm(true)
    }

    async function toggleActive(supplier) {
        const { error } = await supabase
            .from('suppliers')
            .update({ is_active: !supplier.is_active })
            .eq('id', supplier.id)

        if (error) setError(friendlyError(error))
        else fetchSuppliers()
    }

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Suppliers</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {isManager ? 'Manage your supplier directory' : 'Who we buy from, and how to reach them'}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {/* Show Inactive is a filter rather than a change, so anyone
                        can use it. There is nothing to hide in a deactivated
                        supplier that is not already on screen. */}
                    <button
                        onClick={() => {
                            const next = !showInactive
                            setShowInactive(next)
                            localStorage.setItem('suppliersShowInactive', next)
                        }}
                        className={`px-4 py-2 border text-sm font-medium rounded-lg transition-colors ${showInactive
                            ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                            : 'border-border text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        {showInactive ? 'Hide Inactive' : 'Show Inactive'}
                    </button>
                    {isManager && (
                        <button
                            onClick={() => { resetForm(); setShowForm(true) }}
                            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
                        >
                            + Add Supplier
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>
            )}

            {isManager && showForm && !editingSupplier && (
                <div className={`${card} overflow-hidden mb-6`}>
                    <h3 className={cardHeader}>New supplier</h3>
                    <div className="p-6">
                        <SupplierForm
                            formData={formData}
                            onChange={handleFieldChange}
                            onSubmit={handleSave}
                            onCancel={resetForm}
                            submitLabel="Add supplier"
                        />
                    </div>
                </div>
            )}

            {loading ? (
                <div className="text-sm text-gray-500">Loading suppliers...</div>
            ) : (
                <>
                {/* Cards on a phone, the table on anything wider.
                    A table that scrolls sideways puts its last columns out of
                    reach, and on this one that was the status and the buttons.
                    Products and menu items already do this; suppliers now
                    matches them. */}
                <div className="md:hidden space-y-3">
                    {filteredSuppliers.map(s => (
                        <div
                            key={s.id}
                            className={`rounded-xl border p-4 ${
                                s.is_active ? 'bg-white border-border' : 'bg-red-100 border-red-200'
                            }`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <p className={`font-semibold ${s.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
                                    {s.name}
                                </p>
                                <span className={`${badge} flex-shrink-0 ${
                                    s.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                                }`}>
                                    {s.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </div>

                            {s.notes && <p className="text-xs text-gray-400 mt-0.5">{s.notes}</p>}

                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                <span className={`${badge} capitalize ${
                                    s.is_active ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400'
                                }`}>
                                    {s.category}
                                </span>
                            </div>

                            {/* The address and the number are the reason
                                anybody opens this list on a phone, so they are
                                links rather than text to copy out by hand. */}
                            <dl className="mt-3 space-y-1.5 text-sm">
                                <div className="flex items-baseline justify-between gap-3">
                                    <dt className="text-gray-500">Email</dt>
                                    <dd className="text-right min-w-0 truncate">
                                        {s.contact_email
                                            ? <a href={`mailto:${s.contact_email}`} className="text-blue-700 underline">{s.contact_email}</a>
                                            : <span className="text-gray-400">-</span>}
                                    </dd>
                                </div>
                                <div className="flex items-baseline justify-between gap-3">
                                    <dt className="text-gray-500">Phone</dt>
                                    <dd className="text-right">
                                        {s.contact_phone
                                            ? <a href={`tel:${s.contact_phone}`} className="text-blue-700 underline">{s.contact_phone}</a>
                                            : <span className="text-gray-400">-</span>}
                                    </dd>
                                </div>
                            </dl>

                            {isManager && (
                                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-black/10">
                                    <button
                                        onClick={() => editingSupplier?.id === s.id ? resetForm() : startEdit(s)}
                                        className={rowButton('edit')}
                                    >
                                        {editingSupplier?.id === s.id ? 'Cancel' : 'Edit'}
                                    </button>
                                    <button
                                        onClick={() => toggleActive(s)}
                                        className={rowButton(s.is_active ? 'danger' : 'good')}
                                    >
                                        {s.is_active ? 'Deactivate' : 'Reactivate'}
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className={`${tableCard} hidden md:block`}>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className={tableHeadRow}>
                                <th className={`text-left px-4 py-3 ${tableHeadCell}`}>Name</th>
                                <th className={`text-left px-4 py-3 ${tableHeadCell}`}>Category</th>
                                <th className={`text-left px-4 py-3 ${tableHeadCell}`}>Email</th>
                                <th className={`text-left px-4 py-3 ${tableHeadCell}`}>Phone</th>
                                <th className={`text-left px-4 py-3 ${tableHeadCell}`}>Status</th>
                                {isManager && (
                                    <th className={`text-left px-4 py-3 ${tableHeadCell}`}>Actions</th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSuppliers.map((s, i) => (
                                <Fragment key={s.id}>
                                    <tr className={`border-b border-border ${!s.is_active ? 'bg-red-100' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                        <td className={`px-4 py-3 font-medium ${s.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
                                            {s.name}
                                            {s.notes && <p className="text-xs text-gray-400 mt-0.5">{s.notes}</p>}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`${badge} capitalize ${s.is_active ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400'
                                                }`}>
                                                {s.category}
                                            </span>
                                        </td>
                                        <td className={`px-4 py-3 ${s.is_active ? 'text-gray-500' : 'text-gray-400'}`}>{s.contact_email || '-'}</td>
                                        <td className={`px-4 py-3 ${s.is_active ? 'text-gray-500' : 'text-gray-400'}`}>{s.contact_phone || '-'}</td>
                                        <td className="px-4 py-3">
                                            <span className={`${badge} ${s.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                                                }`}>
                                                {s.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        {isManager && (
                                            <td className="px-4 py-3">
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        onClick={() => editingSupplier?.id === s.id ? resetForm() : startEdit(s)}
                                                        className={rowButton('edit')}
                                                    >
                                                        {editingSupplier?.id === s.id ? 'Cancel' : 'Edit'}
                                                    </button>
                                                    <button
                                                        onClick={() => toggleActive(s)}
                                                        className={rowButton(s.is_active ? 'danger' : 'good')}
                                                    >
                                                        {s.is_active ? 'Deactivate' : 'Reactivate'}
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
                </>
            )}
            {/* Editing opens in a dialog rather than pushing a form into the
                middle of the table, where the row being changed was hard to
                pick out from the rows around it and everything below it jumped
                down the page. */}
            {editingSupplier && (
                <Modal title={`Edit ${editingSupplier.name}`} onClose={resetForm} width="max-w-2xl">
                    <div className="p-6">
                        <SupplierForm
                            formData={formData}
                            onChange={handleFieldChange}
                            onSubmit={handleSave}
                            onCancel={resetForm}
                            submitLabel="Save changes"
                        />
                    </div>
                </Modal>
            )}
        </div>
    )
}