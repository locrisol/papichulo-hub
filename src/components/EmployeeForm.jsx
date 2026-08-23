import { numberField } from '../lib/numberInput'
import { linkableUsers } from '../lib/team'

// The add and edit form for a person.
//
// It holds no state of its own. The page owns the values and passes them down,
// the same arrangement ProductForm and InvoiceForm use.
export default function EmployeeForm({
    formData,
    onChange,
    onSubmit,
    onCancel,
    submitLabel,
    saving,
    problem,
    positions,
    users,
    employees,
    editingId,
}) {
    const fieldCls =
        'w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white'
    const labelCls = 'text-xs text-gray-500 mb-1 block'

    const available = linkableUsers(users, employees, editingId)

    return (
        <form onSubmit={onSubmit} className="p-5">
            <div className="mb-3">
                <label className={labelCls}>Name</label>
                <input
                    type="text"
                    value={formData.fullName}
                    onChange={e => onChange('fullName', e.target.value)}
                    className={fieldCls}
                    placeholder="As it should read on the roster"
                    autoFocus
                />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                    <label className={labelCls}>Position</label>
                    <select
                        value={formData.positionId}
                        onChange={e => onChange('positionId', e.target.value)}
                        className={fieldCls}
                    >
                        <option value="">Not set</option>
                        {positions.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className={labelCls}>Cost per hour</label>
                    <input
                        {...numberField({
                            value: formData.hourlyRate,
                            onChange: v => onChange('hourlyRate', v),
                        })}
                        className={`${fieldCls} text-right`}
                        placeholder="0.00"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                        Only ever used to total up what a week costs. Never shown to staff.
                    </p>
                </div>
            </div>

            {/* Two across on a phone, not three. A date box needs about 140px to
                show a whole date. */}
            <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                    <label className={labelCls}>First day</label>
                    <input
                        type="date"
                        value={formData.startedOn}
                        onChange={e => onChange('startedOn', e.target.value)}
                        className={fieldCls}
                    />
                </div>
                <div>
                    <label className={labelCls}>Last day</label>
                    <input
                        type="date"
                        value={formData.endedOn}
                        onChange={e => onChange('endedOn', e.target.value)}
                        className={fieldCls}
                    />
                    <p className="text-xs text-gray-400 mt-1">
                        Leave empty while they still work here.
                    </p>
                </div>
            </div>

            <div className="mb-3">
                <label className={labelCls}>Account</label>
                <select
                    value={formData.userId}
                    onChange={e => onChange('userId', e.target.value)}
                    className={fieldCls}
                >
                    <option value="">No account</option>
                    {available.map(u => (
                        <option key={u.id} value={u.id}>
                            {u.full_name} ({u.role.replace('_', ' ')})
                        </option>
                    ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                    Only if they log in. Someone on a trial does not need one, and joining them up
                    is what lets them see their own shifts later.
                </p>
            </div>

            <div className="mb-4">
                <label className={labelCls}>Notes</label>
                <input
                    type="text"
                    value={formData.notes}
                    onChange={e => onChange('notes', e.target.value)}
                    className={fieldCls}
                    placeholder="Anything worth remembering"
                />
            </div>

            {problem && (
                <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3 mb-4">{problem}</p>
            )}

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
                    disabled={saving || !!problem}
                    className="px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
                >
                    {saving ? 'Saving...' : submitLabel}
                </button>
            </div>
        </form>
    )
}
