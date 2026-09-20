import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { categoryStyle, statusNote, dayName } from '@/lib/events'
import {
    placeName, elsewhere, walkWords, hostOf, agoWords, whenWords, eventName,
} from '@/lib/nearby'
import { fullDate } from '@/lib/dates'
import { fmtMoney } from '@/lib/format'
import { badge, fieldClass, labelClass, secondaryButton } from '@/lib/controlStyles'

// One thing on near us, opened from the calendar or from the list beside it.
//
// A calendar cell is a couple of centimetres wide, so the name is cut off and
// everything else is left out. The hover tooltip that was doing this job only
// showed the name and the time, and does not exist at all on a phone, which is
// where this screen is read most.
//
// What is in here depends on where the row came from, and saying which is the
// point. A feed hands over a category, a sale status and a ticket price, and
// none of that exists for something a model read off a page: what that gives is
// a name, a date and the address it was read from. Attendance and ticket
// numbers are not in the free tier at all, so those are not missing by accident
// and there is no point leaving a blank line for them.
export default function EventModal({ row, canEdit = false, onRename, onClose }) {
    const event = row?.event
    // Before the early return, because a hook cannot sit behind one. The empty
    // string is never used: there is no modal to type into without an event.
    const [name, setName] = useState(() => eventName(row?.event) || '')
    if (!event) return null

    const note = statusNote(event.status)
    const noteCls = note?.tone === 'bad'
        ? 'bg-red-50 text-red-700'
        : 'bg-amber-50 text-amber-700'

    const fromAPage = event.source === 'page'

    // Labelled Doors rather than Time, because that is what it is.
    //
    // Ticketmaster has no doors field at all, it is empty on every one of the 92
    // events they list for this venue. What they give is the time on the ticket,
    // and across those 92 it is 18:30 on sixty of them and 18:00 on twenty nine.
    // No arena act walks on stage at half six. That is doors, and doors is the
    // number that matters here anyway, since it is when the crowd stops eating
    // and goes in.
    //
    // A page read says Starts instead. Nothing on a cinema or a council page is
    // a doors time, and calling it one would be putting a word on it that the
    // page never said.
    const runs = event.ends_on && event.ends_on > event.event_date

    const rows = [
        runs
            ? { label: 'Runs', value: whenWords(event) }
            : { label: 'Day', value: `${dayName(event.event_date)} ${fullDate(event.event_date)}` },
        {
            label: fromAPage ? 'Starts' : 'Doors',
            value: event.event_time ? event.event_time.slice(0, 5) : 'Not given',
        },
    ]

    // What the page said, when that is somewhere else entirely. A council's
    // listings cover a whole county, and the walking time on our own row is the
    // walk to the council rather than to a library ten kilometres away.
    const other = elsewhere(row)
    const where = other || placeName(row?.place) || event.venue
    if (where) {
        const walk = other ? '' : walkWords(row?.pairing?.walk_minutes)
        rows.push({
            label: row?.kind === 'city' ? 'In the city' : 'Where',
            value: walk ? `${where}, ${walk} away` : where,
        })
        // Still worth saying which list it turned up on, since that is what
        // decides whether it is watched at all.
        const ours = placeName(row?.place)
        if (other && ours) rows.push({ label: 'Found on', value: `${ours}'s listings` })
    }

    if (event.min_price != null || event.max_price != null) {
        rows.push({
            label: 'Tickets',
            value: `${event.min_price != null ? fmtMoney(event.min_price) : '?'}${
                event.max_price != null && event.max_price !== event.min_price
                    ? ` to ${fmtMoney(event.max_price)}`
                    : ''
            }`,
        })
    }

    // Where a reading came from and when, which is the difference between a
    // fact and a reading. A feed needs no such line: the venue itself said so.
    const source = hostOf(event.source_url)
    if (fromAPage && source) {
        const when = agoWords(event.found_at, new Date().toISOString().slice(0, 10))
        rows.push({ label: 'Read from', value: when ? `${source}, ${when}` : source })
    }

    return (
        <Modal title={eventName(event)} onClose={onClose}>
            <div className="px-6 py-4">
                {event.category && (
                    <div className="mb-4">
                        <span className={`${badge} border ${categoryStyle(event.category)}`}>
                            {event.category}
                        </span>
                    </div>
                )}

                <dl className="divide-y divide-border">
                    {rows.map(r => (
                        <div key={r.label} className="flex justify-between gap-4 py-2 text-sm">
                            <dt className="text-muted">{r.label}</dt>
                            <dd className="font-medium text-gray-900 text-right">{r.value}</dd>
                        </div>
                    ))}
                </dl>

                {/* Said plainly rather than left to a dashed edge. A dash is a
                    hint, and on a phone it is barely that. */}
                {row?.checked === false && (
                    <p className="text-sm rounded-lg p-3 mt-4 bg-blue-50 text-blue-900">
                        A model read this off a page and nobody has checked it yet.
                        Keep it or say it is not for us at the top of the calendar.
                    </p>
                )}

                {note && (
                    <p className={`text-sm rounded-lg p-3 mt-4 ${noteCls}`}>{note.text}</p>
                )}

                {/* Renaming one that is already kept.
                    "Irish Funds Conference October 2026" drawn on a day in
                    October 2026 spends half a roster cell on two things the
                    reader can already see.
                    It writes beside the name rather than over it, so what
                    arrived is still what a second reading is matched on, and a
                    Ticketmaster name that the sync rewrites twice a day keeps
                    the one we chose. See migration 015. */}
                {canEdit && onRename && (
                    <div className="mt-4 pt-4 border-t border-border">
                        <label className={labelClass} htmlFor="event-name">
                            What to call it on the roster
                        </label>
                        <div className="flex flex-wrap gap-2">
                            <input
                                id="event-name"
                                className={`${fieldClass} flex-1 min-w-[12rem]`}
                                value={name}
                                maxLength={160}
                                onChange={e => setName(e.target.value)}
                            />
                            <button
                                type="button"
                                disabled={name.trim() === eventName(event)}
                                onClick={() => onRename(event, name)}
                                className={`${secondaryButton} disabled:opacity-50`}
                            >
                                Save
                            </button>
                        </div>
                        <p className="text-xs text-muted mt-1">
                            {event.display_name
                                ? `It arrived as "${event.name}". Empty the box to put that back.`
                                : 'Only what the roster and the calendar show. What it arrived as is kept.'}
                        </p>
                    </div>
                )}
            </div>
        </Modal>
    )
}
