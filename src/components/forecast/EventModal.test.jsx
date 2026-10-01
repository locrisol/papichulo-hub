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
