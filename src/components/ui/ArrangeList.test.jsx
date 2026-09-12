// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ArrangeList from './ArrangeList'

const items = [
    { id: 'a', name: 'Burritos' },
    { id: 'b', name: 'Rice Bowls' },
    { id: 'c', name: 'Tacos' },
]

// Each row reads "1 Burritos up down", so the position and the two arrow
// glyphs come off before comparing.
const names = () => screen.getAllByRole('listitem').map(li =>
    li.textContent.replace(/^\d+/, '').replace(/[^\w\s]/g, '').trim())

describe('ArrangeList', () => {
    it('lists what it was given, in the order it was given', () => {
        render(<ArrangeList items={items} onSave={() => {}} onClose={() => {}} />)

        expect(names()).toEqual(['Burritos', 'Rice Bowls', 'Tacos'])
    })

    it('moves a row up', async () => {
        render(<ArrangeList items={items} onSave={() => {}} onClose={() => {}} />)

        await userEvent.click(screen.getByRole('button', { name: 'Move Tacos up' }))
        expect(names()).toEqual(['Burritos', 'Tacos', 'Rice Bowls'])
    })

    it('moves a row down', async () => {
        render(<ArrangeList items={items} onSave={() => {}} onClose={() => {}} />)

        await userEvent.click(screen.getByRole('button', { name: 'Move Burritos down' }))
        expect(names()).toEqual(['Rice Bowls', 'Burritos', 'Tacos'])
    })

    it('will not move the first one up or the last one down', () => {
        render(<ArrangeList items={items} onSave={() => {}} onClose={() => {}} />)

        expect(screen.getByRole('button', { name: 'Move Burritos up' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Move Tacos down' })).toBeDisabled()
    })

    // The whole order, renumbered, not the two rows that swapped. Saving a swap
    // leaves anything that was never arranged sharing a number with something
    // else.
    it('saves the whole order, not the change', async () => {
        const onSave = vi.fn(() => Promise.resolve())
        render(<ArrangeList items={items} onSave={onSave} onClose={() => {}} />)

        await userEvent.click(screen.getByRole('button', { name: 'Move Tacos up' }))
        await userEvent.click(screen.getByRole('button', { name: /save/i }))

        expect(onSave).toHaveBeenCalledOnce()
        expect(onSave.mock.calls[0][0].map(i => i.id)).toEqual(['a', 'c', 'b'])
    })

    it('changes nothing until it is saved', async () => {
        const onSave = vi.fn()
        const onClose = vi.fn()
        render(<ArrangeList items={items} onSave={onSave} onClose={onClose} />)

        await userEvent.click(screen.getByRole('button', { name: 'Move Tacos up' }))
        await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

        expect(onSave).not.toHaveBeenCalled()
        expect(onClose).toHaveBeenCalled()
    })

    it('says so when there is nothing to arrange', () => {
        render(<ArrangeList items={[]} emptyText="No categories yet." onSave={() => {}} onClose={() => {}} />)

        expect(screen.getByText('No categories yet.')).toBeInTheDocument()
    })

    it('takes a different way of naming a row', () => {
        const people = [{ id: '1', full_name: 'Georgiana' }, { id: '2', full_name: 'Majo' }]
        render(<ArrangeList items={people} nameOf={p => p.full_name} onSave={() => {}} onClose={() => {}} />)

        expect(screen.getByText('Georgiana')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Move Majo up' })).toBeInTheDocument()
    })
})
