import { DAY_NAMES } from '@/lib/events'
import { fmtMoney } from '@/lib/format'
import { weekTotals, cellColour } from '@/lib/timesheet'
import { kindLabel as absenceLabel } from '@/lib/absences'

// The same week on a phone.
//
// Fourteen clock times will not go across 390 pixels and no amount of care
// makes them. So the phone shows hours, with colour carrying the state, and a
// day opens to be typed. That is not a compromise, it is the only honest narrow
// answer: the wide grid is about a thousand pixels and a phone has four hundred.
//
// A tablet in landscape gets the wide grid, not this. An iPad 10.2 inch is
// 1,080 points across and the grid is about 1,050.
export default function TimesheetPhone({ rows, dates, sundayPremium, onOpenDay }) {
    const totals = weekTotals(rows, sundayPremium)

    return (
        <div>
            <div className="flex items-baseline justify-between gap-2 px-3 py-2 bg-gray-100 border-b border-gray-300">
                <span className="text-[0.62rem] font-bold uppercase tracking-wider text-muted">
                    {rows.length} {rows.length === 1 ? 'person' : 'people'}
                </span>
                <span className="text-sm font-bold text-gray-900 tabular-nums">
                    {totals.hours.toFixed(2)} h &middot; {fmtMoney(totals.cost)}
                </span>
            </div>

            <div className="flex gap-1 px-3 pt-2 pb-1 justify-end" aria-hidden="true">
                {dates.map(date => (
                    <span key={date} className="w-8 text-center text-[0.55rem] font-bold tracking-wide text-muted">
                        {DAY_NAMES[new Date(`${date}T00:00:00`).getDay()].slice(0, 1)}
                    </span>
                ))}
            </div>

            {rows.map(row => (
                <div key={row.person.id} className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border last:border-b-0">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{row.person.full_name}</p>
                        <div className="flex gap-1 mt-1">
                            {row.days.map(cell => (
                                <DayChip key={cell.date} cell={cell} onOpen={() => onOpenDay(row.person, cell)} />
                            ))}
                        </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-gray-900 tabular-nums">{row.worked.toFixed(2)}</p>
                        <p className="text-[0.66rem] text-muted tabular-nums">{fmtMoney(row.cost)}</p>
                    </div>
                </div>
            ))}

            {rows.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-muted">
                    Nobody on the team yet.
                </p>
            )}
        </div>
    )
}

// One day, small enough to fit seven across a phone and still be a thumb sized
// target. A dot means nothing was worked, which reads as quieter than a nought.
function DayChip({ cell, onOpen }) {
    const colour = cell.absence ? cellColour({ absence: cell.absence }) : null
    const worked = cell.hours > 0

    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={`${cell.date}${cell.absence ? `, ${absenceLabel(cell.absence.kind)}` : ''}${worked ? `, ${cell.hours.toFixed(2)} hours` : ''}`}
            className={`w-8 h-9 rounded text-[0.58rem] font-bold tabular-nums flex items-center justify-center
                border transition-colors focus:outline-none focus:ring-2 focus:ring-accent
                ${cell.unanswered ? 'border-accent border-dashed' : 'border-transparent'}
                ${worked || colour ? '' : 'text-gray-300'}`}
            style={{
                backgroundColor: colour ? `${colour}22` : (cell.bankHoliday ? '#FBF4E2' : '#F4F1EB'),
                color: colour || undefined,
            }}
        >
            {cell.absence ? absenceLabel(cell.absence.kind).slice(0, 1)
                : worked ? cell.hours.toFixed(1)
                    : '·'}
        </button>
    )
}
