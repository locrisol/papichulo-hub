// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import HiddenNights from './HiddenNights'

// His, 22 October 2026: the two film screenings at the Arena, hidden, and a
// way to put one back.
const ARENA = { id: 'p1', name: '3Arena' }
const night = (id, time) => ({
    event: { id, name: 'The Lord of The Rings: The Fellowship of The Ring', event_date: '2026-10-11', event_time: `${time}:00`, source: 'ticketmaster' },
    place: ARENA,
    time,
})

describe('the hidden nights', () => {
    it('lists each night with its day, time and place', () => {
        render(<HiddenNights rows={[night('a', '12:00'), night('b', '18:00')]} onShow={() => {}} onClose={() => {}} />)
        expect(screen.getAllByText('The Lord of The Rings: The Fellowship of The Ring')).toHaveLength(2)
        expect(screen.getByText(/, 18:00 · 3Arena$/)).toBeInTheDocument()
    })

    it('shows one again when asked', () => {
        const onShow = vi.fn()
        const rows = [night('a', '12:00'), night('b', '18:00')]
        render(<HiddenNights rows={rows} onShow={onShow} onClose={() => {}} />)
        fireEvent.click(screen.getAllByRole('button', { name: 'Show it again' })[1])
        expect(onShow).toHaveBeenCalledWith(rows[1].event)
    })

    it('says when nothing is hidden', () => {
        render(<HiddenNights rows={[]} onShow={() => {}} onClose={() => {}} />)
        expect(screen.getByText('Nothing is hidden.')).toBeInTheDocument()
    })
})
