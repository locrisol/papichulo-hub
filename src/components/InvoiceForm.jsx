import { labelClass, fieldClass } from '../lib/controlStyles'
import { INVOICE_CATEGORIES } from '../lib/invoiceCategories'
import { numberField } from '../lib/numberInput'
import { shortDate } from '../lib/dates'

// The add and edit form for an invoice.
//
// It holds no state of its own. The page owns the values and the validation and
// passes them down, which is the same arrangement ProductForm uses, and it is
// why the one form works both for adding at the top of the screen and for
// editing a row in place further down without behaving any differently.
//
// The week is worked out from the invoice date rather than typed, so it always
// matches the sales week and cannot be set to something that disagrees with it.
export default function InvoiceForm({
    formData,
    onChange,
    onSubmit,
    onCancel,
    submitLabel,
    saving,
    suppliers,
    problem,
    weekStart,
}) {

    return (
        <form onSubmit={onSubmit}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                    <label className={labelClass}>Supplier</label>
                    <select
                        value={formData.supplierId}
                        onChange={e => onChange('supplierId', e.target.value)}
                        className={fieldClass}
                    >
                        <option value="">Pick a supplier</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>

                {/* Buttons rather than a dropdown. A dropdown only shows the
                    colour once the choice is already made, and browsers will not
                    colour the options inside one in any way that can be relied
                    on. With four buttons all the colours are visible while you
                    are choosing, and on a phone it is one tap instead of two. */}
                <div>
                    <label className={labelClass}>Category</label>
                    <div className="flex flex-wrap gap-2">
                        {INVOICE_CATEGORIES.map(c => (
                            <button
                                key={c.value}
                                type="button"
                                onClick={() => onChange('category', c.value)}
                                aria-pressed={formData.category === c.value}
                                className={`px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                                    formData.category === c.value ? c.solid : `${c.soft} hover:brightness-95`
                                }`}
                            >
                                {c.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* One across on a phone, not two, not three.
                A date box needs about 140 pixels to show a whole date and the
                picker arrow beside it. Two across was already the second attempt
                at this and it still came out as 24/08/2C, because half a phone
                screen is not 140 pixels once the padding is off it. Three short
                rows read fine; a date nobody can read does not. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div>
                    <label className={labelClass}>Week starting</label>
                    {/* Worked out from the date, not typed, so it always matches
                        the sales week. It sits first because it is the thing the
                        invoice is being filed into, and the invoice date is what
                        decides it. */}
                    <div className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500">
                        {shortDate(weekStart)}
                    </div>
                </div>
                <div>
                    <label className={labelClass}>Invoice date</label>
                    <input
                        type="date"
                        value={formData.invoiceDate}
                        onChange={e => onChange('invoiceDate', e.target.value)}
                        className={fieldClass}
                    />
                </div>
                <div>
                    <label className={labelClass}>Total</label>
                    <input
                        {...numberField({
                            value: formData.totalAmount,
                            onChange: v => onChange('totalAmount', v),
                        })}
                        className={`${fieldClass} text-right`}
                        placeholder="0.00"
                    />
                </div>
            </div>

            <div className="mb-3">
                <label className={labelClass}>Notes</label>
                <input
                    type="text"
                    value={formData.notes}
                    onChange={e => onChange('notes', e.target.value)}
                    className={fieldClass}
                    placeholder="Optional note"
                />
            </div>

            {/* Beside the button that caused it, not at the top of the page.
                On a phone you press Save at the bottom of a form and a message
                written above the form is simply not on screen, so the press
                reads as having done nothing. Worse in the edit dialog, where
                the page behind it is covered: a message up there was never seen
                at all, on any device. */}
            {problem && (
                <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3 mb-3" role="alert">
                    {problem}
                </p>
            )}

            <div className="flex justify-end gap-3">
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 border border-border text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 bg-white transition-colors"
                    >
                        Cancel
                    </button>
                )}
                <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
                >
                    {saving ? 'Saving...' : submitLabel}
                </button>
            </div>
        </form>
    )
}
