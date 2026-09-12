import { useState } from 'react'
import TimeField from './TimeField'
import Modal from './Modal'
import { supabase } from '../lib/supabase'
import { useRestaurant } from '../context/RestaurantContext'
import { friendlyError } from '../lib/errors'
import { BANK_HOLIDAY } from '../lib/roster'
import { modalFooter, removeButton } from '../lib/controlStyles'
import ModalSection from './ModalSection'

// When the store is usually open.
//
// This is not decoration and it is not for customers. The roster reads it to
// decide two things it cannot work out any other way: a shift starting before
// these hours is somebody letting themselves into a dark building, and a shift
// running past them is the one that prints as "Closing" rather than as a time
// somebody could pack up on.
//
// A day left empty means the store does not normally open. Nothing is marked
// against a day with no hours, which is the right answer: better to mark
// nothing than to mark the wrong thing.
//
// This is the usual week plus one set of bank holiday hours, since every bank
// holiday opens the same here and a date somebody has to remember to fill in
// each August is a date that gets forgotten. A single day that is not like the
// others, a late night for a concert or an early close for renovations, is set
// on the roster against that day rather than here.
const FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function OpeningHoursModal({ onClose }) {
    const { activeRestaurant, setActiveRestaurant } = useRestaurant()

    const [hours, setHours] = useState(() => {
        const stored = activeRestaurant?.opening_hours || {}
        return FULL_DAYS.map((_, i) => ({
            open: stored[String(i)]?.open || '',
            close: stored[String(i)]?.close || '',
        }))
    })
    // One setting for every bank holiday rather than a date to fill in each
    // August, because they all open the same here. A day ticked as a bank
    // holiday on the roster picks these up on its own.
    const [bank, setBank] = useState(() => ({
        open: activeRestaurant?.opening_hours?.[BANK_HOLIDAY]?.open || '',
        close: activeRestaurant?.opening_hours?.[BANK_HOLIDAY]?.close || '',
    }))

    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    function set(index, field, value) {
        setHours(prev => prev.map((d, i) => (i === index ? { ...d, [field]: value } : d)))
    }

    // Copying the first day that has anything in it down the week. Most
    // restaurants open at the same time five or six days out of seven, and
    // typing fourteen times to find that out is a poor first impression.
    function copyDown() {
        const source = hours.find(d => d.open && d.close)
        if (!source) return
        setHours(hours.map(d => (d.open || d.close ? d : { ...source })))
    }

    const problem = hours.some(d => (d.open && !d.close) || (!d.open && d.close))
        || (!!bank.open !== !!bank.close)
        ? 'A day needs both an opening and a closing time, or neither.'
        : null

    async function save() {
        if (problem) return
        setSaving(true)
        setError('')

        // Empty days are stored as nothing rather than as empty strings, so the
        // roster can ask whether a day has hours and get a straight answer.
        const payload = {}
        hours.forEach((d, i) => {
            if (d.open && d.close) payload[String(i)] = { open: d.open, close: d.close }
        })
        if (bank.open && bank.close) payload[BANK_HOLIDAY] = { open: bank.open, close: bank.close }

        const { data, error: err } = await supabase
            .from('restaurants')
            .update({ opening_hours: Object.keys(payload).length ? payload : null })
            .eq('id', activeRestaurant.id)
            .select()
            .single()

        setSaving(false)
        if (err) { setError(friendlyError(err)); return }

        setActiveRestaurant(data)
        onClose()
    }


    return (
        <Modal title="Opening hours" onClose={onClose}>
            <div>
                <ModalSection
                    title="The usual week"
                    description="The roster uses this to mark opening and closing shifts, and to print Closing instead of a time on anything that runs past the end of the day."
                >

                {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3 mb-4">{error}</p>}

                <div className="space-y-3 sm:space-y-2 mb-4">
                    {FULL_DAYS.map((day, i) => (
                        <div key={day} className="flex flex-wrap items-center gap-2">
                            {/* The day sits over its own times on a phone
                                rather than beside them.

                                Three letters in a 38 pixel column, a "to" and a
                                remove left the two time boxes 89 pixels each
                                out of the 305 a row has. They fit, but only
                                just, and only while nothing else is ever added
                                to the row. Given the line to itself the name
                                can be the whole word, and each box goes to
                                about 112. */}
                            <span className="w-full sm:w-24 flex-shrink-0 text-sm text-gray-700">
                                {day}
                            </span>
                            <TimeField
                                value={hours[i].open}
                                onChange={v => set(i, "open", v)}
                                compact
                                className="flex-1 min-w-0"
                                aria-label={`${day} opens`}
                                />
                            <span className="text-gray-400 text-sm">to</span>
                            <TimeField
                                value={hours[i].close}
                                onChange={v => set(i, "close", v)}
                                compact
                                className="flex-1 min-w-0"
                                aria-label={`${day} closes`}
                                />
                            <button
                                type="button"
                                onClick={() => { set(i, 'open', ''); set(i, 'close', '') }}
                                className={removeButton}
                                aria-label={`Closed on ${day}`}
                                title="Not open this day"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>

                <button
                    type="button"
                    onClick={copyDown}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium mb-4"
                >
                    Fill the empty days with the first one
                </button>

                </ModalSection>

                <ModalSection
                    title="Bank holidays"
                    description="One setting for all of them, since they open the same here. Tick a day as a bank holiday on the roster and it uses these instead of its usual hours. Leave empty to treat them like any other day."
                >
                    <div className="flex items-center gap-2">
                        <TimeField
                            value={bank.open}
                            onChange={v => setBank(b => ({ ...b, open: v }))}
                            compact
                            className="flex-1 min-w-0"
                            placeholder="Not set"
                            aria-label="Bank holidays open"
                            />
                        <span className="text-gray-400 text-sm">to</span>
                        <TimeField
                            value={bank.close}
                            onChange={v => setBank(b => ({ ...b, close: v }))}
                            compact
                            className="flex-1 min-w-0"
                            placeholder="Not set"
                            aria-label="Bank holidays close"
                            />
                        <button
                            type="button"
                            onClick={() => setBank({ open: '', close: '' })}
                            className={removeButton}
                            aria-label="Clear bank holiday hours"
                        >
                            ×
                        </button>
                    </div>
                </ModalSection>

                {problem && (
                    <p className="mx-6 mb-4 text-sm text-red-700 bg-red-50 rounded-lg p-3">{problem}</p>
                )}

                <div className={modalFooter}>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 border border-border text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 bg-white"
                    >
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
            </div>
        </Modal>
    )
}
