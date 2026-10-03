import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import AutoTextarea from '@/components/ui/AutoTextarea'
import { numberField } from '@/lib/numberInput'
import {
    CLAIM_KINDS, claimKind, claimCountSaid, emptyDoorClaim, doorClaimProblem, claimForm, keepsItsAmount,
} from '@/lib/invoiceClaims'
import {
    modalFooter, secondaryButton, primaryButton, labelClass, fieldClass, hintClass,
    errorBanner, lockedField,
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
// it is worth asking for because when that invoice turns up a few days later
// only its lines are offered, not every delivery from that supplier.
//
// **How many is asked after what was wrong, in that reason's words**, because
// the number means something different for each. On 2 October a case of four
// bags came as one bag, and with two bare boxes called Cases and Loose units
// the owner could not tell whether to count what was missing or what came.
// Loose also means kilos everywhere else in the Hub. So the boxes wait for a
// reason, ask its question, and read the answer back as it is typed.
//
// There is no money on this form and there is none on the row it writes.
// Whoever is at the door knows how many trays and has no business knowing what
// a tray costs, and the database policy that lets them write it refuses a row
// with an amount on it.
//
// **With a `claim` it changes that one** (managers only, from Delivery
// problems). On a line the supplier and the docket are that delivery's, so they
// are shown and not offered, and the money is worked out and read back on the
// row before anything is saved, which is why the button there says Next. Only
// the words of a price query changed keep its money (keepsItsAmount), and that
// saves straight away. **With `fixed`** its week's report has gone out, so
// what was wrong and how many are shown and not offered (amountFixed), and it
// saves straight away too.
// Greyed the way a locked field is everywhere else, at the size of the boxes
// beside it.
const locked = `${lockedField} w-full px-3 py-2.5 text-base`

export default function DoorClaimModal({ suppliers, claim = null, fixed = false, onClose, onSave }) {
    const [form, setForm] = useState(() => (claim ? claimForm(claim) : emptyDoorClaim()))
    const [problem, setProblem] = useState('')
    const [busy, setBusy] = useState(false)

    const set = (field, value) => setForm(f => ({ ...f, [field]: value }))
    const kind = form.kind ? claimKind(form.kind) : null
    const count = claimCountSaid(form.cases, form.units)
    const onLine = !!claim?.invoice_line_id
    // Next works the money out and saves nothing yet.
    const next = onLine && !fixed && !keepsItsAmount(claim, form)
    const supplierName = (suppliers || []).find(s => s.id === form.supplierId)?.name || ''

    async function go() {
        const wrong = doorClaimProblem(form)
        if (wrong) { setProblem(wrong); return }
        setBusy(true)
        const failed = await onSave(form)
        setBusy(false)
        if (failed) setProblem(failed)
    }

    return (
        <Modal title={claim ? 'Change this problem' : 'What was wrong with it?'} onClose={onClose} width="max-w-lg">
            <div className="px-6 py-4">
                {problem && <p className={`${errorBanner} mb-3`} role="alert">{problem}</p>}

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label className={labelClass} htmlFor="claim-supplier">Who delivered it</label>
                        {onLine ? (
                            <input id="claim-supplier" value={supplierName} disabled readOnly className={locked} />
                        ) : (
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
                        )}
                    </div>
                    <div>
                        <label className={labelClass} htmlFor="claim-docket">Docket number</label>
                        {onLine ? (
                            <input id="claim-docket" value={form.docket} disabled readOnly className={locked} />
                        ) : (
                            <>
                                <input
                                    id="claim-docket"
                                    value={form.docket}
                                    onChange={e => set('docket', e.target.value)}
                                    className={fieldClass}
                                    placeholder="Off the paper they leave"
                                />
                                <p className={hintClass}>
                                    Worth thirty seconds of looking. It tells a manager which invoice this
                                    was on, so it goes against the right delivery.
                                </p>
                            </>
                        )}
                    </div>
                </div>
                {onLine && <p className={hintClass}>Use Not this line to change the delivery.</p>}

                {fixed && (
                    <div className="mt-4">
                        <label className={labelClass} htmlFor="claim-fixed">What was wrong</label>
                        <input
                            id="claim-fixed"
                            value={[kind?.label, count && `${count} ${kind?.counted}`].filter(Boolean).join(', ')}
                            disabled
                            readOnly
                            className={locked}
                        />
                        <p className={hintClass}>
                            The report for the week this comes off has gone out, so what was wrong and how many
                            can no longer change.
                        </p>
                    </div>
                )}

                {/* Names only, two to a row, so all ten fit on a phone without
                    scrolling past them to the question. The one picked says
                    what it means underneath, and has a ring in its own colour,
                    as the diary's kinds do, because a pale tint alone is hard
                    to pick out in daylight. */}
                {!fixed && (
                    <div className="mt-4">
                        <span className={labelClass}>What was wrong</span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {CLAIM_KINDS.map(k => (
                                <button
                                    key={k.value}
                                    type="button"
                                    onClick={() => set('kind', k.value)}
                                    aria-pressed={form.kind === k.value}
                                    className={`min-h-11 text-left px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                                        form.kind === k.value
                                            ? `${k.soft} ring-2 ring-inset ring-current`
                                            : 'bg-white border-gray-300 text-gray-800 hover:bg-gray-50'
                                    }`}
                                >
                                    {k.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {kind && !fixed && (
                    <div className="mt-4">
                        <p className="text-xs text-muted">{kind.at_door}</p>
                        <p className="text-sm font-bold text-gray-900 mt-2">{kind.ask}</p>
                        <p className={hintClass}>{kind.example}</p>

                        <div className="grid grid-cols-2 gap-4 mt-3">
                            <div>
                                <label className={labelClass} htmlFor="claim-cases">Full cases</label>
                                <input
                                    id="claim-cases"
                                    {...numberField({ value: form.cases, onChange: v => set('cases', v), decimals: 3 })}
                                    inputMode="numeric"
                                    className={fieldClass}
                                />
                            </div>
                            <div>
                                <label className={labelClass} htmlFor="claim-units">Single items</label>
                                <input
                                    id="claim-units"
                                    {...numberField({ value: form.units, onChange: v => set('units', v), decimals: 3 })}
                                    inputMode="numeric"
                                    className={fieldClass}
                                />
                            </div>
                        </div>
                        <p className={hintClass}>One bag, tin, bottle or tray out of a case. Not kilos.</p>
                        {count && (
                            <p className="text-sm text-gray-900 mt-2">
                                You are claiming: {count} {kind.counted}.
                            </p>
                        )}
                    </div>
                )}

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
                    {busy ? (next ? 'Working it out...' : 'Saving...') : !claim ? 'Log it' : next ? 'Next' : 'Save changes'}
                </button>
            </div>
        </Modal>
    )
}
