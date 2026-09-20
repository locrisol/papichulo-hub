import { fullDate } from '@/lib/dates'
import { fmtHours } from '@/lib/roster'
import { shortClock, maskTime, settleTime } from '@/lib/clock'
import { STATE_KEYS, kindOf, cellColour } from '@/lib/timesheet'
import { kindLabel as absenceLabel, takesHours, kindOf as absenceKind } from '@/lib/absences'
import { numberField } from '@/lib/numberInput'
import Modal from '@/components/ui/Modal'
import AutoTextarea from '@/components/ui/AutoTextarea'
import { modalFooter, secondaryButton, labelClass, fieldClass, rowButton } from '@/lib/controlStyles'

// One person, one day, on a phone.
//
// Tapping a day used to take you to the day view, which is a reading and not an
// entry screen, so there was nowhere on a phone to type a time at all. This is
// what the design meant by "tap a day to type it": the same two boxes the wide
// grid has, with room for them, and the states as buttons because a phone has
// no h s t r either.
export default function DayEditModal({
    person, cell, canEdit = true, onClose, onType, onSettle, onState, onClear, onAdd, onHours, onNote,
}) {
    if (!person || !cell) return null

    const spans = cell.entries.length
        ? cell.entries
        : [{ id: null, starts_at: '', ends_at: '' }]

    return (
        <Modal title={person.full_name} onClose={onClose} width="max-w-sm">
            <div className="px-6 py-4">
                <p className="text-sm font-semibold text-gray-900 mb-1">{fullDate(cell.date)}</p>

                {cell.bankHoliday && (
                    <p className="text-xs font-bold mb-3" style={{ color: '#B08A2E' }}>
                        {cell.bankHoliday.name}
                    </p>
                )}

                {cell.rostered.length > 0 ? (
                    <p className="text-xs text-muted mb-4">
                        Rostered {cell.rostered.map(s => `${shortClock(s.starts_at)}–${shortClock(s.ends_at)}`).join(', ')}
                    </p>
                ) : (
                    <p className="text-xs text-muted mb-4">Not rostered for this day.</p>
                )}

                {cell.absence ? (
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <span
                                className="inline-block text-xs font-bold uppercase tracking-wider px-2 py-1 rounded text-white"
                                style={{ backgroundColor: cellColour({ absence: cell.absence }) }}
                            >
                                {absenceLabel(cell.absence.kind)}
                            </span>
                            {canEdit && (
                                <button type="button" onClick={onClear} className={rowButton('danger')}>
                                    Delete
                                </button>
                            )}
                        </div>

                        {takesHours(cell.absence.kind) && (
                            <div>
                                <label className={labelClass} htmlFor="holiday-hours">
                                    Hours it comes to, for the whole holiday
                                </label>
                                <input
                                    id="holiday-hours"
                                    {...numberField({
                                        value: cell.absence.hours == null ? '' : String(cell.absence.hours),
                                        onChange: onHours,
                                        decimals: 2,
                                    })}
                                    disabled={!canEdit}
                                    placeholder="Nobody has said yet"
                                    className={`${fieldClass} ${cell.absence.hours == null ? 'border-accent' : ''}`}
                                />
                                {cell.absence.starts_on !== cell.absence.ends_on && cell.absence.hours != null && (
                                    <p className="text-xs text-muted mt-1">
                                        {fmtHours(cell.holidayHours)} of that falls on this day.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div>
                        {spans.map((entry, i) => (
                            <div key={entry.id || `new-${i}`} className="mb-4">
                                <div className="flex gap-2 items-end">
                                    <div className="flex-1">
                                        <label className={labelClass}>Clock in</label>
                                        <Box entry={entry} field="starts_at" canEdit={canEdit} onType={onType} onSettle={onSettle} />
                                    </div>
                                    <div className="flex-1">
                                        <label className={labelClass}>Clock out</label>
                                        <Box entry={entry} field="ends_at" canEdit={canEdit} onType={onType} onSettle={onSettle} />
                                    </div>
                                </div>

                                {/* One note per pair of times, not one per day.
                                    A split shift is two spans and the reason one
                                    ran long has nothing to do with the other.
                                    It goes out with the week, because this is
                                    how he tells the accountant why a figure is
                                    what it is.
                                    **Nothing about the roster goes in one.** The
                                    accountant never sees the roster, so a note
                                    is only ever his own words: something he
                                    changed after the till's file went in, or a
                                    day he typed himself and is the only one who
                                    knows there is anything to say about.

                                    On a day with no times it is the answer to
                                    the rostered shift nobody has accounted for.
                                    It used to appear only once a row existed,
                                    which meant the one day that most needed a
                                    reason was the one day with nowhere to put
                                    it. */}
                                {(i === 0 || entry.id) && (
                                    <div className="mt-2">
                                        <label className={labelClass} htmlFor={`note-${entry.id || 'new'}`}>
                                            {entry.starts_at
                                                ? 'Why, for the accountant'
                                                : 'Why nothing was worked, for the accountant'}
                                        </label>
                                        {/* Keyed, so the box reloads from the
                                            row once a note with no times has
                                            saved and stopped being a draft. */}
                                        <AutoTextarea
                                            key={entry.id || 'new'}
                                            id={`note-${entry.id || 'new'}`}
                                            rows={2}
                                            disabled={!canEdit}
                                            className={fieldClass}
                                            placeholder={entry.starts_at
                                                ? 'Stayed to close, came in early for a delivery...'
                                                : 'Swapped after the roster went up, did not turn up...'}
                                            defaultValue={entry.note || ''}
                                            onBlur={e => onNote(entry, e.target.value)}
                                        />
                                    </div>
                                )}
                            </div>
                        ))}

                        {canEdit && cell.entries.length > 0 && cell.entries.every(e => e.starts_at && e.ends_at) && (
                            <button type="button" onClick={onAdd} className={`${secondaryButton} text-xs`}>
                                Another shift this day
                            </button>
                        )}

                        <p className="text-sm font-bold text-gray-900 mt-3 tabular-nums">
                            {fmtHours(cell.hours)} hours
                        </p>
                    </div>
                )}

                {canEdit && !cell.absence && (
                    <div className="mt-4 pt-3 border-t border-border">
                        <p className={labelClass}>Or the whole day was</p>
                        <div className="flex flex-wrap gap-2">
                            {STATE_KEYS.map(state => (
                                <button
                                    key={state.key}
                                    type="button"
                                    onClick={() => onState(state.key)}
                                    style={{
                                        borderColor: state.absence ? absenceKind(state.value).colour : kindOf(state.value).colour,
                                        color: state.absence ? absenceKind(state.value).colour : kindOf(state.value).colour,
                                    }}
                                    className="min-h-[2.25rem] px-3 rounded-lg border bg-white text-xs font-semibold transition-colors hover:bg-gray-50"
                                >
                                    {state.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>Done</button>
            </div>
        </Modal>
    )
}

// The same mask as the grid, so a time typed on a phone behaves exactly as one
// typed on a computer: digits only, the colons put in and taken out for you.
function Box({ entry, field, canEdit, onType, onSettle }) {
    return (
        <input
            type="text"
            inputMode="numeric"
            disabled={!canEdit}
            className={fieldClass}
            value={entry[field] || ''}
            aria-label={field === 'starts_at' ? 'Clock in' : 'Clock out'}
            onChange={e => onType(entry, field, maskTime(e.target.value))}
            onBlur={e => onSettle(entry, field, settleTime(e.target.value))}
        />
    )
}
