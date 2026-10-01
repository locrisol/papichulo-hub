// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import NearbyChip from '@/components/nearby/NearbyChip'

// The chip on the roster week. A night the feed stopped listing stays on it
// and says so, because the roster is where the evening gets staffed.
const row = off => ({
    kind: 'arena', time: '19:30', checked: true, off,
    place: { id: 'p1', name: '3Arena' },
    event: { id: 'e1', name: 'Westlife', event_date: '2026-10-16' },
})

describe('a night on the roster', () => {
    it('says when the feed no longer lists it', () => {
        render(<NearbyChip row={row('withdrawn')} short bare />)
        expect(screen.getByText(/Westlife \(No longer listed\)/)).toBeInTheDocument()
    })

    it('says nothing extra about a night still listed', () => {
        render(<NearbyChip row={row('')} short bare />)
        expect(screen.queryByText(/No longer listed/)).toBeNull()
    })
})
