import Modal from './Modal'
import { categoryStyle, statusNote, dayName } from '../lib/events'
import { fullDate } from '../lib/dates'
import { fmtMoney } from '../lib/format'
import { badge } from '../lib/controlStyles'

// One event, opened from the calendar or from the list beside it.
//
// A calendar cell is a couple of centimetres wide, so the name is cut off and
// everything else is left out. The hover tooltip that was doing this job only
// showed the name and the time, and does not exist at all on a phone, which is
// where this screen is read most.
//
// What is in here is what Ticketmaster gives us for this venue. Attendance and
// ticket numbers are not part of the free tier at all, so those are not missing
// by accident and there is no point leaving a blank line for them.
export default function EventModal({ event, onClose }) {
    if (!event) return null

    const note = statusNote(event.status)
    const noteCls = note?.tone === 'bad'
        ? 'bg-red-50 text-red-700'
        : 'bg-amber-50 text-amber-700'

    const rows = [
        { label: 'Day', value: `${dayName(event.event_date)} ${fullDate(event.event_date)}` },
        { label: 'Time', value: event.event_time ? event.event_time.slice(0, 5) : 'Not given' },
        { label: 'Venue', value: event.venue || '3Arena' },
    ]

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

    return (
        <Modal title={event.name} onClose={onClose}>
            <div className="p-5">
                <div className="mb-4">
                    <span className={`${badge} border ${categoryStyle(event.category)}`}>
                        {event.category || 'Other'}
                    </span>
                </div>

                <dl className="divide-y divide-border">
                    {rows.map(r => (
                        <div key={r.label} className="flex justify-between gap-4 py-2 text-sm">
                            <dt className="text-muted">{r.label}</dt>
                            <dd className="font-medium text-gray-900 text-right">{r.value}</dd>
                        </div>
                    ))}
                </dl>

                {note && (
                    <p className={`text-sm rounded-lg p-3 mt-4 ${noteCls}`}>{note.text}</p>
                )}
            </div>
        </Modal>
    )
}
