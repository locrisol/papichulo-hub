// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ShiftRequestDialog from './ShiftRequestDialog'

// Asking somebody to take a shift, off your own shift in My shifts.

const WED = '2026-09-30'
const THU = '2026-10-01'
const FRI = '2026-10-02'

const shift = (id, employee_id, shift_date, starts_at, ends_at) => ({
    id, employee_id, shift_date, starts_at, ends_at, break_minutes: 0,
})

const PEOPLE = [
    { id: 'ana', full_name: 'Ana Murphy' },
    { id: 'ben', full_name: 'Ben Walsh' },
    { id: 'cal', full_name: 'Cal Byrne' },
]

// Ana is giving her Wednesday evening. Ben and Cal are both off that day, and
// each has one shift later in the week that Ana could take back.
const ANA_WED = shift('s1', 'ana', WED, '17:00', '21:00')
const WEEK = [
    ANA_WED,
    shift('s3', 'ben', THU, '09:00', '17:00'),
    shift('s4', 'cal', FRI, '12:00', '18:00'),
]

function draw() {
    const onSend = vi.fn()
    render(
        <ShiftRequestDialog
            mine={ANA_WED}
            theirs={null}
            meId="ana"
            weekShifts={WEEK}
            employees={PEOPLE}
            absences={[]}
            dayNotes={[]}
            openingHours={null}
            breakRules={null}
            onSend={onSend}
            onClose={() => {}}
            saving={false}
        />,
    )
    return onSend
}

const send = () => fireEvent.click(screen.getByRole('button', { name: 'Send the ask' }))

describe('changing who to ask', () => {
    // Picking Ben, then his Thursday to take back, then changing to Cal kept
    // Ben's Thursday on the request. It went out naming a shift that was not
    // Cal's, and the database refuses that now.
    it('lets go of the last person\'s shift', () => {
        const onSend = draw()
        fireEvent.click(screen.getByRole('button', { name: /Ben Walsh/ }))
        fireEvent.click(screen.getByRole('button', { name: /09:00 to 17:00/ }))
        fireEvent.click(screen.getByRole('button', { name: /Cal Byrne/ }))
        send()

        expect(onSend).toHaveBeenCalledWith(expect.objectContaining({
            to_employee_id: 'cal', take_shift_id: null, take_from: null, take_to: null,
        }))
    })

    it('keeps the shift picked when it is the same person again', () => {
        const onSend = draw()
        fireEvent.click(screen.getByRole('button', { name: /Ben Walsh/ }))
        fireEvent.click(screen.getByRole('button', { name: /09:00 to 17:00/ }))
        fireEvent.click(screen.getByRole('button', { name: /Ben Walsh/ }))
        send()

        expect(onSend).toHaveBeenCalledWith(expect.objectContaining({
            to_employee_id: 'ben', take_shift_id: 's3',
        }))
    })
})

// Only the person asked can answer, so asking somebody with no account left
// the request waiting on them for good with nobody told.
describe('somebody with no account', () => {
    const people = PEOPLE.map(p => ({ ...p, has_login: p.id !== 'cal' }))

    it('is offered under Cannot, and cannot be picked', () => {
        const onSend = vi.fn()
        render(
            <ShiftRequestDialog
                mine={ANA_WED} theirs={null} meId="ana" weekShifts={WEEK} employees={people}
                absences={[]} dayNotes={[]} openingHours={null} breakRules={null}
                onSend={onSend} onClose={() => {}} saving={false}
            />,
        )
        const cal = screen.getByRole('button', { name: /Cal Byrne/ })
        expect(cal).toBeDisabled()
        expect(cal).toHaveTextContent('No account')
    })

    it('cannot be asked for their shift, and says to ask a manager', () => {
        const onSend = vi.fn()
        render(
            <ShiftRequestDialog
                mine={null} theirs={WEEK[2]} meId="ana" weekShifts={WEEK} employees={people}
                absences={[]} dayNotes={[]} openingHours={null} breakRules={null}
                onSend={onSend} onClose={() => {}} saving={false}
            />,
        )
        expect(screen.getByText('Cal Byrne does not have an account, so they cannot answer. Ask a manager instead.'))
            .toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Send the ask' })).toBeDisabled()
    })
})

// Part of a shift has to be part of it. Approving keeps whatever is either
// side of the hours named, so hours typed outside the shift became hours
// nobody had been rostered for.
describe('giving part of a shift', () => {
    const pick = (label, value) => fireEvent.change(screen.getAllByLabelText(label)[0], { target: { value } })

    it('will not send hours that run past the end of the shift', () => {
        const onSend = draw()
        fireEvent.click(screen.getByRole('button', { name: 'Part of it' }))
        pick('From', '19:00')
        pick('To', '23:00')
        fireEvent.click(screen.getByRole('button', { name: /Ben Walsh/ }))

        expect(screen.getByText('The hours you are giving must be within the shift.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Send the ask' })).toBeDisabled()
        send()
        expect(onSend).not.toHaveBeenCalled()
    })

    it('sends hours inside it', () => {
        const onSend = draw()
        fireEvent.click(screen.getByRole('button', { name: 'Part of it' }))
        pick('From', '19:00')
        pick('To', '21:00')
        fireEvent.click(screen.getByRole('button', { name: /Ben Walsh/ }))
        send()

        expect(onSend).toHaveBeenCalledWith(expect.objectContaining({
            give_from: '19:00', give_to: '21:00',
        }))
    })

    it('checks the hours asked for back the same way', () => {
        const onSend = draw()
        fireEvent.click(screen.getByRole('button', { name: /Ben Walsh/ }))
        fireEvent.click(screen.getByRole('button', { name: /09:00 to 17:00/ }))
        fireEvent.click(screen.getAllByRole('button', { name: 'Part of it' })[1])
        pick('From', '16:00')
        pick('To', '18:00')

        expect(screen.getByText('The hours you are asking for must be within the shift.')).toBeInTheDocument()
        send()
        expect(onSend).not.toHaveBeenCalled()
    })
})

// A send that failed is said inside the dialog, apart from the live hint
// about what is still missing, which is not a failure.
describe('a send that failed', () => {
    const drawWith = error => render(
        <ShiftRequestDialog
            mine={ANA_WED} theirs={null} meId="ana" weekShifts={WEEK} employees={PEOPLE}
            absences={[]} dayNotes={[]} openingHours={null} breakRules={null}
            onSend={() => {}} onClose={() => {}} saving={false} error={error}
        />,
    )

    it('shows the failure as an alert', () => {
        drawWith('Could not reach the server.')
        expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server.')
    })

    it('shows nothing when nothing failed, and the hint is not an alert', () => {
        drawWith('')
        expect(screen.getByText('Pick who you are asking.')).toBeInTheDocument()
        expect(screen.queryByRole('alert')).toBeNull()
    })
})
