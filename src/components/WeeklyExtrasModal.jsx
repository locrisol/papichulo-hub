import { useState } from 'react'
import Modal from './Modal'
import ModalSection from './ModalSection'
import { supabase } from '../lib/supabase'
import { useRestaurant } from '../context/RestaurantContext'
import { friendlyError } from '../lib/errors'
import { modalFooter, secondaryButton } from '../lib/controlStyles'
import { cleanExtras, sortExtras, usualProblem } from '../lib/dayExtras'

// The two things that are the same every week.
//
// The deliveries and orders this restaurant usually gets, and the line of small
// print at the bottom of every roster. Neither belongs on a day, because
// neither is about one.
//
// The delivery list is a list to tick from and not a schedule. Nothing appears
// on a day until somebody puts it there, which is the only version that
// survives contact with a real week: Feedr not coming this Tuesday has to be
// something the roster can simply not say, rather than something you have to
// go and cancel.
//
// It exists so nobody types Clockmeal fifty times a year. That is how it ends
// up as Clock Meal on week thirty and as two separate things on the sheet.
export default function WeeklyExtrasModal({ onClose }) {
    const { activeRestaurant, setActiveRestaurant } = useRestaurant()

    const [extras, setExtras] = useState(() => cleanExtras(activeRestaurant?.usual_extras))
    const [note, setNote] = useState(activeRestaurant?.roster_note || '')
    const [adding, setAdding] = useState({ name: '', time: '' })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const problem = usualProblem(extras)

    const patch = (index, change) =>
        setExtras(list => list.map((e, i) => (i === index ? { ...e, ...change } : e)))

    function add() {
        if (!adding.name.trim()) return
        setExtras(list => [...list, ...cleanExtras([adding])])
        setAdding({ name: '', time: '' })
    }

    async function save() {
        if (problem) return
        setSaving(true)
        setError('')

        const { data, error: err } = await supabase
            .from('restaurants')
            .update({
                usual_extras: extras.length ? sortExtras(extras) : null,
                roster_note: note.trim() || null,
            })
            .eq('id', activeRestaurant.id)
            .select()
            .single()

        setSaving(false)
        if (err) { setError(friendlyError(err)); return }

        setActiveRestaurant(data)
        onClose()
    }

    const fieldCls =
        'w-full border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent'
    const timeCls =
        'border border-border rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent'
    const labelCls = 'text-xs text-gray-500 mb-1 block'

    return (
        <Modal title="Every week" onClose={onClose} width="max-w-xl">
            {error && <p className="mx-6 mt-4 text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}

            <ModalSection
                title="Deliveries and orders you usually get"
                description="A list to tick from on the day rather than a schedule. Nothing appears on a roster until somebody puts it there, so a week Feedr does not come is a week you simply do not tick it."
            >
                {extras.length === 0 ? (
                    <p className="text-sm text-gray-400 italic mb-4">
                        None yet. Add whatever comes in most weeks and you will never type it again.
                    </p>
                ) : (
                    <div className="divide-y divide-border mb-4">
                        {extras.map((extra, i) => (
                            <div key={i} className="py-2 flex flex-wrap items-center gap-2">
                                <input
                                    type="text"
                                    value={extra.name}
                                    onChange={e => patch(i, { name: e.target.value })}
                                    aria-label="Name"
                                    className={`${fieldCls} flex-1 min-w-40`}
                                />
                                <input
                                    type="time"
                                    value={extra.time}
                                    onChange={e => patch(i, { time: e.target.value })}
                                    aria-label={`${extra.name} usual time`}
                                    className={timeCls}
                                />
                                <button
                                    type="button"
                                    onClick={() => setExtras(list => list.filter((_, n) => n !== i))}
                                    aria-label={`Take ${extra.name} off the list`}
                                    className="text-gray-400 hover:text-red-600 px-1"
                                >
                                    &times;
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex flex-wrap items-end gap-2">
                    <div className="flex-1 min-w-40">
                        <label className={labelCls}>Add one</label>
                        <input
                            type="text"
                            value={adding.name}
                            onChange={e => setAdding(a => ({ ...a, name: e.target.value }))}
                            className={fieldCls}
                            placeholder="Feedr"
                        />
                    </div>
                    <input
                        type="time"
                        value={adding.time}
                        onChange={e => setAdding(a => ({ ...a, time: e.target.value }))}
                        aria-label="Usual time"
                        className={timeCls}
                    />
                    <button type="button" onClick={add} disabled={!adding.name.trim()} className={secondaryButton}>
                        Add it
                    </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                    The time here is the usual one. A day can disagree with it, and changing it later
                    leaves every week already sent out exactly as it was.
                </p>
            </ModalSection>

            {/* The standing note.
                This used to be the only note there was, at the bottom of the
                old spreadsheet, saying the same thing every week until nobody
                read it. That is why the per day message exists and why this
                came back second rather than first: there is still a sentence
                every roster has to carry, and the two are not the same job. */}
            <ModalSection
                title="The note at the bottom of every roster"
                description="Printed under every week that goes out. Leave it empty and nothing is printed, which is the state to leave it in unless there is genuinely something that has to be on every single week."
            >
                <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    rows={3}
                    className={fieldCls}
                    placeholder="Swaps have to be agreed with a manager before they happen."
                />
                <p className="text-xs text-gray-400 mt-2">
                    Anything about one week goes on the day it is about instead, through Options on that
                    day. Those are the ones people read.
                </p>
            </ModalSection>

            {problem && (
                <p className="mx-6 mb-4 text-sm text-red-700 bg-red-50 rounded-lg p-3">{problem}</p>
            )}

            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={save}
                    disabled={saving || !!problem}
                    className="px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50"
                >
                    {saving ? 'Saving...' : 'Save'}
                </button>
            </div>
        </Modal>
    )
}
