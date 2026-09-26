// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { paperworkFor } from '@/lib/reportPeople'
import ReportPaperwork from '@/components/reports/ReportPaperwork'

const WEEK = '2026-09-13'
const MONDAY_AFTER = '2026-09-21'

const team = [
    { id: 'a', full_name: 'Ana', food_safety_expires: '2028-01-01', work_permission: 'unrestricted' },
    { id: 's', full_name: 'Sam', work_permission: 'unrestricted' },
    { id: 't', full_name: 'Tom', on_trial: true, work_permission: 'stamp2', work_permission_expires: '2027-01-01' },
    {
        id: 'k', full_name: 'Kim', food_safety_expires: '2028-01-01', work_permission: 'stamp2',
        work_permission_expires: '2026-09-01', permission_renewal_applied: '2026-08-20',
    },
    // One trial shift on the Thursday, gone the same day.
    {
        id: 'l', full_name: 'Lee', on_trial: true, started_on: '2026-09-17', ended_on: '2026-09-17',
        work_permission: 'stamp2',
    },
]

function draw(people = team) {
    render(<ReportPaperwork paperwork={paperworkFor(people, WEEK, MONDAY_AFTER)} weekStart={WEEK} asOf={MONDAY_AFTER} />)
}

describe('ReportPaperwork', () => {
    it('names who has nothing on file, and says who is on trial', () => {
        draw()
        expect(screen.getByText('Food safety: 2 of 4 in date.')).toBeTruthy()
        expect(screen.getByText('Sam')).toBeTruthy()
        expect(screen.getByText('Tom (on trial)')).toBeTruthy()
    })

    it('leaves out somebody who has left', () => {
        draw()
        expect(screen.queryByText(/Lee/)).toBeNull()
        expect(screen.getByText(/^4 on the books/)).toBeTruthy()
    })

    it('says whether a renewal was applied for, under the right to work only', () => {
        draw()
        expect(screen.getByText('Right to work: 3 of 4 in date.')).toBeTruthy()
        expect(screen.getByText('Kim')).toBeTruthy()
        expect(screen.getByText('Renewal applied for 20 Aug')).toBeTruthy()
    })

    it('says one line when everything is in date', () => {
        draw([team[0]])
        expect(screen.getByText('Food safety: all 1 in date.')).toBeTruthy()
        expect(screen.queryByText('Nothing on file:')).toBeNull()
    })

    it('says so when nobody was on the books', () => {
        draw([team[4]])
        expect(screen.getByText(/Nobody was on the books this week/)).toBeTruthy()
    })
})
