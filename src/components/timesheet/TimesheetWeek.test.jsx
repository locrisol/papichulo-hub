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
    const { entries = [], shifts = [], absences = [], people = [aoife, cathal] } = over
    const rows = people.map(person => personWeek({
        person, weekStart: WEEK, entries, absences, shifts,
        restaurantRate: 15, sundayPremium: 10,
    }))
    const calls = {
        onType: vi.fn(), onSettle: vi.fn(), onState: vi.fn(),
        onClear: vi.fn(), onAdd: vi.fn(), onHours: vi.fn(), onOpen: vi.fn(),
    }
    render(<TimesheetWeek rows={rows} dates={DATES} sundayPremium={10} {...calls} />)
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

    it('names the bank holiday in the column head', () => {
        grid()
        expect(screen.getByText('October')).toBeInTheDocument()
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
        const figures = Array.from(hers.querySelectorAll('td.text-right')).map(td => td.textContent)
        expect(figures).toEqual(['8.00', '0.00', '€0.00'])
    })

    // A holiday's hours come off the payslip and nothing here can know them.
    // The roster's own dialog leaves the figure empty for somebody to type, so
    // this does too: it is a box, not a default. Eight would be a made up
    // number going to an accountant.
    it('gives a holiday a box for its hours rather than a guess', () => {
        grid({
            absences: [{ id: 'a1', employee_id: 'e1', kind: 'holiday', status: 'approved', starts_on: TUE, ends_on: TUE, hours: null }],
        })
        const box = screen.getByLabelText('Holiday hours')
        expect(box).toHaveValue('')
        // Marked, so a holiday worth nothing does not sit there looking done.
        expect(box.className).toContain('border-accent')
    })

    it('shows the figure once it has one', () => {
        grid({
            absences: [{ id: 'a1', employee_id: 'e1', kind: 'holiday', status: 'approved', starts_on: TUE, ends_on: TUE, hours: 8 }],
        })
        expect(screen.getByLabelText('Holiday hours')).toHaveValue('8')
    })

    it('tells you this day’s share of a holiday that runs several days', () => {
        grid({
            absences: [{ id: 'a1', employee_id: 'e1', kind: 'holiday', status: 'approved', starts_on: '2026-10-29', ends_on: '2026-10-31', hours: 15 }],
        })
        // Fifteen over three days. His real one, and the thing that was showing
        // fifteen on every day of it.
        expect(screen.getAllByText('5.00 this day')).toHaveLength(3)
    })

    it('has no hours box for a day off sick, which carries none', () => {
        grid({
            absences: [{ id: 'a2', employee_id: 'e1', kind: 'sick', status: 'approved', starts_on: TUE, ends_on: TUE }],
        })
        expect(screen.queryByLabelText('Holiday hours')).not.toBeInTheDocument()
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

    it('carries a typed note on the same line', () => {
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
        expect(screen.getByText('+ note')).toBeInTheDocument()
    })

    it('uses the line itself when there is already something on it', () => {
        grid({ entries: [{ id: 't1', employee_id: 'e1', work_date: TUE, starts_at: '09:00:00', ends_at: '17:00:00', kind: 'worked' }] })
        expect(screen.queryByText('+ note')).not.toBeInTheDocument()
        expect(screen.getByText('not rostered')).toBeInTheDocument()
    })

    it('offers none on a day with nothing on it', () => {
        grid()
        expect(screen.queryByText('+ note')).not.toBeInTheDocument()
    })

    it('opens the day when the line is pressed', async () => {
        const onOpen = vi.fn()
        const rows = [personWeek({
            person: aoife, weekStart: WEEK, restaurantRate: 15, sundayPremium: 10,
            shifts: [{ id: 's9', employee_id: 'e1', shift_date: TUE, starts_at: '09:00:00', ends_at: '17:00:00' }], entries: [{ id: 't1', employee_id: 'e1', work_date: TUE, starts_at: '09:00:00', ends_at: '17:00:00', kind: 'worked' }],
        })]
        render(<TimesheetWeek
            rows={rows} dates={DATES} sundayPremium={10} onOpen={onOpen}
            onType={vi.fn()} onSettle={vi.fn()} onState={vi.fn()} onClear={vi.fn()} onAdd={vi.fn()} onHours={vi.fn()}
        />)
        await userEvent.click(screen.getByText('+ note'))
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
        // 8 at 16.50 and 8 at 15.00, plus a tenner each.
        expect(within(foot).getAllByText('€272.00').length).toBeGreaterThan(0)
    })

    // The tenner gets its own line, because it is the first money in the Hub
    // that is not hours times a rate and a figure appearing from nowhere inside
    // a total is a figure somebody has to go looking for.
    it('gives the Sunday premium a line of its own', () => {
        grid({ entries })
        const foot = document.querySelector('tfoot')
        expect(within(foot).getByText('Sunday')).toBeInTheDocument()
        expect(within(foot).getByText('€20.00')).toBeInTheDocument()
    })

    it('leaves that line out when nobody worked a Sunday', () => {
        grid({
            entries: [{ id: 't1', employee_id: 'e1', work_date: TUE, starts_at: '09:00:00', ends_at: '17:00:00', kind: 'worked' }],
        })
        expect(within(document.querySelector('tfoot')).queryByText('Sunday')).not.toBeInTheDocument()
    })
})
