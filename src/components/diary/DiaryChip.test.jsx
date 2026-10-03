// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DiaryChip from '@/components/diary/DiaryChip'

// One thing on a day, on the calendar and on My shifts. A cancelled night is
// struck through. One the feed stopped listing never gets here. See nearbyRows.
const item = off => ({
    key: 'k', source: 'nearby', kind: 'arena', title: 'Westlife', time: '19:30', checked: true, off,
})

describe('a night that is not going ahead', () => {
    it('strikes a cancelled one through, and says why when hovered', () => {
        render(<DiaryChip item={item('cancelled')} canEdit={false} />)
        const chip = screen.getByText(/Westlife/)
        expect(chip.className).toContain('line-through')
        expect(chip.title).toBe('Westlife (Cancelled)')
    })

    it('leaves a night going ahead as it is', () => {
        render(<DiaryChip item={item('')} canEdit={false} />)
        const chip = screen.getByText(/Westlife/)
        expect(chip.className).not.toContain('line-through')
        expect(chip.textContent).toBe('19:30 Westlife')
    })
})
