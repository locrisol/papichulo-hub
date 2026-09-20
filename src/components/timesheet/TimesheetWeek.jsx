import { DAY_NAMES } from '@/lib/events'
import { shortDate } from '@/lib/dates'
import { fmtMoney } from '@/lib/format'
import { weekTotals, BANK_HOLIDAY_COLOUR } from '@/lib/timesheet'
import TimeCell from '@/components/timesheet/TimeCell'
import { focusBox, stepFrom } from '@/components/timesheet/boxes'

// The week, his spreadsheet kept.
//
// One person a row, seven days across, clock in above clock out and nothing
// else in the cell. Every figure on it is a total: down the right per person,
// along the bottom per day. That is how his sheet already reads, and he asked
// for the per-day hours to come out of the cells when he saw them there.
//
// **Tab is not handled here, on purpose.** Weekly Sales overrides Tab because
// its rows are receipt lines and you fill one down a day, so the browser's own
// order was wrong there. Here it is the other way round: one person a row, days
// across, and going along a person from Sunday to Saturday *is* the browser's
// order. The thing he asked for costs no code, which also means it cannot drift
// out of step with anything.
//
// What is handled is Enter, which moves on, and the up and down arrows, which
// change person. Left and right are left alone so a typo can still be fixed.

export default function TimesheetWeek({
    rows, dates, sundayPremium, canEdit = true,
    onType, onSettle, onState, onClear, onAdd,
}) {
    const totals = weekTotals(rows, sundayPremium)

    function onKeyDown(e) {
        const el = e.target
        if (!el.dataset?.r) return
        const at = {
            r: Number(el.dataset.r), d: Number(el.dataset.d),
            s: Number(el.dataset.s), i: Number(el.dataset.i),
        }

        // Enter moves on and nothing else.
        //
        // It used to put the rostered time into an empty box, and he stopped
        // that: a rostered time is never what goes to the accountant, only what
        // the clock said is. The grey figure behind the box stays, because
        // knowing who was meant to be in is worth having, but there is no key
        // and no button that turns it into a value.
        if (e.key === 'Enter') {
            e.preventDefault()
            stepFrom(e.currentTarget, el, 1)
            return
        }

        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            focusBox(e.currentTarget, { ...at, r: at.r + (e.key === 'ArrowDown' ? 1 : -1) })
        }
    }

    return (
        <div className="overflow-x-auto" onKeyDown={onKeyDown}>
            <table className="w-full min-w-[64rem] text-xs border-collapse">
                <thead>
                    <tr className="bg-gray-100 border-b border-gray-400">
                        <th className="text-left px-2 py-1.5 font-bold text-[0.62rem] uppercase tracking-wider text-muted whitespace-nowrap">
                            Who
                        </th>
                        {dates.map((date, i) => {
                            const day = totals.perDay[i]
                            return (
                                <th
                                    key={date}
                                    className="text-left px-2 py-1.5 font-bold text-[0.62rem] uppercase tracking-wider text-muted whitespace-nowrap"
                                    style={day?.bankHoliday ? { backgroundColor: '#FBF4E2' } : undefined}
                                >
                                    {DAY_NAMES[new Date(`${date}T00:00:00`).getDay()]} {shortDate(date)}
                                    {day?.bankHoliday && (
                                        <span
                                            className="block normal-case tracking-normal font-bold text-[0.58rem]"
                                            style={{ color: BANK_HOLIDAY_COLOUR }}
                                        >
                                            {day.bankHoliday.short}
                                        </span>
                                    )}
                                </th>
                            )
                        })}
                        <Head>Holiday</Head>
                        <Head>Worked</Head>
                        <Head>Cost</Head>
                    </tr>
                </thead>

                <tbody>
                    {rows.map((row, r) => (
                        <tr key={row.person.id} className="border-b border-gray-200 align-top">
                            <th className="text-left px-2 py-1.5 font-semibold text-gray-900 whitespace-nowrap">
                                {row.person.full_name}
                                {row.ownRate && (
                                    <span className="block text-[0.58rem] font-bold text-accent-ink tracking-wide">
                                        {fmtMoney(row.rate)}
                                    </span>
                                )}
                            </th>

                            {row.days.map((cell, d) => (
                                <td
                                    key={cell.date}
                                    className="px-2 py-1.5 min-w-[5.5rem]"
                                    style={cell.bankHoliday ? { backgroundColor: '#FBF4E2' } : undefined}
                                >
                                    <TimeCell
                                        cell={cell}
                                        at={{ r, d }}
                                        canEdit={canEdit}
                                        onType={(entry, field, value) => onType(row.person, cell, entry, field, value)}
                                        onSettle={(entry, field, value) => onSettle(row.person, cell, entry, field, value)}
                                        onState={key => onState(row.person, cell, key)}
                                        onClear={() => onClear(row.person, cell)}
                                        onAdd={() => onAdd(row.person, cell)}
                                    />
                                </td>
                            ))}

                            <Figure>{row.holiday ? row.holiday.toFixed(2) : '—'}</Figure>
                            <Figure bold>{row.worked.toFixed(2)}</Figure>
                            <Figure>
                                {fmtMoney(row.cost)}
                                {row.premium > 0 && (
                                    <span className="block text-[0.6rem] text-gray-400 font-normal">
                                        incl. {fmtMoney(row.premium)} Sun
                                    </span>
                                )}
                            </Figure>
                        </tr>
                    ))}

                    {rows.length === 0 && (
                        <tr>
                            <td colSpan={11} className="px-2 py-6 text-center text-sm text-muted">
                                Nobody on the team yet. Add people on the Team page and they appear here.
                            </td>
                        </tr>
                    )}
                </tbody>

                <tfoot className="bg-gray-100 border-t border-gray-400">
                    <tr>
                        <Foot>Hours</Foot>
                        {totals.perDay.map(day => (
                            <Foot key={day.date} right style={day.bankHoliday ? { backgroundColor: '#FBF4E2' } : undefined}>
                                {day.hours.toFixed(2)}
                            </Foot>
                        ))}
                        <Foot right>{totals.holiday ? totals.holiday.toFixed(2) : '—'}</Foot>
                        <Foot right>{totals.hours.toFixed(2)}</Foot>
                        <Foot right>{fmtMoney(totals.cost)}</Foot>
                    </tr>

                    {/* The tenner gets its own line so the sum can be followed.
                        It is the first money in the Hub that is not hours times
                        a rate, and a figure that appears from nowhere inside a
                        cost total is a figure somebody has to go looking for. */}
                    {totals.premium > 0 && (
                        <tr>
                            <Foot>Sunday</Foot>
                            {totals.perDay.map(day => (
                                <Foot key={day.date} right>
                                    {day.premium > 0 ? fmtMoney(day.premium) : '—'}
                                </Foot>
                            ))}
                            <Foot colSpan={3} />
                        </tr>
                    )}

                    <tr>
                        <Foot>Cost</Foot>
                        {totals.perDay.map(day => (
                            <Foot key={day.date} right>{fmtMoney(day.cost)}</Foot>
                        ))}
                        <Foot colSpan={3} />
                    </tr>
                </tfoot>
            </table>
        </div>
    )
}

const Head = ({ children }) => (
    <th className="text-right px-2 py-1.5 font-bold text-[0.62rem] uppercase tracking-wider text-muted whitespace-nowrap">
        {children}
    </th>
)

const Figure = ({ children, bold }) => (
    <td className={`px-2 py-1.5 text-right tabular-nums whitespace-nowrap ${bold ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
        {children}
    </td>
)

const Foot = ({ children, right, colSpan, style }) => (
    <td
        colSpan={colSpan}
        style={style}
        className={`px-2 py-1.5 font-bold text-gray-900 tabular-nums whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}
    >
        {children}
    </td>
)
