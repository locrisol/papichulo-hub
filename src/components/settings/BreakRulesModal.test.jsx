// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const setActiveRestaurant = vi.fn()
const update = vi.fn()

vi.mock('@/lib/supabase', () => ({
    supabase: {
        from: () => ({
            update: (...args) => {
                update(...args)
                return {
                    eq: () => ({
                        select: () => ({
                            single: () => Promise.resolve({
                                data: { id: 'r1', break_rules: args[0].break_rules },
                                error: null,
                            }),
                        }),
                    }),
                }
            },
        }),
    },
}))

vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({
        activeRestaurant: {
            id: 'r1',
            break_rules: [
                { hours: 8, operator: 'gte', minutes: 60 },
                { hours: 6, operator: 'gte', minutes: 30 },
                { hours: 4.5, operator: 'gt', minutes: 15 },
            ],
        },
        setActiveRestaurant,
    }),
}))

const { default: BreakRulesModal } = await import('./BreakRulesModal')

const rungs = () => screen.getAllByRole('group', { name: /which shifts/i })

describe('BreakRulesModal', () => {
    beforeEach(() => {
        update.mockClear()
        setActiveRestaurant.mockClear()
    })

    it('shows the ladder that is saved, longest first', () => {
        render(<BreakRulesModal onClose={() => {}} />)

        expect(screen.getAllByLabelText('Hours').map(i => i.value)).toEqual(['8', '6', '4.5'])
        expect(screen.getAllByLabelText('Minutes').map(i => i.value)).toEqual(['60', '30', '15'])
    })

    // Both answers are on the screen rather than behind a dropdown, which is
    // the whole point of the switch: they differ only at the exact number and
    // that is the corner people get wrong.
    it('offers both operators on every rung, without opening anything', () => {
        render(<BreakRulesModal onClose={() => {}} />)

        for (const rung of rungs()) {
            expect(within(rung).getByRole('button', { name: 'At least' })).toBeInTheDocument()
            expect(within(rung).getByRole('button', { name: 'More than' })).toBeInTheDocument()
        }
    })

    it('says which operator each rung is on', () => {
        render(<BreakRulesModal onClose={() => {}} />)
        const all = rungs()

        expect(within(all[0]).getByRole('button', { name: 'At least' }))
            .toHaveAttribute('aria-pressed', 'true')
        expect(within(all[2]).getByRole('button', { name: 'More than' }))
            .toHaveAttribute('aria-pressed', 'true')
    })

    it('changes an operator when the other side is pressed', async () => {
        render(<BreakRulesModal onClose={() => {}} />)

        const first = rungs()[0]
        await userEvent.click(within(first).getByRole('button', { name: 'More than' }))

        expect(within(first).getByRole('button', { name: 'More than' }))
            .toHaveAttribute('aria-pressed', 'true')
        expect(within(first).getByRole('button', { name: 'At least' }))
            .toHaveAttribute('aria-pressed', 'false')
    })

    it('shows what the ladder gives a real shift', () => {
        render(<BreakRulesModal onClose={() => {}} />)
        expect(screen.getByText('What that gives')).toBeInTheDocument()
    })

    it('adds and removes a rung', async () => {
        render(<BreakRulesModal onClose={() => {}} />)
        expect(rungs()).toHaveLength(3)

        await userEvent.click(screen.getByRole('button', { name: /add a rung/i }))
        expect(rungs()).toHaveLength(4)

        await userEvent.click(screen.getAllByRole('button', { name: 'Remove this rung' })[0])
        expect(rungs()).toHaveLength(3)
    })

    // A ladder with two rungs saying the same thing has one that can never be
    // reached, and an empty one gives everybody nothing.
    it('will not save a ladder with no rungs', async () => {
        render(<BreakRulesModal onClose={() => {}} />)

        for (const box of screen.getAllByLabelText('Hours')) await userEvent.clear(box)

        expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
        expect(screen.getByText(/at least one rung/i)).toBeInTheDocument()
    })

    it('will not save two rungs that say the same thing', async () => {
        render(<BreakRulesModal onClose={() => {}} />)

        const hours = screen.getAllByLabelText('Hours')
        await userEvent.clear(hours[1])
        await userEvent.type(hours[1], '8')

        expect(screen.getByText(/never be reached/i)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
    })

    it('saves the ladder sorted longest first, whatever order it was typed', async () => {
        const onClose = vi.fn()
        render(<BreakRulesModal onClose={onClose} />)

        const hours = screen.getAllByLabelText('Hours')
        await userEvent.clear(hours[0])
        await userEvent.type(hours[0], '5')

        await userEvent.click(screen.getByRole('button', { name: /^save$/i }))

        expect(update).toHaveBeenCalledOnce()
        expect(update.mock.calls[0][0].break_rules.map(r => r.hours)).toEqual([6, 5, 4.5])
    })
})
