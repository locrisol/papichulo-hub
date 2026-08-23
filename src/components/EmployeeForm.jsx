import { numberField } from '../lib/numberInput'
import { linkableUsers } from '../lib/team'
import { WORK_PERMISSIONS, permissionFor, FOOD_SAFETY_LEVELS, expiryFrom } from '../lib/workRules'

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

            {/* Right to work.

                Only the stamp and the date it runs out. No nationality, no
                document numbers, nothing scanned. That is everything the hour
                rules need and none of what we would then have to protect.

                The date of birth is here for one reason: under 18s have their
                own limits and the roster cannot apply them without it. */}
            <div className="border-t border-border pt-4 mb-3">
                <p className="text-xs font-bold text-muted uppercase tracking-wider mb-3">
                    Right to work
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                        <label className={labelCls}>Date of birth</label>
                        <input
                            type="date"
                            value={formData.dateOfBirth}
                            onChange={e => onChange('dateOfBirth', e.target.value)}
                            className={fieldCls}
                        />
                        <p className="text-xs text-gray-400 mt-1">
                            Only used to apply the under 18 limits. Leave empty otherwise.
                        </p>
                    </div>
                    <div>
                        <label className={labelCls}>Permission</label>
                        <select
                            value={formData.workPermission}
                            onChange={e => onChange('workPermission', e.target.value)}
                            className={fieldCls}
                        >
                            {WORK_PERMISSIONS.map(p => (
                                <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                        </select>
                        {permissionFor(formData.workPermission).term !== null && (
                            <p className="text-xs text-amber-700 mt-1">
                                {permissionFor(formData.workPermission).term} hours a week in term time,
                                {' '}{permissionFor(formData.workPermission).holiday} in the holiday periods.
                                The roster will not let a week go out over it.
                            </p>
                        )}
                    </div>
                </div>

                <div className="mb-1">
                    <label className={labelCls}>Permission runs out</label>
                    <input
                        type="date"
                        value={formData.workPermissionExpires}
                        onChange={e => onChange('workPermissionExpires', e.target.value)}
                        className={fieldCls}
                    />
                    <p className="text-xs text-gray-400 mt-1">
                        The roster starts saying so two months out, and stops a week going out once
                        it has passed.
                    </p>
                </div>
            </div>

            {/* Food safety.

                The expiry is the part that matters. A certificate nobody is
                watching is one that has quietly run out, and finding that out
                during an inspection is the expensive way round.

                Two years is offered when a date is sat, and it can be changed,
                because a certificate that says something different should be
                able to say something different here. */}
            <div className="border-t border-border pt-4 mb-3">
                <p className="text-xs font-bold text-muted uppercase tracking-wider mb-3">
                    Food safety
                </p>

                <div className="mb-3">
                    <label className={labelCls}>Training held</label>
                    <select
                        value={formData.foodSafetyLevel}
                        onChange={e => onChange('foodSafetyLevel', e.target.value)}
                        className={fieldCls}
                    >
                        {FOOD_SAFETY_LEVELS.map(l => (
                            <option key={l.value} value={l.value}>{l.label}</option>
                        ))}
                    </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={labelCls}>Sat on</label>
                        <input
                            type="date"
                            value={formData.foodSafetyIssued}
                            onChange={e => {
                                onChange('foodSafetyIssued', e.target.value)
                                // Two years is offered, not imposed. It only
                                // fills an empty box, so a date already typed is
                                // never quietly rewritten.
                                if (e.target.value && !formData.foodSafetyExpires) {
                                    onChange('foodSafetyExpires', expiryFrom(e.target.value))
                                }
                            }}
                            className={fieldCls}
                        />
                    </div>
                    <div>
                        <label className={labelCls}>Runs out</label>
                        <input
                            type="date"
                            value={formData.foodSafetyExpires}
                            onChange={e => onChange('foodSafetyExpires', e.target.value)}
                            className={fieldCls}
                        />
                    </div>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                    Two years from the date it was sat is filled in for you and can be changed.
                    The roster says so two months before it runs out.
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
