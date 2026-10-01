// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EventModal from '@/components/forecast/EventModal'

// Putting right a time that was read wrong.
//
// A page says 7:30pm and the model is asked for 24 hour times. When it copied
// the page across instead, the reading was filed as half past seven in the
// morning, and nothing could change it: the name and the end date could be
// corrected here, the time could not.

const READING = {
    id: 'e1',
    name: 'Pentangle',
    event_date: '2026-11-19',
    event_time: '07:30:00',
    source: 'page',
    source_url: 'https://paviliontheatre.ie/events',
    review: 'found',
    place_id: 'p1',
}

const FEED = {
    ...READING,
    id: 'e2',
    source: 'ticketmaster',
    review: 'trusted',
    source_url: null,
    ticketmaster_id: 'tm1',
}

function draw(event) {
    const onRename = vi.fn()
    render(<EventModal row={{ event }} canEdit onRename={onRename} onClose={() => {}} />)
    return onRename
}

describe('correcting the time of a reading', () => {
    it('starts from the time that was read', () => {
        draw(READING)
        expect(screen.getByLabelText('Start time')).toHaveValue('07:30')
    })

    it('saves a corrected time', () => {
        const onRename = draw(READING)
        fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '19:30' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        expect(onRename).toHaveBeenCalledWith(READING, 'Pentangle', false, '', '19:30')
    })

    it('can take a time off altogether', () => {
        const onRename = draw(READING)
        fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        expect(onRename).toHaveBeenCalledWith(READING, 'Pentangle', false, '', '')
    })

    it('leaves Save off until something has changed', () => {
        draw(READING)
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    })

    // A feed writes its own time again twice a day, so a correction there would
    // be gone by the evening with nothing said.
    it('offers no time for a feed, and sends none', () => {
        const onRename = draw(FEED)
        expect(screen.queryByLabelText('Start time')).toBeNull()

        fireEvent.change(screen.getByLabelText('What to call it on the roster'), { target: { value: 'Pentangle live' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        expect(onRename).toHaveBeenCalledWith(FEED, 'Pentangle live', false, '', undefined)
    })
})

// One thing on near us, opened from the calendar. It is the one screen that
// keeps a night that is not going ahead, so it is where somebody finds out why.

const arena = { id: 'p1', name: '3Arena' }
const row = event => ({ event, place: arena, pairing: { walk_minutes: 2 }, kind: 'arena', checked: true })

describe('a night that is not going ahead', () => {
    it('says Ticketmaster cancelled it, in the spelling Ticketmaster uses', () => {
        render(<EventModal row={row({ id: 'e1', name: 'Westlife', event_date: '2026-10-16', status: 'canceled' })} onClose={() => {}} />)
        expect(screen.getByText(/Cancelled, so this is an ordinary night/)).toBeInTheDocument()
    })

    // The question somebody looking at it will have: is this news or old news.
    it('says when the feed last listed one it has stopped listing', () => {
        render(<EventModal
            row={row({
                id: 'e2', name: 'Westlife', event_date: '2026-10-16', status: 'withdrawn',
                last_seen_at: '2026-09-28T05:15:00',
            })}
            onClose={() => {}}
        />)
        expect(screen.getByText(/No longer listed on Ticketmaster/)).toBeInTheDocument()
        expect(screen.getByText('Last listed')).toBeInTheDocument()
        expect(screen.getByText('28/09/2026')).toBeInTheDocument()
    })

    it('says nothing of the kind about a night still on sale', () => {
        render(<EventModal
            row={row({ id: 'e3', name: 'Westlife', event_date: '2026-10-16', status: 'onsale', last_seen_at: '2026-09-28T05:15:00' })}
            onClose={() => {}}
        />)
        expect(screen.queryByText('Last listed')).toBeNull()
    })
})
