// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TimeField from './TimeField'

// It replaced every input type="time" in the app, so it is the only way anybody
// picks a time now. The list logic has its own tests in lib/timeOptions; these
// are about the control on the screen.
describe('TimeField', () => {
    it('offers quarter hours and nothing in between', () => {
        render(<TimeField value="09:00" onChange={() => {}} aria-label="Opens" />)

        const options = [...screen.getByLabelText('Opens').options].map(o => o.value)
        expect(options).toContain('09:15')
        expect(options).toContain('09:30')
        expect(options).toContain('09:45')
        expect(options).not.toContain('09:07')
    })

    it('hands back what was picked', async () => {
        const onChange = vi.fn()
        render(<TimeField value="09:00" onChange={onChange} aria-label="Opens" />)

        await userEvent.selectOptions(screen.getByLabelText('Opens'), '15:30')
        expect(onChange).toHaveBeenCalledWith('15:30')
    })

    // The one that matters for pay. A select with no option matching its value
    // shows the first one instead, so a time somebody typed before the list
    // existed would silently become the opening time the moment the box was
    // drawn.
    it('keeps a saved time that is not on the quarter hour', () => {
        render(<TimeField value="09:07" onChange={() => {}} aria-label="Opens" />)

        const select = screen.getByLabelText('Opens')
        expect(select.value).toBe('09:07')
        expect([...select.options].map(o => o.value)).toContain('09:07')
    })

    it('offers the blank only while nothing is chosen', () => {
        const { rerender } = render(<TimeField value="" onChange={() => {}} aria-label="Opens" />)
        expect(screen.getByLabelText('Opens').options[0].value).toBe('')

        rerender(<TimeField value="09:00" onChange={() => {}} aria-label="Opens" />)
        expect([...screen.getByLabelText('Opens').options].map(o => o.value)).not.toContain('')
    })

    // Leaving it empty is itself an answer on a time off request: it means
    // from opening. Taking the blank away once a time is picked would make
    // that state unreachable.
    it('keeps the blank when empty is a real answer', () => {
        render(<TimeField value="09:00" onChange={() => {}} allowEmpty aria-label="From" />)

        expect([...screen.getByLabelText('From').options].map(o => o.value)).toContain('')
    })

    it('starts the list before opening time, so an early start is near the top', () => {
        render(<TimeField value="" onChange={() => {}} dayStart="10:00" aria-label="Opens" />)

        const values = [...screen.getByLabelText('Opens').options].map(o => o.value).filter(Boolean)
        expect(values[0]).toBe('08:00')
        expect(values.indexOf('10:00')).toBe(8)
    })

    it('can offer the end of the day', () => {
        render(<TimeField value="" onChange={() => {}} endOfDay aria-label="Closes" />)

        expect([...screen.getByLabelText('Closes').options].map(o => o.value)).toContain('24:00')
    })
})
