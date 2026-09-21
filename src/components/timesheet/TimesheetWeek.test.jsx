// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { personWeek } from '@/lib/timesheet'
import TimesheetWeek from '@/components/timesheet/TimesheetWeek'

const WEEK = '2026-10-25'          // Sunday. Monday the 26th is a bank holiday.
const SUN = '2026-10-25'
const MON = '2026-10-26'
const TUE = '2026-10-27'
const DATES = ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']

const aoife = { id: 'e1', full_name: 'Aoife', hourly_rate: 16.5 }
const cathal = { id: 'e2', full_name: 'Cathal', hourly_rate: null }

function grid(over = {}) {
    const { entries = [], shifts = [], absences = [], people = [aoife, cathal], percent, target } = over
    const rows = people.map(person => personWeek({
        person, weekStart: WEEK, entries, absences, shifts,
        restaurantRate: 15,
        // The week under test is in October 2026 and nothing is asked about a
        // week that has not finished, so now is pinned after it.
        today: '2026-11-02',
    }))
    const calls = {
        onType: vi.fn(), onSettle: vi.fn(), onState: vi.fn(),
        onClear: vi.fn(), onAdd: vi.fn(), onHours: vi.fn(), onOpen: vi.fn(),
    }
    render(<TimesheetWeek rows={rows} dates={DATES} percent={percent} target={target} {...calls} />)
    return calls
}

const boxes = () => Array.from(document.querySelectorAll('input[data-r]'))

describe('the week grid', () => {
    it('gives every day a pair of boxes, rostered or not', () => {
        grid()
        // Two people, seven days, in and out.
        expect(boxes()).toHaveLength(2 * 7 * 2)
    })

    // The fault he found in the design: an unrostered day used to be a dead
    // cell. Somebody can work a day nobody planned.
    it('lets a day nobody rostered be typed into', async () => {
        const { onType } = grid()
        const box = boxes()[0]
        await userEvent.type(box, '9')
        expect(onType).toHaveBeenCalled()
    })

    it('puts the rostered time in the box as a suggestion, never as a value', () => {
        grid({ shifts: [{ id: 's1', employee_id: 'e1', shift_date: SUN, starts_at: '12:00:00', ends_at: '20:00:00' }] })
        const box = boxes()[0]
        expect(box).toHaveAttribute('placeholder', '12:00')
        expect(box).toHaveValue('')
    })

    // Two words rather than the name of it. "October" at the top of a column in
    // October is a word nobody needs.
    it('marks the bank holiday in the column head', () => {
        grid()
        expect(screen.getByText('BANK HOLIDAY')).toBeInTheDocument()
    })
})

describe('Tab, which goes box to box and nowhere else', () => {
    // Filling in a week is typing. Every cell can hold four buttons: the chip
    // on a day off, the x that takes it away, the way in to a comment and the
    // second span, and tabbing along a person used to stop at each of them on
    // the way from Monday to Tuesday.
    it('steps from one box straight to the next', async () => {
        grid({
            absences: [{ id: 'a1', employee_id: 'e1', kind: 'holiday', status: 'approved', starts_on: TUE, ends_on: TUE, hours: 8 }],
            entries: [{ id: 't1', employee_id: 'e1', work_date: MON, starts_at: '09:00:00', ends_at: '17:00:00', kind: 'worked', note: 'stayed to close' }],
        })

        boxes()[0].focus()
        await userEvent.tab()
        expect(document.activeElement).toBe(boxes()[1])
        await userEvent.tab()
        expect(document.activeElement).toBe(boxes()[2])
    })

    it('leaves every one of them pressable', () => {
        grid({
            absences: [{ id: 'a1', employee_id: 'e1', kind: 'holiday', status: 'approved', starts_on: TUE, ends_on: TUE, hours: 8 }],
        })
        // The Holiday column heading says the same word, so the chip is asked
        // for by where it is rather than by what it says.
        const chip = within(document.querySelector('tbody')).getByText('Holiday').closest('button')
        expect(chip).not.toBeDisabled()
        expect(chip.tabIndex).toBe(-1)
    })
})

describe('moving about', () => {
    // The whole reason there is no Tab handler. Weekly Sales needed one because
    // it wanted the opposite of the browser's order; this wants the browser's
    // order, which is along a person from Sunday to Saturday.
    it('lays the boxes out in the order Tab already goes', () => {
        grid()
        const order = boxes().map(b => `${b.dataset.r}${b.dataset.d}${b.dataset.i}`)
        expect(order.slice(0, 5)).toEqual(['000', '001', '010', '011', '020'])
        // And the fifteenth box is the second person's Sunday.
        expect(order[14]).toBe('100')
    })

    it('moves to the person below on the down arrow', async () => {
        grid()
        const first = boxes()[0]
        first.focus()
        await userEvent.keyboard('{ArrowDown}')
        expect(document.activeElement.dataset.r).toBe('1')
        expect(document.activeElement.dataset.d).toBe('0')
    })

    it('goes back up again', async () => {
        grid()
        boxes().find(b => b.dataset.r === '1' && b.dataset.d === '0' && b.dataset.i === '0').focus()
        await userEvent.keyboard('{ArrowUp}')
        expect(document.activeElement.dataset.r).toBe('0')
    })

    it('stays put at the top rather than wrapping round', async () => {
        grid()
        const first = boxes()[0]
        first.focus()
        await userEvent.keyboard('{ArrowUp}')
        expect(document.activeElement).toBe(first)
    })
})

describe('Enter, which moves on and nothing else', () => {
    const rostered = [{ id: 's1', employee_id: 'e1', shift_date: SUN, starts_at: '12:00:00', ends_at: '20:00:00' }]

    // The one he stopped. Enter used to put the rostered time into an empty
    // box. What somebody was rostered for is never what goes to the accountant,
    // only what the clock said is, and a key that fills the plan in makes it
    // easy to file the plan as the record.
    it('never puts the rostered time in the box', async () => {
        const { onSettle } = grid({ shifts: rostered })
        boxes()[0].focus()
        await userEvent.keyboard('{Enter}')
        expect(onSettle.mock.calls.map(call => call[4])).not.toContain('12:00:00')
    })

    it('moves on', async () => {
        grid({ shifts: rostered })
        boxes()[0].focus()
        await userEvent.keyboard('{Enter}')
        expect(document.activeElement).toBe(boxes()[1])
    })

    // The figure itself stays behind the box, because knowing who was meant to
    // be in is worth having. It is something to read, not something to accept.
    it('still shows what they were rostered for', () => {
        grid({ shifts: rostered })
        expect(boxes()[0]).toHaveAttribute('placeholder', '12:00')
        expect(boxes()[0]).toHaveValue('')
    })

    it('leaves a box that already has something alone', async () => {
        const { onSettle } = grid({
            shifts: rostered,
            entries: [{ id: 't1', employee_id: 'e1', work_date: SUN, starts_at: '11:58:04', ends_at: '20:03:12', kind: 'worked' }],
        })
        boxes()[0].focus()
        await userEvent.keyboard('{Enter}')
        expect(onSettle.mock.calls.map(call => call[4])).toEqual(['11:58:04'])
    })
})

describe('a letter sets the day', () => {
    it.each(['h', 's', 't', 'r'])('takes %s', async key => {
        const { onState, onType } = grid()
        await userEvent.type(boxes()[0], key)
        expect(onState).toHaveBeenCalledWith(aoife, expect.objectContaining({ date: SUN }), key)
        expect(onType).not.toHaveBeenCalled()
    })

    it('leaves digits to be times', async () => {
        const { onState, onType } = grid()
        await userEvent.type(boxes()[0], '1158')
        expect(onState).not.toHaveBeenCalled()
        expect(onType).toHaveBeenCalled()
    })
})

describe('what the cells say', () => {
    it('draws a holiday as the roster draws it, not as a number', () => {
        grid({
            absences: [{ id: 'a1', employee_id: 'e1', kind: 'holiday', status: 'approved', starts_on: TUE, ends_on: TUE, hours: 8 }],
        })
        // Her row: the chip in the cell, 8.00 in the Holiday column, and
        // nothing in Worked. That is where his sheet has always kept it.
        const hers = document.querySelectorAll('tbody tr')[0]
        expect(within(hers).getByText('Holiday')).toBeInTheDocument()
        // The three figures are centred now, with the rest of them.
        const figures = Array.from(hers.querySelectorAll('td.text-center')).map(td => td.textContent.trim())
        expect(figures).toEqual(['8.00', '0.00', '€0.00'])
    })

    // **The figure belongs to the whole holiday, not to this day.** The cell
    // used to hold a box with the run's total in it, so fifteen hours over
    // three days showed 15 on each and invited somebody to edit a run from one
    // day of it. The cell shows this day's share and opens the day to change
    // anything, where the box can say what it is for.
    it('never puts an hours box in the grid', () => {
        grid({
            absences: [{ id: 'a1', employee_id: 'e1', kind: 'holiday', status: 'approved', starts_on: TUE, ends_on: TUE, hours: 8 }],
        })
        expect(screen.queryByLabelText('Holiday hours')).not.toBeInTheDocument()
    })

    it('says so when nobody has put hours on it yet', () => {
        grid({
            absences: [{ id: 'a1', employee_id: 'e1', kind: 'holiday', status: 'approved', starts_on: TUE, ends_on: TUE, hours: null }],
        })
        expect(screen.getByText('no hours yet')).toBeInTheDocument()
    })

    it('opens the day when the holiday is pressed', async () => {
        const calls = grid({
            absences: [{ id: 'a1', employee_id: 'e1', kind: 'holiday', status: 'approved', starts_on: TUE, ends_on: TUE, hours: 8 }],
        })
        // 'Holiday' is a column heading too, so ask the body for it.
        await userEvent.click(within(document.querySelector('tbody')).getByText('Holiday'))
        expect(calls.onOpen).toHaveBeenCalledWith(aoife, expect.objectContaining({ date: TUE }))
    })

    it('tells you this day’s share, never the run’s total', () => {
        grid({
            absences: [{ id: 'a1', employee_id: 'e1', kind: 'holiday', status: 'approved', starts_on: '2026-10-29', ends_on: '2026-10-31', hours: 15 }],
        })
        // Fifteen over three days. His real one, and the thing that was showing
        // fifteen on every day of it.
        expect(screen.getAllByText('5.00 this day')).toHaveLength(3)
    })

    it('says nothing about hours for a day off sick, which carries none', () => {
        grid({
            absences: [{ id: 'a2', employee_id: 'e1', kind: 'sick', status: 'approved', starts_on: TUE, ends_on: TUE }],
        })
        expect(screen.queryByText('no hours yet')).not.toBeInTheDocument()
        expect(screen.queryByText(/this day/)).not.toBeInTheDocument()
    })

    it('says when somebody worked a day nobody planned', () => {
        grid({
            entries: [{ id: 't1', employee_id: 'e1', work_date: TUE, starts_at: '09:00:00', ends_at: '17:00:00', kind: 'worked' }],
        })
        expect(screen.getByText('not rostered')).toBeInTheDocument()
    })

    it('shows the rostered time only when the day went differently', () => {
        grid({
            shifts: [
                { id: 's1', employee_id: 'e1', shift_date: SUN, starts_at: '12:00:00', ends_at: '20:00:00' },
                { id: 's2', employee_id: 'e1', shift_date: MON, starts_at: '12:00:00', ends_at: '20:00:00' },
            ],
            entries: [
                { id: 't1', employee_id: 'e1', work_date: SUN, starts_at: '12:00:00', ends_at: '20:00:00', kind: 'worked' },
                { id: 't2', employee_id: 'e1', work_date: MON, starts_at: '11:55:41', ends_at: '20:31:09', kind: 'worked' },
            ],
        })
        expect(screen.queryAllByText('for 12:00–20:00')).toHaveLength(1)
    })

    it('carries a typed comment under the times', () => {
        grid({
            entries: [{ id: 't1', employee_id: 'e1', work_date: TUE, starts_at: '09:00:00', ends_at: '17:33:16', kind: 'worked', note: 'stayed to close' }],
        })
        expect(screen.getByText(/stayed to close/)).toBeInTheDocument()
    })

    // His way of telling the accountant why a shift ran long or finished early.
    // One per pair of times, not one per day: a split shift is two spans and
    // the reason one of them ran over has nothing to do with the other.
    it('shows a note beside the times it belongs to', () => {
        grid({
            entries: [{ id: 't1', employee_id: 'e1', work_date: TUE, starts_at: '09:00:00', ends_at: '17:33:16', kind: 'worked', note: 'stayed to close' }],
        })
        expect(screen.getByText(/stayed to close/)).toBeInTheDocument()
    })

    // Only where the line has nothing else to say. A day that ran differently
    // to the roster already has a line, and that line is the way in.
    it('offers a quiet way in when the line is otherwise empty', () => {
        grid({ shifts: [{ id: 's9', employee_id: 'e1', shift_date: TUE, starts_at: '09:00:00', ends_at: '17:00:00' }], entries: [{ id: 't1', employee_id: 'e1', work_date: TUE, starts_at: '09:00:00', ends_at: '17:00:00', kind: 'worked' }] })
        expect(screen.getByText('+ comment')).toBeInTheDocument()
    })

    it('uses the line itself when there is already something on it', () => {
        grid({ entries: [{ id: 't1', employee_id: 'e1', work_date: TUE, starts_at: '09:00:00', ends_at: '17:00:00', kind: 'worked' }] })
        expect(screen.queryByText('+ comment')).not.toBeInTheDocument()
        expect(screen.getByText('not rostered')).toBeInTheDocument()
    })

    it('offers none on a day with nothing on it', () => {
        grid()
        expect(screen.queryByText('+ comment')).not.toBeInTheDocument()
    })

    // Except where something was meant to happen and nothing did. That day is
    // what the report block is waiting on, and a comment is the other way of
    // answering it.
    it('offers one on a rostered day with nothing on it', () => {
        grid({ shifts: [{ id: 's9', employee_id: 'e1', shift_date: TUE, starts_at: '09:00:00', ends_at: '17:00:00' }] })
        expect(screen.getByText('+ comment')).toBeInTheDocument()
    })

    it('shows a comment written on a day with no times', () => {
        grid({
            shifts: [{ id: 's9', employee_id: 'e1', shift_date: TUE, starts_at: '09:00:00', ends_at: '17:00:00' }],
            entries: [{ id: 't1', employee_id: 'e1', work_date: TUE, starts_at: null, ends_at: null, kind: 'worked', note: 'swapped with somebody' }],
        })
        // His own words, on their own line rather than quoted at the end of
        // the app's.
        expect(screen.getByText('swapped with somebody')).toBeInTheDocument()
        expect(screen.queryByText('+ comment')).not.toBeInTheDocument()
    })

    // A till time somebody moved. The cell says which day, the banner says who.
    it('asks why a till time was changed', () => {
        grid({
            entries: [{ id: 't1', employee_id: 'e1', work_date: TUE, starts_at: '09:20:00', ends_at: '17:00:00', kind: 'worked', source: 'corrected' }],
        })
        expect(screen.getByText(/changed, say why/)).toBeInTheDocument()
    })

    it('says nothing once the change has a comment on it', () => {
        grid({
            entries: [{ id: 't1', employee_id: 'e1', work_date: TUE, starts_at: '09:20:00', ends_at: '17:00:00', kind: 'worked', source: 'corrected', note: 'clocked in on the wrong till' }],
        })
        expect(screen.queryByText(/changed, say why/)).not.toBeInTheDocument()
    })

    it('opens the day when the line is pressed', async () => {
        const onOpen = vi.fn()
        const rows = [personWeek({
            person: aoife, weekStart: WEEK, restaurantRate: 15,
            shifts: [{ id: 's9', employee_id: 'e1', shift_date: TUE, starts_at: '09:00:00', ends_at: '17:00:00' }], entries: [{ id: 't1', employee_id: 'e1', work_date: TUE, starts_at: '09:00:00', ends_at: '17:00:00', kind: 'worked' }],
        })]
        render(<TimesheetWeek
            rows={rows} dates={DATES} onOpen={onOpen}
            onType={vi.fn()} onSettle={vi.fn()} onState={vi.fn()} onClear={vi.fn()} onAdd={vi.fn()} onHours={vi.fn()}
        />)
        await userEvent.click(screen.getByText('+ comment'))
        expect(onOpen).toHaveBeenCalledWith(aoife, expect.objectContaining({ date: TUE }))
    })

    it('offers a second span only once the first one is finished', () => {
        grid({
            entries: [{ id: 't1', employee_id: 'e1', work_date: TUE, starts_at: '09:00:00', ends_at: null, kind: 'worked' }],
        })
        expect(screen.queryByText('+ another')).not.toBeInTheDocument()
    })

    it('offers it when the first one is', () => {
        grid({
            entries: [{ id: 't1', employee_id: 'e1', work_date: TUE, starts_at: '09:00:00', ends_at: '17:00:00', kind: 'worked' }],
        })
        expect(screen.getByText('+ another')).toBeInTheDocument()
    })
})

describe('the totals along the bottom', () => {
    const entries = [
        { id: 't1', employee_id: 'e1', work_date: SUN, starts_at: '12:00:00', ends_at: '20:00:00', kind: 'worked' },
        { id: 't2', employee_id: 'e2', work_date: SUN, starts_at: '09:00:00', ends_at: '17:00:00', kind: 'worked' },
    ]

    it('adds the day up in hours and in money', () => {
        grid({ entries })
        const foot = document.querySelector('tfoot')
        expect(within(foot).getAllByText('16.00')).toHaveLength(2)
        // 8 at 16.50 and 8 at 15.00.
        expect(within(foot).getAllByText('€252.00').length).toBeGreaterThan(0)
    })

    // The Sunday tenner was designed in, built and then taken out again on his
    // word. Nothing on the week is money that is not hours times a rate.
    it('has no Sunday line on it', () => {
        grid({ entries })
        expect(within(document.querySelector('tfoot')).queryByText('Sunday')).not.toBeInTheDocument()
    })
})

describe('what the week cost as a share of what it took', () => {
    // The one figure the old Labour page had that this screen did not, and the
    // reason it was read: it says a Tuesday was overstaffed without anybody
    // knowing either figure by heart.
    const percent = {
        days: [
            { date: SUN, percent: 22.5 },
            { date: MON, percent: null },
            { date: TUE, percent: 41.2 },
            { date: '2026-10-28', percent: null },
            { date: '2026-10-29', percent: null },
            { date: '2026-10-30', percent: null },
            { date: '2026-10-31', percent: null },
        ],
        week: 31.8,
    }

    it('gives the week a line of its own', () => {
        grid({ percent, target: 30 })
        const foot = document.querySelector('tfoot')
        expect(within(foot).getByText('Of sales')).toBeInTheDocument()
        expect(within(foot).getByText('22.5%')).toBeInTheDocument()
        expect(within(foot).getByText('31.8%')).toBeInTheDocument()
    })

    // A closed day, or a day nobody has entered sales for, has nothing to
    // divide by. A dash rather than a nought, which would read like an answer.
    it('leaves a day with nothing to divide by blank', () => {
        grid({ percent, target: 30 })
        expect(within(document.querySelector('tfoot')).getAllByText('—').length).toBeGreaterThan(0)
    })

    it('shades a day against the target', () => {
        grid({ percent, target: 30 })
        const foot = document.querySelector('tfoot')
        expect(within(foot).getByText('22.5%').className).toContain('green')
        expect(within(foot).getByText('41.2%').className).toContain('red')
    })

    it('shades nothing when nobody has set a target', () => {
        grid({ percent })
        expect(within(document.querySelector('tfoot')).getByText('22.5%').className).toContain('gray')
    })

    it('has no such line on a week with no sales loaded', () => {
        grid()
        expect(within(document.querySelector('tfoot')).queryByText('Of sales')).not.toBeInTheDocument()
    })
})
