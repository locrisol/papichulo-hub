// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DiaryChip from '@/components/diary/DiaryChip'

// One thing on a day, on the calendar and on My shifts. A cancelled night is
// struck through. One the feed stopped listing may still be on, so it is said
// in words rather than struck through, which would read as called off.
const item = off => ({
    key: 'k', source: 'nearby', kind: 'arena', title: 'Westlife', time: '19:30', checked: true, off,
})

describe('a night that may not be going ahead', () => {
    it('says the feed no longer lists it, without striking it through', () => {
        render(<DiaryChip item={item('withdrawn')} canEdit={false} />)
        const chip = screen.getByText(/No longer listed/)
        expect(chip.textContent).toContain('Westlife (No longer listed)')
        expect(chip.className).not.toContain('line-through')
    })

    it('strikes a cancelled one through', () => {
        render(<DiaryChip item={item('cancelled')} canEdit={false} />)
        expect(screen.getByText(/Westlife/).className).toContain('line-through')
    })
})
