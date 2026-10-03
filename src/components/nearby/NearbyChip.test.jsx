// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import NearbyChip from '@/components/nearby/NearbyChip'

// The chip on the roster week. A night the feed stopped listing never reaches
// it, so the chip only ever says what is on and where. See nearbyRows.
const row = {
    kind: 'arena', time: '19:30', checked: true, off: '',
    place: { id: 'p1', name: '3Arena', short_name: '3Arena' },
    event: { id: 'e1', name: 'Westlife', event_date: '2026-10-16' },
}

describe('a night on the roster', () => {
    it('says the name alone under a row already named after the place', () => {
        render(<NearbyChip row={row} short bare />)
        expect(screen.getByText('Westlife').textContent).toBe('19:30 Westlife')
    })

    it('says where it is everywhere else', () => {
        render(<NearbyChip row={row} short />)
        expect(screen.getByText(/Westlife/).textContent).toBe('19:30 Westlife [3Arena]')
    })
})
