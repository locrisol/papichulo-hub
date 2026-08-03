import { useState, useEffect, Fragment } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { can, MANAGERS } from '../../lib/access'
import { friendlyError } from '../../lib/errors'

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
        const { data, error } = await supabase
            .from('suppliers')
            .select('*')

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
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Suppliers</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {isManager ? 'Manage your supplier directory' : 'Who we buy from, and how to reach them'}
                    </p>
                </div>
                <div className="flex gap-3">
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
                <div className="bg-white rounded-xl border border-border p-6 mb-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4">New Supplier</h3>
                    <form onSubmit={handleSave}>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Category</label>
                                <select
                                    value={formData.category}
                                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                                >
                                    <option value="food">Food</option>
                                    <option value="packaging">Packaging</option>
                                    <option value="cleaning">Cleaning</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Contact Email</label>
                                <input
                                    type="email"
                                    value={formData.contact_email}
                                    onChange={e => setFormData({ ...formData, contact_email: e.target.value })}
                                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Contact Phone</label>
                                <input
                                    type="text"
                                    value={formData.contact_phone}
                                    onChange={e => setFormData({ ...formData, contact_phone: e.target.value })}
                                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                                />
                            </div>
                        </div>
                        <div className="mb-4">
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes</label>
                            <textarea
                                value={formData.notes}
                                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                rows={2}
                                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                            />
                        </div>
                        <div className="flex gap-3">
                            <button
                                type="submit"
                                className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
                            >
                                Add Supplier
                            </button>
                            <button
                                type="button"
                                onClick={resetForm}
                                className="px-4 py-2 border border-border text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {loading ? (
                <div className="text-sm text-gray-500">Loading suppliers...</div>
            ) : (
                <div className="bg-white rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border bg-gray-50">
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Phone</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                {isManager && (
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
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
                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold capitalize ${s.is_active ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400'
                                                }`}>
                                                {s.category}
                                            </span>
                                        </td>
                                        <td className={`px-4 py-3 ${s.is_active ? 'text-gray-500' : 'text-gray-400'}`}>{s.contact_email || '-'}</td>
                                        <td className={`px-4 py-3 ${s.is_active ? 'text-gray-500' : 'text-gray-400'}`}>{s.contact_phone || '-'}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${s.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                                                }`}>
                                                {s.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        {isManager && (
                                            <td className="px-4 py-3">
                                                <div className="flex gap-3">
                                                    <button
                                                        onClick={() => editingSupplier?.id === s.id ? resetForm() : startEdit(s)}
                                                        className="text-xs font-medium text-blue-600 hover:text-blue-800"
                                                    >
                                                        {editingSupplier?.id === s.id ? 'Cancel' : 'Edit'}
                                                    </button>
                                                    <button
                                                        onClick={() => toggleActive(s)}
                                                        className={`text-xs font-medium ${s.is_active ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-800'
                                                            }`}
                                                    >
                                                        {s.is_active ? 'Deactivate' : 'Reactivate'}
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                    {isManager && editingSupplier?.id === s.id && (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-4 bg-amber-50 border-b border-border">
                                                <form onSubmit={handleSave}>
                                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                                        <div>
                                                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Name</label>
                                                            <input
                                                                type="text"
                                                                value={formData.name}
                                                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                                                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                                                                required
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Category</label>
                                                            <select
                                                                value={formData.category}
                                                                onChange={e => setFormData({ ...formData, category: e.target.value })}
                                                                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                                                            >
                                                                <option value="food">Food</option>
                                                                <option value="packaging">Packaging</option>
                                                                <option value="cleaning">Cleaning</option>
                                                                <option value="other">Other</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Contact Email</label>
                                                            <input
                                                                type="email"
                                                                value={formData.contact_email}
                                                                onChange={e => setFormData({ ...formData, contact_email: e.target.value })}
                                                                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Contact Phone</label>
                                                            <input
                                                                type="text"
                                                                value={formData.contact_phone}
                                                                onChange={e => setFormData({ ...formData, contact_phone: e.target.value })}
                                                                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="mb-4">
                                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes</label>
                                                        <textarea
                                                            value={formData.notes}
                                                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                                            rows={2}
                                                            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                                                        />
                                                    </div>
                                                    <div className="flex gap-3">
                                                        <button
                                                            type="submit"
                                                            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
                                                        >
                                                            Save Changes
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={resetForm}
                                                            className="px-4 py-2 border border-border text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 bg-white transition-colors"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </form>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}