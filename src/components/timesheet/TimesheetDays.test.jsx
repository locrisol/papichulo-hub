// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { personWeek } from '@/lib/timesheet'
import { weekDates } from '@/lib/dates'
import TimesheetDays from '@/components/timesheet/TimesheetDays'
import TimesheetPhone from '@/components/timesheet/TimesheetPhone'

// The whole week as seven days at once, and the phone's week, which had its
// days one box out of line (his, 19 October 2026).

const WEEK = '2026-10-25'
const dates = weekDates(WEEK)
const aoife = { id: 'e1', full_name: 'Aoife', hourly_rate: 16.5 }
const cathal = { id: 'e2', full_name: 'Cathal', hourly_rate: null }

const shifts = [
    { id: 's1', employee_id: 'e1', shift_date: '2026-10-26', starts_at: '09:00:00', ends_at: '17:00:00' },
    { id: 's2', employee_id: 'e2', shift_date: '2026-10-31', starts_at: '12:00:00', ends_at: '22:00:00' },
]
const entries = [{
    id: 't1', employee_id: 'e1', work_date: '2026-10-26',
    starts_at: '09:01:22', ends_at: '17:33:16', kind: 'worked', source: 'import',
}]

const weekRows = () => [aoife, cathal].map(person => personWeek({
    person, weekStart: WEEK, entries, absences: [], shifts, restaurantRate: 15, today: '2026-11-02',
}))

describe('all days', () => {
    it('heads each of the seven days with its name', () => {
        render(<TimesheetDays rows={weekRows()} dates={dates} />)
        for (const heading of ['Sunday 25 October', 'Monday 26 October', 'Saturday 31 October']) {
            expect(screen.getByText(heading)).toBeInTheDocument()
        }
    })

    it('puts on each day only the people who were in it', () => {
        render(<TimesheetDays rows={weekRows()} dates={dates} />)
        const monday = screen.getByText('Monday 26 October').closest('section')
        expect(within(monday).getByText('Aoife')).toBeInTheDocument()
        expect(within(monday).queryByText('Cathal')).toBeNull()
        const sunday = screen.getByText('Sunday 25 October').closest('section')
        expect(within(sunday).getByText('Nobody was rostered or clocked in.')).toBeInTheDocument()
    })

    // One scale for the week: Cathal's 22:00 finish on Saturday stretches
    // Monday's hours too, so the days line up under each other.
    it('gives every day the same hours across the top', () => {
        render(<TimesheetDays rows={weekRows()} dates={dates} />)
        const monday = screen.getByText('Monday 26 October').closest('section')
        expect(within(monday).getAllByText('23:00').length).toBeGreaterThan(0)
    })

    // His pick of 20 October 2026: a card a day, the name in its green band.
    it('puts each day in a card of its own, named in its band', () => {
        render(<TimesheetDays rows={weekRows()} dates={dates} />)
        const sections = document.querySelectorAll('section')
        expect(sections).toHaveLength(7)
        expect(screen.getByText('Monday 26 October').className).toContain('font-serif')
    })

    it('says what the colours mean once, not seven times', () => {
        render(<TimesheetDays rows={weekRows()} dates={dates} />)
        expect(screen.getAllByText('what they were rostered for')).toHaveLength(1)
    })

    it('jumps down to a day from the strip', async () => {
        const scrolled = vi.fn()
        Element.prototype.scrollIntoView = scrolled
        render(<TimesheetDays rows={weekRows()} dates={dates} />)
        await userEvent.click(screen.getByRole('button', { name: 'Saturday 31 October' }))
        expect(scrolled).toHaveBeenCalled()
        expect(scrolled.mock.contexts[0].id).toBe('timesheet-day-2026-10-31')
    })

    it('opens a day when a block is pressed, the same as the Day view', async () => {
        const onOpenDay = vi.fn()
        render(<TimesheetDays rows={weekRows()} dates={dates} onOpenDay={onOpenDay} />)
        await userEvent.click(screen.getByText('09:01 to 17:33'))
        expect(onOpenDay).toHaveBeenCalledWith(aoife, expect.objectContaining({ date: '2026-10-26' }))
    })
})

describe('the week on a phone', () => {
    it('heads the boxes with two letters and the date', () => {
        const { container } = render(<TimesheetPhone rows={weekRows()} dates={dates} onOpenDay={() => {}} />)
        const heading = container.querySelector('[aria-hidden="true"]')
        expect(heading.textContent).toBe('Su25Mo26Tu27We28Th29Fr30Sa31')
    })

    it('names the whole day on each box for a screen reader', () => {
        render(<TimesheetPhone rows={weekRows()} dates={dates} onOpenDay={() => {}} />)
        expect(screen.getAllByRole('button', { name: /^Monday 26 October, 8\.53 hours$/ })).toHaveLength(1)
    })
})
