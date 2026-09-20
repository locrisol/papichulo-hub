import Modal from '@/components/ui/Modal'
import { categoryStyle, statusNote, dayName } from '@/lib/events'
import { placeName, walkWords, hostOf, agoWords, whenWords } from '@/lib/nearby'
import { fullDate } from '@/lib/dates'
import { fmtMoney } from '@/lib/format'
import { badge } from '@/lib/controlStyles'

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
export default function EventModal({ row, onClose }) {
    const event = row?.event
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

    const where = placeName(row?.place) || event.venue
    if (where) {
        const walk = walkWords(row?.pairing?.walk_minutes)
        rows.push({
            label: row?.kind === 'city' ? 'In the city' : 'Where',
            value: walk ? `${where}, ${walk} away` : where,
        })
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
        <Modal title={event.name} onClose={onClose}>
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
            </div>
        </Modal>
    )
}
