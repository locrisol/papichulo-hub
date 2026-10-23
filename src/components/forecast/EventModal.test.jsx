// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Today, as the rest of the app works it out. Fixed far from the real date, so
// a modal that asks the clock any other way says something else.
vi.mock('@/lib/dates', async importOriginal => ({
    ...(await importOriginal()),
    todayISO: () => '2030-01-02',
}))

const confirm = vi.fn(() => Promise.resolve(true))
vi.mock('@/context/confirm', () => ({ useConfirm: () => confirm }))

const { default: EventModal } = await import('@/components/forecast/EventModal')

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
        expect(screen.getByText(/Cancelled, so expect a normal night/)).toBeInTheDocument()
    })

    it('says nothing of the kind about a night still on sale', () => {
        render(<EventModal
            row={row({ id: 'e3', name: 'Westlife', event_date: '2026-10-16', status: 'onsale' })}
            onClose={() => {}}
        />)
        expect(screen.queryByText(/Cancelled/)).toBeNull()
    })
})

// Today was the UTC date, while the words it is compared with are local. From
// midnight to one in the morning all summer, a reading found the evening
// before said today and one found ten minutes ago gave a date.
describe('how long ago a reading was found', () => {
    it('counts from today in Ireland, the same as everywhere else', () => {
        render(<EventModal
            row={{
                ...row({
                    id: 'e4', name: 'Quiz night', event_date: '2030-01-09', source: 'page',
                    source_url: 'https://www.theccd.ie/all-events/', found_at: '2030-01-01T12:00:00Z',
                }),
                checked: false,
            }}
            onClose={() => {}}
        />)
        expect(screen.getByText('theccd.ie, yesterday')).toBeInTheDocument()
    })
})

// His, 21 October 2026: two film screenings at the Arena he wanted off the
// roster, My shifts, the calendar and the report.
describe('saying a night on the calendar is not for us', () => {
    const drawHide = (event, sameName = 0, canHide = true) => {
        const onHide = vi.fn()
        render(<EventModal row={{ event }} canEdit canHide={canHide} sameName={sameName} onRename={() => {}} onHide={onHide} onClose={() => {}} />)
        return onHide
    }

    // His, 23 October 2026: a Ticketmaster night is the super admin's to hide.
    it('is not offered to somebody who may not hide it', () => {
        drawHide(FEED, 0, false)
        expect(screen.queryByRole('button', { name: 'Not for us' })).toBeNull()
    })

    it('asks first, then takes the one night off', async () => {
        const onHide = drawHide(FEED)
        fireEvent.click(screen.getByRole('button', { name: 'Not for us' }))
        await waitFor(() => expect(onHide).toHaveBeenCalledWith(FEED, false))
        expect(confirm.mock.calls.at(-1)[0].message).toMatch(/^Pentangle on .+ comes off the roster, My shifts, the roster picture, the calendar and the weekly report/)
    })

    it('can take every date of it off at once', async () => {
        const onHide = drawHide(FEED, 2)
        fireEvent.click(screen.getByRole('button', { name: 'Not for us, all 2 dates' }))
        await waitFor(() => expect(onHide).toHaveBeenCalledWith(FEED, true))
    })

    it('does nothing when the question is answered no', async () => {
        confirm.mockImplementationOnce(() => Promise.resolve(false))
        const onHide = drawHide(FEED)
        fireEvent.click(screen.getByRole('button', { name: 'Not for us' }))
        await waitFor(() => expect(confirm).toHaveBeenCalled())
        expect(onHide).not.toHaveBeenCalled()
    })

    // A reading still waiting is answered at the top of the Calendar page.
    it('is not offered on a reading nobody has kept yet', () => {
        drawHide(READING)
        expect(screen.queryByRole('button', { name: 'Not for us' })).toBeNull()
    })
})
