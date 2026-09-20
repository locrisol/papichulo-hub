// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { personWeek } from '@/lib/timesheet'
import TimesheetDay from '@/components/timesheet/TimesheetDay'

const WEEK = '2026-10-25'
const DAY = '2026-10-27'          // Tuesday, an ordinary day

const aoife = { id: 'e1', full_name: 'Aoife', hourly_rate: 16.5 }
const cathal = { id: 'e2', full_name: 'Cathal', hourly_rate: null }

function day(over = {}) {
    const { entries = [], shifts = [], absences = [], people = [aoife, cathal] } = over
    const rows = people.map(person => personWeek({
        person, weekStart: WEEK, entries, absences, shifts,
        restaurantRate: 15,
    }))
    return render(<TimesheetDay rows={rows} date={DAY} />)
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
})

describe('the two blocks, which is what this view is for', () => {
    it('draws what they were rostered for', () => {
        day({ shifts: [rostered] })
        expect(screen.getByText('09:00 - 17:00')).toBeInTheDocument()
        expect(screen.getByTitle('Rostered 09:00 to 17:00')).toBeInTheDocument()
    })

    it('draws what the clock registered, to the second in its title', () => {
        day({ shifts: [rostered], entries: [worked] })
        expect(screen.getByText('09:01 - 17:33')).toBeInTheDocument()
        expect(screen.getByTitle('09:01:22 to 17:33:16')).toBeInTheDocument()
    })

    it('shows both at once, so the difference is the thing you see', () => {
        day({ shifts: [rostered], entries: [worked] })
        expect(screen.getByText('09:00 - 17:00')).toBeInTheDocument()
        expect(screen.getByText('09:01 - 17:33')).toBeInTheDocument()
    })
})

describe('somebody who worked a day nobody planned', () => {
    // His. There is no hollow block to compare against, so the row says so
    // rather than leaving a solid block sitting on its own looking normal.
    const only = () => ({ entries: [worked] })

    it('still draws the block', () => {
        day(only())
        expect(screen.getByText('09:01 - 17:33')).toBeInTheDocument()
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
        expect(screen.getByText(/Holiday/)).toBeInTheDocument()
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
    it('names the three things on the grid', () => {
        day()
        expect(screen.getByText('what they were rostered for')).toBeInTheDocument()
        expect(screen.getByText('what the clock registered')).toBeInTheDocument()
        expect(screen.getByText('ran longer than it was meant to')).toBeInTheDocument()
    })
})
