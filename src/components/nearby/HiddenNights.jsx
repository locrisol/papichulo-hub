import Modal from '@/components/ui/Modal'
import { eventName, placeName } from '@/lib/nearby'
import { dayName, fullDate } from '@/lib/dates'
import { modalFooter, rowButton, secondaryButton } from '@/lib/controlStyles'

// The nights somebody said are not for us, so one can be put back (his, 22
// October 2026): hidden from the calendar, or turned down when it was found.
// From two weeks ago on, which a report still being written can reach.
// Showing one again puts it back everywhere Not for us took it off, and the
// sync leaves it there.
export default function HiddenNights({ rows, busy, onShow, onClose }) {
    return (
        <Modal title="Hidden nights" onClose={onClose}>
            <div className="px-6 py-4">
                <p className="text-sm text-gray-700 mb-2">
                    Nights somebody said are not for us, from two weeks ago on. Show it again puts it back on
                    the roster, My shifts, the roster picture, the calendar and the weekly report.
                </p>
                {rows.length === 0 ? (
                    <p className="text-sm text-muted py-2">Nothing is hidden.</p>
                ) : (
                    <ul className="divide-y divide-border">
                        {rows.map(row => (
                            <li key={row.event.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 break-words">{eventName(row.event)}</p>
                                    <p className="text-xs text-muted">
                                        {dayName(row.event.event_date)} {fullDate(row.event.event_date)}
                                        {row.time ? `, ${row.time}` : ''}
                                        {placeName(row.place, { short: true }) ? ` · ${placeName(row.place, { short: true })}` : ''}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => onShow(row.event)}
                                    className={`${rowButton('good')} disabled:opacity-50`}
                                >
                                    Show it again
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>Done</button>
            </div>
        </Modal>
    )
}
