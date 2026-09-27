import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import AutoTextarea from '@/components/ui/AutoTextarea'
import { numberField } from '@/lib/numberInput'
import { CLAIM_KINDS, emptyDoorClaim, doorClaimProblem } from '@/lib/invoiceClaims'
import {
    modalFooter, secondaryButton, primaryButton, labelClass, fieldClass, hintClass,
    errorBanner,
} from '@/lib/controlStyles'

// The note taken at the delivery door.
//
// **Under thirty seconds or it does not get written.** Whoever signs for a
// delivery has a pen in one hand and a driver waiting, and every field this
// insists on is a field that makes the note less likely to exist at all. So it
// asks for four things and presses for a fifth.
//
// The fifth is the docket number off the paper the driver leaves. It is not
// required, because a note with no number is worth far more than no note, and
// it is worth asking for because it turns the note into an exact match against
// the invoice when that turns up a few days later.
//
// There is no money on this form and there is none on the row it writes.
// Whoever is at the door knows how many trays and has no business knowing what
// a tray costs, and the database policy that lets them write it refuses a row
// with an amount on it.
export default function DoorClaimModal({ suppliers, onClose, onSave }) {
    const [form, setForm] = useState(emptyDoorClaim())
    const [problem, setProblem] = useState('')
    const [busy, setBusy] = useState(false)

    const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

    async function go() {
        const wrong = doorClaimProblem(form)
        if (wrong) { setProblem(wrong); return }
        setBusy(true)
        const failed = await onSave(form)
        setBusy(false)
        if (failed) setProblem(failed)
    }

    return (
        <Modal title="What was wrong with it?" onClose={onClose} width="max-w-lg">
            <div className="px-6 py-4">
                {problem && <p className={`${errorBanner} mb-3`} role="alert">{problem}</p>}

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label className={labelClass} htmlFor="claim-supplier">Who delivered it</label>
                        <select
                            id="claim-supplier"
                            value={form.supplierId}
                            onChange={e => set('supplierId', e.target.value)}
                            className={fieldClass}
                        >
                            <option value="">Pick a supplier</option>
                            {(suppliers || []).map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={labelClass} htmlFor="claim-docket">Docket number</label>
                        <input
                            id="claim-docket"
                            value={form.docket}
                            onChange={e => set('docket', e.target.value)}
                            className={fieldClass}
                            placeholder="Off the paper they leave"
                        />
                        <p className={hintClass}>
                            Worth thirty seconds of looking. With it the Hub matches this to the
                            right line on its own when the invoice comes in.
                        </p>
                    </div>
                </div>

                <div className="mt-4">
                    <span className={labelClass}>What was wrong</span>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {CLAIM_KINDS.map(kind => (
                            <button
                                key={kind.value}
                                type="button"
                                onClick={() => set('kind', kind.value)}
                                aria-pressed={form.kind === kind.value}
                                className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                                    form.kind === kind.value
                                        ? `${kind.soft} font-bold`
                                        : 'bg-white border-gray-300 text-gray-800 hover:bg-gray-50'
                                }`}
                            >
                                <span className="block font-semibold">{kind.label}</span>
                                <span className="block text-xs opacity-80">{kind.at_door}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mt-4">
                    <label className={labelClass} htmlFor="claim-what">What it was</label>
                    <input
                        id="claim-what"
                        value={form.what}
                        onChange={e => set('what', e.target.value)}
                        className={fieldClass}
                        placeholder="Chicken breast, the two trays on the bottom"
                    />
                    <p className={hintClass}>
                        Your own words are better than a product name. It is what goes to the
                        supplier.
                    </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 mt-4">
                    <div>
                        <label className={labelClass} htmlFor="claim-cases">Cases</label>
                        <input
                            id="claim-cases"
                            {...numberField({ value: form.cases, onChange: v => set('cases', v), decimals: 3 })}
                            className={fieldClass}
                        />
                    </div>
                    <div>
                        <label className={labelClass} htmlFor="claim-units">Loose units</label>
                        <input
                            id="claim-units"
                            {...numberField({ value: form.units, onChange: v => set('units', v), decimals: 3 })}
                            className={fieldClass}
                        />
                    </div>
                </div>

                <div className="mt-4">
                    <label className={labelClass} htmlFor="claim-note">Anything else</label>
                    <AutoTextarea
                        id="claim-note"
                        minRows={2}
                        value={form.note}
                        onChange={e => set('note', e.target.value)}
                        className={fieldClass}
                        placeholder="Driver said he would send it on Thursday"
                    />
                </div>
            </div>

            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                <button type="button" disabled={busy} onClick={go} className={primaryButton('md', 'good')}>
                    {busy ? 'Saving...' : 'Log it'}
                </button>
            </div>
        </Modal>
    )
}
