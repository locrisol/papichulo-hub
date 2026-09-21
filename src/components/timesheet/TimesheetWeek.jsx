import { DAY_NAMES } from '@/lib/events'
import { shortDate } from '@/lib/dates'
import { fmtMoney, fmtPct } from '@/lib/format'
import { statusFor } from '@/lib/costTargets'
import { weekTotals } from '@/lib/timesheet'
import { tableHeadRow } from '@/lib/controlStyles'
import { BANK_HOLIDAY_ON_DARK, BANK_HOLIDAY_WASH, BANK_HOLIDAY_LABEL } from '@/lib/bankHolidays'
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

// The one table in the Hub with a palette of its own, and it earns it: three
// different jobs are going on in one grid. The name says whose row it is, the
// seven days are the only thing you type into, and the three figures on the
// right are what the week came to.
//
// So there is a ladder, heaviest at the answer. The heading row keeps the green
// every other table in the app uses and is darker than anything below it, which
// is what stops the top-left corner reading as part of the name column. The
// name and Cost are a lighter green, Worked a tint of it, Holiday a faint blue
// because blue is what a holiday is everywhere else in the Hub, and the days
// themselves are the app's own cream so the only white left on the screen is a
// box you can type in.
//
// Two tones each, for the row bands: a long team is read across, and a band is
// the cheapest way to keep an eye on one line of it.
const SHEET = {
    name: ['#33513F', '#3B5B48'],
    // All seven the same. A deeper Saturday and Sunday was in the drawing and
    // he took it out: the week is read a person at a time, and a column that is
    // darker for no reason anybody types is one more thing to explain.
    day: ['#F7F5F0', '#F2EFE9'],
    holiday: ['#E9EFF6', '#E2EAF3'],
    worked: ['#D9E1DB', '#D1DBD4'],
    cost: ['#33513F', '#3B5B48'],
    // One light line down each day, so a Wednesday cannot be read as a Tuesday.
    rule: '1px solid rgba(24, 47, 36, 0.10)',
    figureInk: '#16301F',
    holidayInk: '#3F5871',
}

// Green at or under target, amber within two points over, red past that. The
// bands come from costTargets, the same as the dashboard and the report, so a
// week cannot be judged differently depending on the screen you read it on.
// Only the colours are this screen's own.
const PERCENT_TONE = { green: 'text-green-700', amber: 'text-amber-600', red: 'text-red-600', none: 'text-gray-900' }

// The same three judgements on the dark green of the Cost column, where the
// text colours above would be unreadable.
const DOT = { green: '#7BD3A0', amber: '#F0C36B', red: '#F08B7B', none: 'transparent' }

export default function TimesheetWeek({
    rows, dates, percent, target, canEdit = true,
    onType, onSettle, onState, onClear, onAdd, onOpen,
}) {
    const totals = weekTotals(rows)

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
            {/* Fixed, and the widths are declared once here.
                A table sizes its columns from what is in them, so typing a
                comment into Friday made Friday wider and shoved every other
                day along. Nothing you type should move a column you are not
                typing in. The row is free to get taller, which is what a
                comment should cost. */}
            <table className="w-full min-w-[64rem] text-xs border-collapse table-fixed">
                <colgroup>
                    <col className="w-[10%]" />
                    {dates.map(date => <col key={date} className="w-[10%]" />)}
                    <col className="w-[6%]" />
                    <col className="w-[6%]" />
                    <col className="w-[8%]" />
                </colgroup>
                <thead>
                    {/* A rule under the heading, because the first person used
                        to start flush against it. */}
                    <tr className={`${tableHeadRow} border-b-[3px] border-[#0B1A12]`}>
                        <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider whitespace-nowrap">
                            Who
                        </th>
                        {dates.map((date, i) => {
                            const day = totals.perDay[i]
                            return (
                                <th
                                    key={date}
                                    style={{ borderLeft: SHEET.rule }}
                                    className="text-center px-3 py-2 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                                >
                                    {DAY_NAMES[new Date(`${date}T00:00:00`).getDay()]} {shortDate(date)}
                                    {/* A bank holiday is named on the heading
                                        rather than tinting the whole column.
                                        The column carries the tint further down
                                        where the cells are, and doing both on a
                                        dark green heading only made the heading
                                        look broken. */}
                                    {day?.bankHoliday && (
                                        <span
                                            className="block normal-case tracking-normal text-[0.65rem] font-bold"
                                            style={{ color: BANK_HOLIDAY_ON_DARK }}
                                        >
                                            {BANK_HOLIDAY_LABEL}
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
                    {/* A heavier line between people than between the two
                        boxes inside a cell. A row here is four lines tall and
                        the hairline that divides one person from the next was
                        lighter than the borders on the boxes inside them. */}
                    {rows.map((row, r) => {
                        const band = r % 2
                        return (
                        <tr key={row.person.id} className="border-b-2 border-gray-300 align-top">
                            <th
                                style={{ backgroundColor: SHEET.name[band] }}
                                className="text-left px-3 py-2 font-semibold text-white whitespace-nowrap"
                            >
                                {row.person.full_name}
                                {row.ownRate && (
                                    <span className="block text-xs text-white/60 tracking-wide">
                                        {fmtMoney(row.rate)}
                                    </span>
                                )}
                            </th>

                            {row.days.map((cell, d) => (
                                <td
                                    key={cell.date}
                                    className="px-3 py-2 align-top"
                                    style={{
                                        borderLeft: SHEET.rule,
                                        backgroundColor: cell.bankHoliday
                                            ? BANK_HOLIDAY_WASH
                                            : SHEET.day[band],
                                    }}
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
                                        onOpen={() => onOpen(row.person, cell)}
                                    />
                                </td>
                            ))}

                            <Figure fill={SHEET.holiday[band]} ink={SHEET.holidayInk}>
                                {row.holiday ? row.holiday.toFixed(2) : '—'}
                            </Figure>
                            <Figure fill={SHEET.worked[band]} ink={SHEET.figureInk} bold>
                                {row.worked.toFixed(2)}
                            </Figure>
                            <Figure fill={SHEET.cost[band]} ink="#FFFFFF" bold>
                                {fmtMoney(row.cost)}
                            </Figure>
                        </tr>
                        )
                    })}

                    {rows.length === 0 && (
                        <tr>
                            <td colSpan={11} className="px-3 py-8 text-center text-sm text-muted italic">
                                Nobody on the team yet. Add people on the Team page and they appear here.
                            </td>
                        </tr>
                    )}
                </tbody>

                {/* The band at the bottom is the one Weekly Sales uses for its
                    tracked totals: a heavier rule and a darker grey than a
                    striped row, so the week's own figures are not read as one
                    more person's. Same situation, same answer. */}
                <tfoot>
                    <tr className="border-t-2 border-gray-300 bg-gray-200">
                        <Foot style={{ backgroundColor: SHEET.name[0], color: '#FFFFFF' }}>Hours</Foot>
                        {totals.perDay.map(day => (
                            <Foot
                                key={day.date}
                                style={{
                                    borderLeft: SHEET.rule,
                                    ...(day.bankHoliday ? { backgroundColor: BANK_HOLIDAY_WASH } : {}),
                                }}
                            >
                                {day.hours.toFixed(2)}
                            </Foot>
                        ))}
                        <Foot style={{ backgroundColor: SHEET.holiday[0], color: SHEET.holidayInk }}>
                            {totals.holiday ? totals.holiday.toFixed(2) : '—'}
                        </Foot>
                        <Foot style={{ backgroundColor: SHEET.worked[0], color: SHEET.figureInk }}>
                            {totals.hours.toFixed(2)}
                        </Foot>
                        <Foot style={{ backgroundColor: SHEET.cost[0], color: '#FFFFFF' }}>
                            {fmtMoney(totals.cost)}
                        </Foot>
                    </tr>

                    <tr className="border-t border-gray-300 bg-gray-200">
                        <Foot style={{ backgroundColor: SHEET.name[0], color: '#FFFFFF' }}>Cost</Foot>
                        {totals.perDay.map(day => (
                            <Foot key={day.date} style={{ borderLeft: SHEET.rule }}>{fmtMoney(day.cost)}</Foot>
                        ))}
                        <Foot style={{ backgroundColor: SHEET.holiday[0] }} />
                        <Foot style={{ backgroundColor: SHEET.worked[0] }} />
                        <Foot style={{ backgroundColor: SHEET.cost[0] }} />
                    </tr>

                    {/* What the old Labour page was read for: the day's hours as
                        a share of the day's sales. It is the only line on the
                        week that says whether a Tuesday was overstaffed without
                        anybody knowing either figure by heart.

                        Blank where there is nothing to divide by, which is a
                        closed day or a day nobody has entered sales for yet,
                        rather than a nought that reads like an answer. */}
                    {percent && (
                        <tr className="border-t border-gray-300 bg-gray-200">
                            <Foot style={{ backgroundColor: SHEET.name[0], color: '#FFFFFF' }}>
                                Of sales
                            </Foot>
                            {percent.days.map(day => (
                                <Foot key={day.date} style={{ borderLeft: SHEET.rule }}>
                                    <span className={PERCENT_TONE[statusFor(day.percent, target)]}>
                                        {day.percent == null ? '—' : fmtPct(day.percent)}
                                    </span>
                                </Foot>
                            ))}
                            <Foot style={{ backgroundColor: SHEET.holiday[0] }} />
                            <Foot style={{ backgroundColor: SHEET.worked[0] }} />
                            <Foot style={{ backgroundColor: SHEET.cost[0], color: '#FFFFFF' }}>
                                {/* White on the green, with the judgement as a
                                    dot beside it: green, amber and red on that
                                    ground are three colours nobody can read. */}
                                {percent.week != null && target && (
                                    <i
                                        className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                                        style={{ backgroundColor: DOT[statusFor(percent.week, target)] }}
                                    />
                                )}
                                {percent.week == null ? '—' : fmtPct(percent.week)}
                            </Foot>
                        </tr>
                    )}
                </tfoot>
            </table>
        </div>
    )
}

const Head = ({ children }) => (
    <th
        style={{ borderLeft: SHEET.rule }}
        className="text-center px-3 py-2 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
    >
        {children}
    </th>
)

// Centred, all of them. A column of figures under a centred heading was reading
// right and the heading middle, and there is nothing in these three columns
// long enough to need lining up on its last digit.
const Figure = ({ children, bold, fill, ink }) => (
    <td
        style={{ backgroundColor: fill, color: ink, borderLeft: SHEET.rule }}
        className={`px-3 py-2 text-center tabular-nums whitespace-nowrap ${bold ? 'font-semibold' : ''}`}
    >
        {children}
    </td>
)

const Foot = ({ children, style }) => (
    <td
        style={style}
        className="px-3 py-2.5 font-semibold text-gray-900 tabular-nums whitespace-nowrap text-center first:text-left"
    >
        {children}
    </td>
)
