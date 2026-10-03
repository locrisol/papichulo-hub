// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DateStepper from './DateStepper'

// A screen that only opens so many weeks says so on the arrow, rather than
// letting it be pressed into a week it then cannot show.
describe('DateStepper at the edge of what a screen opens', () => {
    it('turns off the arrow that would go past it', () => {
        const back = vi.fn()
        const next = vi.fn()
        render(
            <DateStepper onBack={back} onNext={next} backLabel="Previous week" nextLabel="Next week" backDisabled>
                <span>27 Sept to 3 Oct</span>
            </DateStepper>,
        )
        fireEvent.click(screen.getByRole('button', { name: 'Previous week' }))
        fireEvent.click(screen.getByRole('button', { name: 'Next week' }))
        expect(screen.getByRole('button', { name: 'Previous week' })).toBeDisabled()
        expect(back).not.toHaveBeenCalled()
        expect(next).toHaveBeenCalledTimes(1)
    })
})

// Six screens wrote the week out themselves, two ways in two weights.
describe('DateStepper given the week', () => {
    it('writes the week itself, Monday to Sunday', () => {
        render(<DateStepper onBack={() => {}} onNext={() => {}} weekStart="2026-08-31" />)
        const week = screen.getByText('31 Aug to 6 Sept')
        expect(week.className).toContain('font-semibold')
        expect(week.className).toContain('whitespace-nowrap')
    })

    it('leaves the middle to the screen when it brings its own', () => {
        render(
            <DateStepper onBack={() => {}} onNext={() => {}} weekStart="2026-08-31">
                <span>Week 36</span>
            </DateStepper>,
        )
        expect(screen.getByText('Week 36')).toBeInTheDocument()
        expect(screen.queryByText('31 Aug to 6 Sept')).toBeNull()
    })
})
