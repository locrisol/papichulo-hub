// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { personWeek } from '@/lib/timesheet'
import TimesheetDay from '@/components/timesheet/TimesheetDay'

const WEEK = '2026-10-25'
const DAY = '2026-10-27'          // Tuesday, an ordinary day

const aoife = { id: 'e1', full_name: 'Aoife', hourly_rate: 16.5 }
const cathal = { id: 'e2', full_name: 'Cathal', hourly_rate: null }

function day(over = {}) {
    const { entries = [], shifts = [], absences = [], people = [aoife, cathal], ...calls } = over
    const rows = people.map(person => personWeek({
        person, weekStart: WEEK, entries, absences, shifts,
        restaurantRate: 15,
        today: '2026-11-02',
    }))
    render(<TimesheetDay rows={rows} date={DAY} {...calls} />)
    return calls
}

const rostered = { id: 's1', employee_id: 'e1', shift_date: DAY, starts_at: '09:00:00', ends_at: '17:00:00' }
const worked = {
    id: 't1', employee_id: 'e1', work_date: DAY,
    starts_at: '09:01:22', ends_at: '17:33:16', kind: 'worked', source: 'import',
}

describe('the day, drawn the way the roster draws one', () => {
    it('lays out like the roster: staff, the hours across the top, hours on the right', () => {
        day()
        expect(screen.getByText('Staff')).toBeInTheDocument()
        expect(screen.getByText('Hours')).toBeInTheDocument()
    })

    it('puts everybody on it, worked or not', () => {
        day()
        expect(screen.getByText('Aoife')).toBeInTheDocument()
        expect(screen.getByText('Cathal')).toBeInTheDocument()
    })

    // His, 19 October 2026: it said 27/10/2026 and nothing said which day of
    // the week that was.
    it('names the day of the week in its heading', () => {
        day()
        expect(screen.getByText('Tuesday 27 October')).toBeInTheDocument()
    })
})

// His, 21 October 2026: a row is as tall as what it says.
describe('a row with no shift to draw', () => {
    const track = name => screen.getByText(name).closest('[style]').querySelector('[data-track]')
    const holiday = {
        id: 'a1', employee_id: 'e2', kind: 'holiday', starts_on: DAY, ends_on: DAY, status: 'approved',
    }

    it('is a short line for somebody with nothing that day, and none on a phone', () => {
        day({ shifts: [rostered] })
        expect(track('Cathal').className).toContain('min-h-9')
        expect(track('Cathal').className).toContain('hidden md:flex')
        expect(track('Aoife').className).toContain('h-24')
    })

    // On a phone the day off goes on the name line, with no band under it.
    it('is only as tall as a whole day off needs', () => {
        day({ shifts: [rostered], absences: [holiday] })
        expect(track('Cathal').className).toContain('min-h-9')
        expect(track('Cathal').className).toContain('hidden md:flex')
        const onTheLine = screen.getAllByText(/Holiday/i).find(el => el.className.includes('md:hidden'))
        expect(onTheLine).toBeTruthy()
    })

    it('keeps a comment in the row, so a long one makes it taller', () => {
        const note = { id: 't9', employee_id: 'e2', work_date: DAY, starts_at: null, ends_at: null, note: 'Came in to help with the delivery', kind: 'worked', source: 'manual' }
        day({ entries: [note] })
        expect(track('Cathal').className).toContain('min-h-9')
        const said = screen.getAllByText(/Came in to help/)
        expect(said.some(el => el.parentElement.className.includes('relative'))).toBe(true)
        expect(said.some(el => el.className.includes('md:hidden'))).toBe(true)
    })
})

// The shorter day All days stacks seven of.
describe('the shorter day, for All days', () => {
    it('lists only the people rostered, clocked in or off that day', () => {
        day({ shifts: [rostered], compact: true, legend: false })
        expect(screen.getByText('Aoife')).toBeInTheDocument()
        expect(screen.queryByText('Cathal')).toBeNull()
    })

    it('says so when nobody was in, and leaves the legend to the page', () => {
        day({ compact: true, legend: false })
        expect(screen.getByText('Nobody was rostered or clocked in.')).toBeInTheDocument()
        expect(screen.queryByText('what they were rostered for')).toBeNull()
    })

    // His pick of 20 October 2026: in All days the day's name opens the
    // green band, larger, rather than the Day view's small line.
    it('can name the day in the green band instead of a line', () => {
        day({ shifts: [rostered], compact: true, heading: 'band' })
        expect(screen.getAllByText('Tuesday 27 October')).toHaveLength(1)
        expect(screen.getByText('Tuesday 27 October').className).toContain('font-serif')
    })

    // The same hours across the top on every day, handed down.
    it('draws the hours it is given', () => {
        day({ shifts: [rostered], compact: true, range: { from: 6 * 60, to: 22 * 60 } })
        expect(screen.getByText('06:00')).toBeInTheDocument()
        expect(screen.getByText('22:00')).toBeInTheDocument()
    })
})

describe('the two blocks, which is what this view is for', () => {
    it('draws what they were rostered for', () => {
        day({ shifts: [rostered] })
        expect(screen.getByText('09:00 to 17:00')).toBeInTheDocument()
        expect(screen.getByTitle('Rostered 09:00 to 17:00')).toBeInTheDocument()
    })

    it('draws what the clock registered, to the second in its title', () => {
        day({ shifts: [rostered], entries: [worked] })
        expect(screen.getByText('09:01 to 17:33')).toBeInTheDocument()
        expect(screen.getByTitle('09:01:22 to 17:33:16. Press to type it exactly.')).toBeInTheDocument()
    })

    it('shows both at once, so the difference is the thing you see', () => {
        day({ shifts: [rostered], entries: [worked] })
        expect(screen.getByText('09:00 to 17:00')).toBeInTheDocument()
        expect(screen.getByText('09:01 to 17:33')).toBeInTheDocument()
    })
})

describe('somebody who worked a day nobody planned', () => {
    // His. There is no hollow block to compare against, so the row says so
    // rather than leaving a solid block sitting on its own looking normal.
    const only = () => ({ entries: [worked] })

    it('still draws the block', () => {
        day(only())
        expect(screen.getByText('09:01 to 17:33')).toBeInTheDocument()
    })

    it('says there is nothing to compare it with', () => {
        day(only())
        expect(screen.getAllByText(/not rostered/).length).toBeGreaterThan(0)
    })

    it('draws no rostered block at all', () => {
        day(only())
        expect(screen.queryByTitle(/^Rostered/)).not.toBeInTheDocument()
    })

    it('still counts the hours', () => {
        day(only())
        expect(screen.getByText('8.53')).toBeInTheDocument()
    })
})

describe('the other way round', () => {
    it('leaves a hollow block with nothing in it when nobody clocked in', () => {
        day({ shifts: [rostered] })
        expect(screen.getByTitle('Rostered 09:00 to 17:00')).toBeInTheDocument()
        expect(screen.getByText('nothing registered')).toBeInTheDocument()
    })
})

describe('a day off', () => {
    it('is drawn across the row in the roster’s own colour', () => {
        day({
            absences: [{
                id: 'a1', employee_id: 'e1', kind: 'holiday', status: 'approved',
                starts_on: DAY, ends_on: DAY, hours: 8,
            }],
        })
        // Once across the track for a computer, once on the name line for
        // a phone.
        expect(screen.getAllByText(/Holiday/)).toHaveLength(2)
        expect(screen.getByText('8.00')).toBeInTheDocument()
    })

    // Part of a day is not a day gone, so nothing is drawn across the row and
    // the times are still expected.
    it('is not drawn for part of a day', () => {
        day({
            shifts: [rostered],
            absences: [{
                id: 'a2', employee_id: 'e1', kind: 'day_off', status: 'approved',
                starts_on: DAY, ends_on: DAY, can_work_to: '15:00:00',
            }],
        })
        expect(screen.queryByText(/Day off/)).not.toBeInTheDocument()
        expect(screen.getByText('nothing registered')).toBeInTheDocument()
    })
})

describe('the legend', () => {
    // He asked what the colour rule was, which is the question a legend is
    // there to stop being asked. So it says the rule rather than naming the
    // colours: green agrees with the plan, orange does not, and by how much is
    // written on the block itself.
    it('says what the colours mean', () => {
        day()
        expect(screen.getByText('what they were rostered for')).toBeInTheDocument()
        expect(screen.getByText('within 60 minutes of the roster')).toBeInTheDocument()
        expect(screen.getByText(/more than 60 minutes off the roster/)).toBeInTheDocument()
    })
})


describe('correcting a clock time from the day view', () => {
    // Pressing anything on the row opens the same dialog the grid opens, where
    // a time is typed to the second. Dragging is the quick way, typing is the
    // exact way, and both of them are here on purpose.
    it('opens the day when the registered block is pressed', async () => {
        const onOpenDay = vi.fn()
        day({ shifts: [rostered], entries: [worked], onOpenDay })

        await userEvent.click(screen.getByText('09:01 to 17:33'))
        expect(onOpenDay).toHaveBeenCalledWith(aoife, expect.objectContaining({ date: DAY }))
    })

    it('opens it from the rostered block too, which is the empty row', async () => {
        const onOpenDay = vi.fn()
        day({ shifts: [rostered], onOpenDay })

        await userEvent.click(screen.getByText('09:00 to 17:00'))
        expect(onOpenDay).toHaveBeenCalledWith(aoife, expect.objectContaining({ date: DAY }))
    })

    // The interaction he warned about, because the roster's version of it took
    // three goes. A drag that finishes over the block fires a click on the
    // block, so without the guard every correction would also open the dialog.
    function drag(handle, toX) {
        const track = handle.closest('[data-track]')
        track.getBoundingClientRect = () => ({ left: 0, width: 1000, top: 0, right: 1000, bottom: 0, height: 0 })
        fireEvent.pointerDown(handle, { pointerType: 'mouse', clientX: 0 })
        fireEvent.pointerMove(window, { clientX: toX })
        fireEvent.pointerUp(window)
    }

    const handles = () => Array.from(document.querySelectorAll('.cursor-ew-resize'))

    it('hands back the times the ends were dragged to', () => {
        const onCorrect = vi.fn()
        const onOpenDay = vi.fn()
        // The grid runs 07:00 to 23:00, which is what timelineRange gives with
        // no opening hours, so half way along a thousand pixels is three.
        day({ shifts: [rostered], entries: [worked], onCorrect, onOpenDay })

        drag(handles()[0], 500)
        // The click the browser sends after a drag that finished over the
        // block. This is the one that took the roster three goes: it lands on
        // the block, not on the handle, so stopping it there does nothing.
        fireEvent.click(screen.getByText('09:01 to 17:33'))
        expect(onOpenDay).not.toHaveBeenCalled()
        expect(onCorrect).toHaveBeenCalledTimes(1)
        const [person, cell, entry, startsAt, endsAt] = onCorrect.mock.calls[0]
        expect(person).toBe(aoife)
        expect(cell.date).toBe(DAY)
        expect(entry.id).toBe('t1')
        expect(endsAt).toBe('17:33')
        expect(startsAt).toBe('15:00')
    })

    it('says nothing when an end is pressed and let go without moving', () => {
        const onCorrect = vi.fn()
        day({ shifts: [rostered], entries: [worked], onCorrect })

        const handle = handles()[0]
        const track = handle.closest('[data-track]')
        track.getBoundingClientRect = () => ({ left: 0, width: 1000, top: 0, right: 1000, bottom: 0, height: 0 })
        fireEvent.pointerDown(handle, { pointerType: 'mouse', clientX: 0 })
        fireEvent.pointerUp(window)

        expect(onCorrect).not.toHaveBeenCalled()
    })

    // A finger is not a mouse. On a phone a press is a tap, which opens the
    // day, and a drag there would fight the grid trying to scroll.
    it('does not drag on a touch', () => {
        const onCorrect = vi.fn()
        day({ shifts: [rostered], entries: [worked], onCorrect })

        const handle = handles()[0]
        fireEvent.pointerDown(handle, { pointerType: 'touch', clientX: 0 })
        fireEvent.pointerMove(window, { clientX: 500 })
        fireEvent.pointerUp(window)

        expect(onCorrect).not.toHaveBeenCalled()
    })
})

// His pick of 21 October 2026: a bar too narrow for its words has them
// written out under the bars. The test browser draws nothing, so the measure
// is faked: anything longer than ten characters is too wide for its bar.
describe('a bar too narrow for its words', () => {
    let widths
    beforeEach(() => {
        widths = {
            scroll: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth'),
            client: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth'),
        }
        Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get() { return this.textContent.length > 10 ? 200 : 10 } })
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 50 } })
        vi.stubGlobal('ResizeObserver', class { constructor(seen) { this.seen = seen } observe() { this.seen() } disconnect() {} })
    })
    afterEach(() => {
        for (const [key, name] of [['scroll', 'scrollWidth'], ['client', 'clientWidth']]) {
            if (widths[key]) Object.defineProperty(HTMLElement.prototype, name, widths[key])
            else delete HTMLElement.prototype[name]
        }
        vi.unstubAllGlobals()
    })

    it('writes the rostered and clocked times out under the bars', () => {
        day({ shifts: [rostered], entries: [worked] })
        expect(screen.getByText('Rostered 09:00 to 17:00')).toBeInTheDocument()
        const under = screen.getAllByText('09:01 to 17:33').find(el => el.tagName === 'B')
        expect(under.parentElement.textContent).toContain('out +33 min')
        // Still in the bar, hidden, so the next measure sees how wide it is.
        expect(screen.getAllByText('09:01 to 17:33').find(el => el.tagName === 'SPAN').className).toContain('invisible')
    })
})

describe('how far off the plan it was', () => {
    // 21 October 2026: Majo's split shift, with the rows handed back evening
    // first. Each half is set against its own plan, not the other one.
    it('sets each half of a split shift against its own plan, whatever order the rows came in', () => {
        day({
            shifts: [
                { id: 's2', employee_id: 'e1', shift_date: DAY, starts_at: '17:30:00', ends_at: '21:30:00' },
                { id: 's1', employee_id: 'e1', shift_date: DAY, starts_at: '09:00:00', ends_at: '13:00:00' },
            ],
            entries: [
                { ...worked, id: 't2', starts_at: '16:58:00', ends_at: '22:32:00' },
                { ...worked, id: 't1', starts_at: '08:57:00', ends_at: '13:00:00' },
            ],
        })
        expect(screen.getByText(/in −3 min/)).toBeInTheDocument()
        expect(screen.queryByText(/513/)).toBeNull()
    })

    // Rostered 09:00 to 17:00, clocked 09:01:22 to 17:33:16. A minute late in
    // and thirty-three past the end, so the end is what gets named.
    it('writes the difference on the block, signed, and says which end', () => {
        day({ shifts: [rostered], entries: [worked] })
        expect(screen.getByText(/out \+33 min/)).toBeInTheDocument()
    })

    // His, on 21 September. A shift moved wholesale runs for exactly as long
    // as the plan, so a rule that only compared lengths had nothing to say
    // about a day that started and finished three hours out.
    it('sees a shift that moved even though it ran the same length', () => {
        day({
            shifts: [rostered],
            entries: [{ ...worked, starts_at: '12:00:00', ends_at: '20:00:00' }],
        })
        expect(screen.getByText(/in \+180 min/)).toBeInTheDocument()
    })

    // Twice: under the name, and on the block itself, which is where somebody
    // reading the row is actually looking.
    it('says not rostered where there is no plan to be apart from', () => {
        day({ entries: [worked] })
        expect(screen.getAllByText(/not rostered/).length).toBeGreaterThan(1)
    })

    // His, on 21 September. A trial is never on the roster, so having no plan
    // behind it is not a thing to warn about. The day view showed nothing at
    // all about the kind, so it looked exactly like a shift somebody forgot.
    // The legend carries the words too, so what is counted is how many times
    // they appear: one is the legend alone, which is the row saying nothing.
    it('calls an unrostered trial a trial rather than a warning', () => {
        day({ entries: [{ ...worked, kind: 'trial' }] })
        expect(screen.getByText(/· trial/)).toBeInTheDocument()
        expect(screen.getAllByText(/not rostered/)).toHaveLength(1)
    })

    it('still warns about a worked day nobody rostered', () => {
        day({ entries: [worked] })
        expect(screen.getAllByText(/not rostered/).length).toBeGreaterThan(1)
    })

    it('shows a comment written on a day with no times', () => {
        day({
            shifts: [rostered],
            entries: [{ id: 't2', employee_id: 'e1', work_date: DAY, starts_at: null, ends_at: null, kind: 'worked', note: 'swapped with somebody' }],
        })
        expect(screen.getByText('“swapped with somebody”')).toBeInTheDocument()
    })
})
