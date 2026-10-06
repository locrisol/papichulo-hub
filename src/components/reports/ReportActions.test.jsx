// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActionComments } from './ReportActions'
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
