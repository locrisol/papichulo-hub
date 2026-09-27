// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { makeQuery, mockSupabase, renderWithRouter } from '@/test/helpers'

// Working through a round on the phone: tick, untick, Submit, and what can
// never be changed. Invented list and people.

const ROUND = {
    id: 'r1', checklist_id: 'L1', restaurant_id: 'rest1', started_at: '2026-09-22T09:00:00+00:00',
    started_by_name: 'Aoife', ended_at: null, ended_by: null,
}
const LIST = { id: 'L1', name: 'Weekly Deep Clean', repeats: 'weeks', every_weeks: 1, is_active: true }
const CATEGORIES = [{ id: 'c1', checklist_id: 'L1', name: 'Kitchen', sort_order: 1, is_active: true }]
const TASKS = [
    { id: 't1', checklist_id: 'L1', category_id: 'c1', parent_id: null, name: 'Small toaster area', how_to: 'Unplug it first.', guide_photo: 'rest1/guides/g.jpg', needs_photo: false, sort_order: 1, is_active: true },
    { id: 't2', checklist_id: 'L1', category_id: 'c1', parent_id: 't1', name: 'Clean under the toaster', sort_order: 1, is_active: true },
    { id: 't3', checklist_id: 'L1', category_id: 'c1', parent_id: 't1', name: 'Clean toaster sides', sort_order: 2, is_active: true },
    { id: 't4', checklist_id: 'L1', category_id: 'c1', parent_id: null, name: 'Mop the floor', needs_photo: true, sort_order: 2, is_active: true },
]
const SAVED = [{ id: 'k1', round_id: 'r1', task_id: 't2', done_by_name: 'Aoife', done_at: '2026-09-22T09:30:00+00:00', photos: [] }]

let db
function setUp({ round = ROUND, saved = SAVED, upsertResult } = {}) {
    const upsert = makeQuery(upsertResult || { data: [{ task_id: 't3' }], error: null })
    db = mockSupabase({
        checklist_rounds: { data: round, error: null },
        checklists: { data: LIST, error: null },
        checklist_categories: { data: CATEGORIES, error: null },
        checklist_tasks: { data: TASKS, error: null },
        checklist_last_done: { data: [{ task_id: 't3', done_at: '2026-09-15T10:00:00+00:00' }], error: null },
    })
    const plain = db.from.getMockImplementation()
    db.from.mockImplementation(table => {
        if (table !== 'checklist_ticks') return plain(table)
        const read = makeQuery({ data: saved, error: null })
        read.upsert = vi.fn(() => upsert)
        return read
    })
    db.storage.from.mockImplementation(() => ({
        createSignedUrls: vi.fn(async paths => ({ data: paths.map(path => ({ path, signedUrl: `https://signed/${path}` })) })),
        upload: vi.fn(async () => ({ error: null })),
    }))
}

vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
let role = 'employee'
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role, full_name: 'Aoife' } }) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ restaurants: [{ id: 'rest1', name: 'Testville' }], activeRestaurant: { id: 'rest1', name: 'Testville' } }),
}))
const confirm = vi.fn(async () => true)
vi.mock('@/context/confirm', () => ({ useConfirm: () => confirm }))

const { default: ChecklistRoundPage } = await import('./ChecklistRoundPage')

function open() {
    renderWithRouter(
        <Routes><Route path="/checklists/rounds/:id" element={<ChecklistRoundPage />} /></Routes>,
        { route: '/checklists/rounds/r1' },
    )
    return userEvent.setup()
}

beforeEach(() => {
    localStorage.clear()
    role = 'employee'
    setUp()
})

describe('the list as it reads', () => {
    it('shows each thing, who did what, and when it was last done', async () => {
        open()
        expect(await screen.findByText('Kitchen')).toBeInTheDocument()
        expect(screen.getByText('Small toaster area')).toBeInTheDocument()
        expect(screen.getByText('Unplug it first.')).toBeInTheDocument()
        expect(screen.getByText(/Done by Aoife/)).toBeInTheDocument()
        expect(screen.getByText(/^Last done Tue/)).toBeInTheDocument()
        expect(screen.getByText('1 of 3 done')).toBeInTheDocument()
    })

    it('hides a guide picture behind a button until it is asked for', async () => {
        const user = open()
        const show = await screen.findByRole('button', { name: 'Show picture' })
        expect(screen.queryByRole('img')).toBeNull()
        await user.click(show)
        expect(await screen.findByRole('img', { name: 'What Small toaster area should look like' })).toHaveAttribute('src', 'https://signed/rest1/guides/g.jpg')
    })

    it('never lets a submitted tick be taken off', async () => {
        open()
        expect(await screen.findByLabelText('Clean under the toaster')).toBeDisabled()
        expect(screen.getByLabelText('Clean under the toaster')).toBeChecked()
    })
})

describe('ticking and submitting', () => {
    it('holds a tick on the phone until Submit, and lets a mis-tap be undone', async () => {
        const user = open()
        await user.click(await screen.findByLabelText('Clean toaster sides'))
        expect(screen.getByText('Ticked, not saved yet')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument()
        expect(JSON.parse(localStorage.getItem('checklist-draft-r1'))).toHaveProperty('t3')
        await user.click(screen.getByLabelText('Clean toaster sides'))
        expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()
        expect(localStorage.getItem('checklist-draft-r1')).toBeNull()
    })

    it('saves what was ticked, with the time it was ticked, and forgets the draft', async () => {
        const user = open()
        await user.click(await screen.findByLabelText('Clean toaster sides'))
        await user.click(screen.getByRole('button', { name: 'Submit' }))
        expect(await screen.findByText('1 tick saved.')).toBeInTheDocument()
        const sent = db.from.mock.results.map(r => r.value).find(q => q.upsert?.mock?.calls.length)
        const [sentRows, sentOptions] = sent.upsert.mock.calls[0]
        expect(sentRows).toEqual([{ round_id: 'r1', task_id: 't3', done_at: expect.any(String), photos: [] }])
        expect(sentOptions).toEqual({ onConflict: 'round_id,task_id', ignoreDuplicates: true })
        expect(localStorage.getItem('checklist-draft-r1')).toBeNull()
    })

    it('says so when somebody else ticked it first', async () => {
        setUp({ upsertResult: { data: [], error: null } })
        const user = open()
        await user.click(await screen.findByLabelText('Clean toaster sides'))
        await user.click(screen.getByRole('button', { name: 'Submit' }))
        expect(await screen.findByText(/One was already done by somebody else, so theirs stands./)).toBeInTheDocument()
    })

    it('will not tick something that needs a photo until it has one', async () => {
        open()
        expect(await screen.findByLabelText('Mop the floor')).toBeDisabled()
        expect(screen.getByText('Needs a photo before it can be ticked.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Take photo' })).toBeInTheDocument()
    })

    it('keeps ticks from before the page was closed', async () => {
        localStorage.setItem('checklist-draft-r1', JSON.stringify({ t3: { at: '2026-09-22T10:00:00.000Z', photos: [] } }))
        open()
        expect(await screen.findByText('Ticked, not saved yet')).toBeInTheDocument()
        expect(screen.getByText('1 tick not saved yet.')).toBeInTheDocument()
    })
})

describe('a round that has ended', () => {
    it('says so, and nothing on it can be ticked', async () => {
        setUp({ round: { ...ROUND, ended_at: '2026-09-23T09:00:00+00:00', ended_by: 'u9', ended_by_name: 'Ciara' } })
        open()
        expect(await screen.findByText(/by Ciara with 2 not done. Nothing on it can be changed now./)).toBeInTheDocument()
        expect(screen.getByLabelText('Clean toaster sides')).toBeDisabled()
        expect(screen.queryByRole('button', { name: 'Take photo' })).toBeNull()
    })
})

describe('what only a manager sees', () => {
    it('does not offer an employee the end of a round', async () => {
        open()
        await screen.findByText('Kitchen')
        expect(screen.queryByRole('button', { name: 'End this round now' })).toBeNull()
    })

    it('ends the round when a manager says so', async () => {
        role = 'store_manager'
        const user = open()
        await user.click(await screen.findByRole('button', { name: 'End this round now' }))
        await waitFor(() => expect(confirm).toHaveBeenCalled())
        expect(confirm.mock.calls.at(-1)[0].message).toMatch(/^2 things are not done/)
        const ended = db.from.mock.results.map(r => r.value).find(q => q.update?.mock.calls.length)
        expect(ended.update.mock.calls[0][0]).toHaveProperty('ended_at')
    })

    it('offers the record as a PDF', async () => {
        role = 'owner'
        open()
        const bar = (await screen.findByRole('heading', { name: 'Weekly Deep Clean' })).closest('div').parentElement
        expect(within(bar).getByRole('button', { name: 'PDF' })).toBeInTheDocument()
    })
})
