import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { addDays, shortDate, stampDay } from '@/lib/dates'
import { guestName } from '@/lib/timesheet'
import Modal from '@/components/ui/Modal'
import {
    modalFooter, secondaryButton, primaryButton, labelClass, fieldClass, hintClass, fieldError,
} from '@/lib/controlStyles'

// Somebody from another restaurant: added to a week by hand, or her name
// changed (his, 9 November 2026). One dialog for both, because they are the
// same question, what she is called here.
//
// **The names she had before are offered**, from the last thirteen weeks. A
// visitor typed "Camila V" one week and "Camila Valenzuela" the next is two
// people on the PDF, and the list is what stops that without a new button.
//
// `sentAt` is when this week last went, if it has: a visitor added to a sent
// week is a change to what the owners have, and she shows in red as added.
export default function GuestDialog({
    restaurantId, person = null, tillName = null, period = null, weekStart, weekEnd, sentAt = null, onClose, onSave,
}) {
    const renaming = Boolean(person)
    const [name, setName] = useState(person?.full_name || '')
    const [problem, setProblem] = useState('')
    const [busy, setBusy] = useState(false)
    const [before, setBefore] = useState([])

    useEffect(() => {
        if (renaming || !restaurantId) return
        let alive = true
        supabase.from('timesheet_entries')
            .select('person_name, source, note')
            .eq('restaurant_id', restaurantId)
            .is('employee_id', null)
            .gte('work_date', addDays(weekStart, -91))
            .lte('work_date', weekEnd)
            .then(({ data }) => {
                // Only a help, so a refused read leaves the box empty and
                // says nothing.
                if (!alive || !data) return
                setBefore([...new Set(data.map(e => guestName(e.person_name)).filter(Boolean))].sort())
            })
        return () => { alive = false }
    }, [renaming, restaurantId, weekStart, weekEnd])

    async function save(e) {
        e.preventDefault()
        if (!guestName(name)) { setProblem('Type a name.'); return }
        setBusy(true)
        const why = await onSave(name)
        setBusy(false)
        setProblem(why || '')
    }

    const stretch = period
        ? `the pay period, ${shortDate(period.start)} to ${shortDate(period.end)}`
        : `the week, ${shortDate(weekStart)} to ${shortDate(weekEnd)}`

    return (
        <Modal title="Somebody from another restaurant" onClose={onClose} width="max-w-md">
            <form onSubmit={save}>
                <div className="px-6 py-4 space-y-3">
                    {renaming ? (
                        <>
                            <p className="text-sm text-muted">
                                This changes the name on every day of {stretch}.
                                {tillName ? ` In the till as ${tillName}.` : ''}
                            </p>
                            <p className="text-sm text-muted">To take them off, clear each of their days.</p>
                        </>
                    ) : (
                        <p className="text-sm text-muted">
                            For somebody on another restaurant&apos;s team who worked here this week. Their
                            hours go out with this restaurant&apos;s, marked as from another restaurant. Type
                            their times on the week once they are added.
                        </p>
                    )}

                    {sentAt && (
                        <p className="text-sm text-muted">
                            {renaming
                                ? `This week was already sent on ${shortDate(stampDay(sentAt))}. The next email has the new name.`
                                : `This week was already sent on ${shortDate(stampDay(sentAt))}, so once their times are in they show in red as added since.`}
                        </p>
                    )}

                    <div>
                        <label className={labelClass} htmlFor="guest-name">Their name</label>
                        <input
                            id="guest-name"
                            type="text"
                            autoFocus
                            autoComplete="off"
                            list={before.length ? 'guest-names' : undefined}
                            className={fieldClass}
                            value={name}
                            onChange={e => { setName(e.target.value); setProblem('') }}
                        />
                        {before.length > 0 && (
                            <datalist id="guest-names">
                                {before.map(n => <option key={n} value={n} />)}
                            </datalist>
                        )}
                        {problem
                            ? <p className={fieldError}>{problem}</p>
                            : (
                                <p className={hintClass}>
                                    Make it different from everybody on the team, for example with a surname.
                                </p>
                            )}
                    </div>
                </div>

                <div className={modalFooter}>
                    <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                    <button type="submit" disabled={busy} className={primaryButton()}>
                        {busy ? 'Saving...' : renaming ? 'Save' : 'Add'}
                    </button>
                </div>
            </form>
        </Modal>
    )
}
