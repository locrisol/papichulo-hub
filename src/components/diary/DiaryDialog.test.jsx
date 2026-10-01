// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { mockSupabase, makeQuery } from '@/test/helpers'

// A new entry saved while Google is refusing it.
//
// The row is in the Hub, the dialog says it did not reach Google and stays
// open, and pressing Save again is the natural next thing. That used to insert
// the job a second time, and a third, one copy for every press.

const SAVED = { id: 'd1', kind: 'catering', title: 'Lunch for twelve', scope: 'sites', restaurant_ids: ['r1'], starts_on: '2026-10-16' }

const db = mockSupabase({})
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
let signedIn = { id: 'u1', role: 'store_manager', restaurant_id: 'r1' }
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: signedIn }) }))
vi.mock('@/context/confirm', () => ({ useConfirm: () => () => Promise.resolve(true) }))

const writeToGoogle = vi.fn()
vi.mock('@/lib/diaryGoogle', () => ({ writeToGoogle: (...a) => writeToGoogle(...a) }))

const { default: DiaryDialog } = await import('./DiaryDialog')

const RESTAURANTS = [{ id: 'r1', name: 'Point Campus', google_calendar_id: 'point@group.calendar.google.com' }]

// Every read of diary_entries, so the test can see which of them wrote.
let asked = []

function draw() {
    const onSaved = vi.fn()
    const onClose = vi.fn()
    render(
        <DiaryDialog entry={null} date="2026-10-16" restaurants={RESTAURANTS} onClose={onClose} onSaved={onSaved} />,
    )
    return { onSaved, onClose }
}

async function saveOnce() {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText(/Saved, but it did not reach Google/)
}

beforeEach(() => {
    signedIn = { id: 'u1', role: 'store_manager', restaurant_id: 'r1' }
    asked = []
    db.from.mockImplementation(() => {
        const chain = makeQuery({ data: [], error: null })
        chain.single = vi.fn(() => Promise.resolve({ data: SAVED, error: null }))
        asked.push(chain)
        return chain
    })
    writeToGoogle.mockReset()
    writeToGoogle.mockResolvedValue({ ok: false, reason: 'Google refused the token.' })
})

describe('saving again after it did not reach Google', () => {
    it('changes the row it already saved rather than adding another', async () => {
        draw()
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lunch for twelve' } })
        await saveOnce()

        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(writeToGoogle).toHaveBeenCalledTimes(2))

        expect(asked.filter(c => c.insert.mock.calls.length)).toHaveLength(1)
        const updates = asked.filter(c => c.update.mock.calls.length)
        expect(updates).toHaveLength(1)
        expect(updates[0].eq).toHaveBeenCalledWith('id', 'd1')
        expect(writeToGoogle).toHaveBeenLastCalledWith('d1')
    })

    // Cancel after the warning still has to show the row on the calendar
    // behind, or the job looks like it was never saved and gets typed again.
    it('hands the saved row back when it is closed', async () => {
        const { onSaved, onClose } = draw()
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lunch for twelve' } })
        await saveOnce()

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(onSaved).toHaveBeenCalledWith(SAVED)
        expect(onClose).not.toHaveBeenCalled()
    })
})

// Only an owner or a super admin speaks for the whole group, which is the
// database's rule. A store manager was offered it anyway and refused on Save.
describe('who is offered All sites', () => {
    it('is not offered to a store manager', () => {
        draw()
        expect(screen.queryByLabelText(/All sites/)).not.toBeInTheDocument()
        expect(screen.getByLabelText(/Just me/)).toBeInTheDocument()
    })

    it('is offered to an owner', () => {
        signedIn = { id: 'u5', role: 'owner', restaurant_id: 'r1' }
        draw()
        expect(screen.getByLabelText(/All sites/)).toBeInTheDocument()
    })
})

// Taking out one the function refuses said the calendar function was not
// deployed, which was not true and sent somebody looking for the wrong thing.
describe('taking out one that is not theirs to change', () => {
    it('gives the real reason', async () => {
        writeToGoogle.mockResolvedValue({ ok: false, refused: true, reason: 'You do not have permission to change this one.' })
        render(
            <DiaryDialog entry={SAVED} date={SAVED.starts_on} restaurants={RESTAURANTS} onClose={() => {}} onSaved={() => {}} />,
        )
        fireEvent.click(screen.getByRole('button', { name: 'Take it out' }))
        expect(await screen.findByText('You do not have permission to change this one.')).toBeInTheDocument()
        expect(screen.queryByText(/still in Google/)).not.toBeInTheDocument()
        expect(asked.filter(c => c.delete.mock.calls.length)).toHaveLength(0)
    })
})
