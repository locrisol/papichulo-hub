// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/components/reports/useRemoveCard', () => ({ useRemoveCard: () => vi.fn() }))
import ReportActions, { ActionComments } from './ReportActions'
import { carriedItems } from '@/lib/weeklyReport'

// His, 7 October: comments on each action, carried with it.

const WEEK = '2026-10-04'
const action = comments => ({ id: 'a1', kind: 'action', label: 'Extractor fan', opened_on: '2026-09-06', meta: { comments } })
const earlier = { id: 'c1', on: '2026-09-08', week: '2026-09-06', text: 'Engineer <b>booked</b>' }

describe('comments on an action', () => {
    it('adds one with its day, formatted, kept with the action', () => {
        const onSave = vi.fn()
        render(<ActionComments item={action([earlier])} weekStart={WEEK} canEdit onSave={onSave} />)
        fireEvent.click(screen.getByRole('button', { name: '+ Comment' }))
        const box = screen.getByRole('textbox', { name: 'Add a comment on this action' })
        box.innerHTML = 'Still <b>noisy</b>'
        fireEvent.input(box)
        fireEvent.blur(box)
        const [id, patch] = onSave.mock.calls[0]
        expect(id).toBe('a1')
        expect(patch.meta.comments).toHaveLength(2)
        expect(patch.meta.comments[1]).toMatchObject({ week: WEEK, text: 'Still <b>noisy</b>' })
    })

    // It went out on that week's report.
    it('keeps an earlier week\'s as it was written', () => {
        render(<ActionComments item={action([earlier])} weekStart={WEEK} canEdit onSave={vi.fn()} />)
        expect(screen.getByText('booked').tagName).toBe('STRONG')
        expect(screen.queryByRole('button', { name: 'Remove this comment' })).not.toBeInTheDocument()
    })

    it('goes with the action into next week', () => {
        const [next] = carriedItems([action([earlier])], '2026-10-11')
        expect(next.meta.comments).toEqual([earlier])
    })
})

// The edit saved on leaving the box, then the remove pressed straight after.
describe('two changes to the comments one after the other', () => {
    it('keeps both', () => {
        const onSave = vi.fn()
        const a = { id: 'a', on: '2026-10-05', week: WEEK, text: 'one' }
        const b = { id: 'b', on: '2026-10-05', week: WEEK, text: 'two' }
        render(<ActionComments item={action([a, b])} weekStart={WEEK} canEdit onSave={onSave} />)
        const [first] = screen.getAllByRole('textbox', { name: 'Comment on this action' })
        first.innerHTML = 'one, edited'
        fireEvent.input(first)
        fireEvent.blur(first)
        fireEvent.click(screen.getAllByRole('button', { name: 'Remove this comment' })[1])
        const last = onSave.mock.calls[onSave.mock.calls.length - 1][1].meta.comments
        expect(last).toEqual([{ ...a, text: 'one, edited' }])
    })

    it('ignores comments stored as something other than a list', () => {
        render(<ActionComments item={{ id: 'x', meta: { comments: 'oops' } }} weekStart={WEEK} canEdit onSave={vi.fn()} />)
        expect(screen.getByRole('button', { name: '+ Comment' })).toBeInTheDocument()
    })
})

// His, 7 October: the words looked fixed, so nobody knew they could be changed.
describe('changing what an action says', () => {
    const section = { items: [{ id: 'a1', kind: 'action', label: 'Find coloured bowls', opened_on: '2026-09-27' }] }
    const draw = (props = {}) => {
        const handlers = { onAdd: vi.fn(), onSave: vi.fn(), onRemove: vi.fn() }
        render(<ReportActions section={section} weekStart={WEEK} canEdit {...handlers} {...props} />)
        return handlers
    }

    it('opens from its Edit button and saves on Enter', () => {
        const { onSave } = draw()
        fireEvent.click(screen.getByRole('button', { name: 'Edit: Find coloured bowls' }))
        const box = screen.getByRole('textbox', { name: 'What needs doing' })
        fireEvent.change(box, { target: { value: 'Find coloured bowls, blue' } })
        fireEvent.keyDown(box, { key: 'Enter' })
        expect(onSave).toHaveBeenCalledWith('a1', { label: 'Find coloured bowls, blue' })
    })

    it('opens from its words, and Escape leaves it as it was', () => {
        const { onSave } = draw()
        fireEvent.click(screen.getByRole('button', { name: 'Find coloured bowls' }))
        const box = screen.getByRole('textbox', { name: 'What needs doing' })
        fireEvent.change(box, { target: { value: 'something else' } })
        fireEvent.keyDown(box, { key: 'Escape' })
        expect(onSave).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: 'Find coloured bowls' })).toBeInTheDocument()
    })

    it('offers nothing to change on a report that cannot be changed', () => {
        draw({ canEdit: false })
        expect(screen.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument()
    })
})
