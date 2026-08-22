// The add and edit form for a supplier.
//
// It holds no state of its own. The page owns the values, which is the same
// arrangement ProductForm and PriceForm use.
//
// It exists because this form was written out twice in the page, once for adding
// and once for editing a row, and the two copies had already started to differ.
// One of them is now the only one.
//
// The category list is not free text. suppliers has a check constraint on it, so
// anything outside these four is refused by the database rather than saved as a
// typo. Adding one means a migration first.
const CATEGORIES = [
    { value: 'food', label: 'Food' },
    { value: 'packaging', label: 'Packaging' },
    { value: 'cleaning', label: 'Cleaning' },
    { value: 'other', label: 'Other' },
]

export default function SupplierForm({ formData, onChange, onSubmit, onCancel, submitLabel }) {
    const fieldCls =
        'w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white'
    const labelCls =
        'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2'

    return (
        <form onSubmit={onSubmit}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                    <label className={labelCls}>Name</label>
                    <input
                        type="text"
                        value={formData.name}
                        onChange={e => onChange('name', e.target.value)}
                        className={fieldCls}
                        required
                    />
                </div>
                <div>
                    <label className={labelCls}>Category</label>
                    <select
                        value={formData.category}
                        onChange={e => onChange('category', e.target.value)}
                        className={fieldCls}
                    >
                        {CATEGORIES.map(c => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className={labelCls}>Contact Email</label>
                    <input
                        type="email"
                        value={formData.contact_email}
                        onChange={e => onChange('contact_email', e.target.value)}
                        className={fieldCls}
                    />
                </div>
                <div>
                    <label className={labelCls}>Contact Phone</label>
                    <input
                        type="text"
                        value={formData.contact_phone}
                        onChange={e => onChange('contact_phone', e.target.value)}
                        className={fieldCls}
                    />
                </div>
            </div>

            <div className="mb-4">
                <label className={labelCls}>Notes</label>
                <textarea
                    value={formData.notes}
                    onChange={e => onChange('notes', e.target.value)}
                    rows={2}
                    className={fieldCls}
                />
            </div>

            <div className="flex justify-end gap-3">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-2 border border-border text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 bg-white transition-colors"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
                >
                    {submitLabel}
                </button>
            </div>
        </form>
    )
}
