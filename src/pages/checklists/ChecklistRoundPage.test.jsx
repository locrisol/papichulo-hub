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
    { id: 't1', checklist_id: 'L1', category_id: 'c1', parent_id: null, name: 'Small toaster area', how_to: 'Unplug it first.', guide_photos: ['rest1/guides/g.jpg'], needs_photo: false, sort_order: 1, is_active: true },
    { id: 't2', checklist_id: 'L1', category_id: 'c1', parent_id: 't1', name: 'Clean under the toaster', sort_order: 1, is_active: true },
    { id: 't3', checklist_id: 'L1', category_id: 'c1', parent_id: 't1', name: 'Clean toaster sides', sort_order: 2, is_active: true, guide_photos: ['rest1/guides/a.jpg', 'rest1/guides/b.jpg'] },
    { id: 't4', checklist_id: 'L1', category_id: 'c1', parent_id: null, name: 'Mop the floor', needs_photo: true, sort_order: 2, is_active: true },
]
const SAVED = [{ id: 'k1', round_id: 'r1', task_id: 't2', done_by_name: 'Aoife', done_at: '2026-09-22T09:30:00+00:00', photos: [] }]

// The round before this one, ended early by a manager with the floor and the
// toaster sides left.
const EARLIER = {
    id: 'r0', checklist_id: 'L1', restaurant_id: 'rest1', started_at: '2026-09-14T09:00:00+00:00',
    ended_at: '2026-09-18T17:00:00+00:00', ended_by: 'u9', ended_by_name: 'Ciara',
}
const EARLIER_TICKS = [{ round_id: 'r0', task_id: 't2' }]

let db
function setUp({ round = ROUND, saved = SAVED, upsertResult, deleteResult, list = LIST, earlier = null, earlierTicks = EARLIER_TICKS, categories = CATEGORIES, tasks = TASKS } = {}) {
    const upsert = makeQuery(upsertResult || { data: [{ task_id: 't3' }], error: null })
    const taken = makeQuery(deleteResult || { data: [{ id: 'k9' }], error: null })
    db = mockSupabase({
        checklists: { data: list, error: null },
        checklist_categories: { data: categories, error: null },
        checklist_tasks: { data: tasks, error: null },
        checklist_last_done: { data: [{ task_id: 't3', done_at: '2026-09-15T10:00:00+00:00' }], error: null },
    })
    const plain = db.from.getMockImplementation()
    db.from.mockImplementation(table => {
        // One question for this round, one for the round before it.
        if (table === 'checklist_rounds') {
            const q = makeQuery({ data: earlier ? [earlier] : [], error: null })
            q.maybeSingle = vi.fn(() => Promise.resolve({ data: round, error: null }))
            return q
        }
        if (table !== 'checklist_ticks') return plain(table)
        let roundId
        const read = makeQuery()
        read.eq = vi.fn((column, value) => { if (column === 'round_id') roundId = value; return read })
        read.then = (resolve, reject) => Promise.resolve({ data: roundId === 'r0' ? earlierTicks : [...saved], error: null }).then(resolve, reject)
        read.upsert = vi.fn(() => upsert)
        read.delete = vi.fn(() => taken)
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
    sessionStorage.clear()
    // Categories start closed. Everything below is about the rows, so Kitchen
    // is open on this tab, as if it had been opened before; the closing and
    // opening have their own tests.
    sessionStorage.setItem('checklist-open-r1', JSON.stringify(['c1']))
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
        const show = (await screen.findAllByRole('button', { name: 'Show picture' }))[0]
        expect(screen.queryByRole('img')).toBeNull()
        await user.click(show)
        expect(await screen.findByRole('img', { name: 'What Small toaster area should look like' })).toHaveAttribute('src', 'https://signed/rest1/guides/g.jpg')
    })

    it('says how many pictures there are, and shows them all', async () => {
        const user = open()
        await user.click(await screen.findByRole('button', { name: 'Show 2 pictures' }))
        expect(await screen.findByRole('img', { name: 'What Clean toaster sides should look like, 1 of 2' })).toHaveAttribute('src', 'https://signed/rest1/guides/a.jpg')
        expect(screen.getByRole('img', { name: 'What Clean toaster sides should look like, 2 of 2' })).toHaveAttribute('src', 'https://signed/rest1/guides/b.jpg')
        expect(screen.getByRole('button', { name: 'Hide pictures' })).toBeInTheDocument()
    })

    it('never lets a submitted tick be taken off', async () => {
        open()
        expect(await screen.findByLabelText('Clean under the toaster')).toBeDisabled()
        expect(screen.getByLabelText('Clean under the toaster')).toBeChecked()
    })
})

const sentTicks = () => db.from.mock.results.map(r => r.value).filter(q => q.upsert?.mock?.calls.length)
    .flatMap(q => q.upsert.mock.calls)

// His, 11 October: a tick is saved the moment it is made. Submit used to hold
// them on the phone, and it was easy to leave without pressing it.
describe('ticking', () => {
    it('saves a tick the moment it is made, with the time it was ticked', async () => {
        const user = open()
        await user.click(await screen.findByLabelText('Clean toaster sides'))
        await waitFor(() => expect(sentTicks()).toHaveLength(1))
        const [rows, options] = sentTicks()[0]
        expect(rows).toEqual([{ round_id: 'r1', task_id: 't3', done_at: expect.any(String), photos: [] }])
        expect(options).toEqual({ onConflict: 'round_id,task_id', ignoreDuplicates: true })
        expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()
        await waitFor(() => expect(localStorage.getItem('checklist-draft-r1')).toBeNull())
    })

    it('says so when somebody else ticked it first', async () => {
        setUp({ upsertResult: { data: [], error: null } })
        const user = open()
        await user.click(await screen.findByLabelText('Clean toaster sides'))
        expect(await screen.findByText(/One was already done by somebody else, so theirs stands./)).toBeInTheDocument()
    })

    it('keeps a tick that could not be saved, says so, and tries again', async () => {
        setUp({ upsertResult: { data: null, error: { message: 'Failed to fetch' } } })
        const user = open()
        await user.click(await screen.findByLabelText('Clean toaster sides'))
        expect(await screen.findByText('Not saved yet. It is tried again by itself.')).toBeInTheDocument()
        expect(screen.getByText(/1 tick not saved yet/)).toBeInTheDocument()
        expect(JSON.parse(localStorage.getItem('checklist-draft-r1')).t3.ticked).toBe(true)
        await user.click(screen.getByRole('button', { name: 'Try again' }))
        await waitFor(() => expect(sentTicks()).toHaveLength(2))
    })

    it('lets one not saved yet be taken off again, the mis-tap undo before saving', async () => {
        setUp({ upsertResult: { data: null, error: { message: 'Failed to fetch' } } })
        const user = open()
        await user.click(await screen.findByLabelText('Clean toaster sides'))
        await screen.findByText('Not saved yet. It is tried again by itself.')
        await user.click(screen.getByLabelText('Clean toaster sides'))
        expect(screen.getByLabelText('Clean toaster sides')).not.toBeChecked()
        expect(localStorage.getItem('checklist-draft-r1')).toBeNull()
    })

    it('will not tick something that needs a photo until it has one', async () => {
        open()
        expect(await screen.findByLabelText('Mop the floor')).toBeDisabled()
        expect(screen.getByText('Needs a photo before it can be ticked.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Take photo' })).toBeInTheDocument()
    })

    // From before saving was immediate: ticks left waiting for Submit go by
    // themselves when the page opens.
    it('saves ticks left waiting on the phone as soon as the round opens', async () => {
        localStorage.setItem('checklist-draft-r1', JSON.stringify({ t3: { at: '2026-09-22T10:00:00.000Z', photos: [] } }))
        open()
        await waitFor(() => expect(sentTicks()).toHaveLength(1))
        expect(sentTicks()[0][0]).toEqual([{ round_id: 'r1', task_id: 't3', done_at: '2026-09-22T10:00:00.000Z', photos: [] }])
    })

    // A private window, or a browser told to keep nothing, refuses the store.
    // The tick is still saved.
    it('still saves when the browser will not keep anything', async () => {
        const refuse = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('refused') })
        try {
            const user = open()
            await user.click(await screen.findByLabelText('Clean toaster sides'))
            await waitFor(() => expect(sentTicks()).toHaveLength(1))
        } finally {
            refuse.mockRestore()
        }
    })
})

// A mis-tap once saved: the one who ticked it can take it back for ten
// minutes while the round is open. The database holds the same rule.
describe('taking a tick back', () => {
    const mine = minutesAgo => ({
        id: 'k5', round_id: 'r1', task_id: 't3', done_by: 'u1', done_by_name: 'Aoife',
        done_at: new Date(Date.now() - minutesAgo * 60000).toISOString(),
        saved_at: new Date(Date.now() - minutesAgo * 60000).toISOString(), photos: [],
    })

    it('offers Undo on your own tick for ten minutes, and takes it back', async () => {
        setUp({ saved: [...SAVED, mine(2)] })
        const user = open()
        const row = (await screen.findByLabelText('Clean toaster sides')).closest('[id^="row-"]')
        await user.click(within(row).getByRole('button', { name: 'Undo' }))
        const ticks = db.from.mock.results.map(r => r.value).find(q => q.delete?.mock?.calls.length)
        expect(ticks.delete).toHaveBeenCalled()
        expect(ticks.delete.mock.results[0].value.eq).toHaveBeenCalledWith('id', 'k5')
    })

    it('does not offer it after ten minutes', async () => {
        setUp({ saved: [...SAVED, mine(11)] })
        open()
        const row = (await screen.findByLabelText('Clean toaster sides')).closest('[id^="row-"]')
        expect(within(row).queryByRole('button', { name: 'Undo' })).toBeNull()
    })

    it('never offers it on somebody else\'s tick', async () => {
        setUp({ saved: [...SAVED, { ...mine(2), done_by: 'u7', done_by_name: 'Ciara' }] })
        open()
        const row = (await screen.findByLabelText('Clean toaster sides')).closest('[id^="row-"]')
        expect(within(row).queryByRole('button', { name: 'Undo' })).toBeNull()
    })

    it('says so when the database will not take it back any more', async () => {
        setUp({ saved: [...SAVED, mine(2)], deleteResult: { data: [], error: null } })
        const user = open()
        const row = (await screen.findByLabelText('Clean toaster sides')).closest('[id^="row-"]')
        await user.click(within(row).getByRole('button', { name: 'Undo' }))
        expect(await screen.findByText(/That tick can no longer be taken back/)).toBeInTheDocument()
    })
})

// His, 11 October: a list can say its photos are not needed for now.
describe('a list whose photos are not required', () => {
    it('lets a task marked for a photo be ticked without one, and still offers one', async () => {
        setUp({ list: { ...LIST, photos_required: false } })
        const user = open()
        const box = await screen.findByLabelText('Mop the floor')
        expect(box).not.toBeDisabled()
        expect(screen.queryByText('Needs a photo before it can be ticked.')).toBeNull()
        expect(screen.getByRole('button', { name: 'Add photo (optional)' })).toBeInTheDocument()
        expect(screen.getByText(/Photos are not needed on this list for now./)).toBeInTheDocument()
        await user.click(box)
        await waitFor(() => expect(sentTicks()).toHaveLength(1))
        expect(sentTicks()[0][0][0]).toMatchObject({ task_id: 't4', photos: [] })
    })
})

// Seven people on one list: each phone learns what the others submitted
// without anybody pressing anything.
describe('several people on one list', () => {
    const CIARA = { id: 'k2', round_id: 'r1', task_id: 't3', done_by_name: 'Ciara', done_at: '2026-09-22T09:40:00+00:00', photos: [] }

    it('shows what somebody else submitted when the phone comes back to the page', async () => {
        const saved = [...SAVED]
        setUp({ saved })
        open()
        expect(await screen.findByText('1 of 3 done')).toBeInTheDocument()
        saved.push(CIARA)
        window.dispatchEvent(new Event('focus'))
        expect(await screen.findByText(/Done by Ciara/)).toBeInTheDocument()
        expect(screen.getByText('2 of 3 done')).toBeInTheDocument()
    })

    it('turns a tick to theirs the moment it is ticked, if they already did it', async () => {
        const saved = [...SAVED]
        setUp({ saved })
        const user = open()
        const box = await screen.findByLabelText('Clean toaster sides')
        saved.push(CIARA)
        await user.click(box)
        expect(await screen.findByText(/Done by Ciara/)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()
    })
})

// His, 11 October: every category starts closed, a heading opens only its own,
// and one button opens or closes them all without changing size.
describe('categories that open and close', () => {
    const BAR = { id: 'c2', checklist_id: 'L1', name: 'Bar', sort_order: 2, is_active: true }
    const TAPS = { id: 't5', checklist_id: 'L1', category_id: 'c2', parent_id: null, name: 'Clean the taps', sort_order: 1, is_active: true }
    const heading = name => screen.getByRole('button', { name: new RegExp(`^${name}`) })

    beforeEach(() => {
        sessionStorage.clear()
        setUp({ categories: [...CATEGORIES, BAR], tasks: [...TASKS, TAPS] })
    })

    it('starts with every category closed', async () => {
        open()
        expect(await screen.findByText('Kitchen')).toBeInTheDocument()
        expect(heading('Kitchen')).toHaveAttribute('aria-expanded', 'false')
        expect(heading('Bar')).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByLabelText('Clean toaster sides')).toBeNull()
        expect(screen.queryByLabelText('Clean the taps')).toBeNull()
    })

    it('opens only the category whose heading is tapped', async () => {
        const user = open()
        await screen.findByText('Kitchen')
        await user.click(heading('Bar'))
        expect(screen.getByLabelText('Clean the taps')).toBeInTheDocument()
        expect(screen.queryByLabelText('Clean toaster sides')).toBeNull()
        await user.click(heading('Bar'))
        expect(screen.queryByLabelText('Clean the taps')).toBeNull()
    })

    it('opens and closes them all from one button that keeps its size', async () => {
        const user = open()
        const button = await screen.findByRole('button', { name: /Expand all/ })
        // Both words are always in it and only one shows.
        expect(within(button).getByText('Collapse all')).toHaveClass('invisible')
        await user.click(button)
        expect(screen.getByLabelText('Clean toaster sides')).toBeInTheDocument()
        expect(screen.getByLabelText('Clean the taps')).toBeInTheDocument()
        expect(button).toHaveAttribute('aria-expanded', 'true')
        expect(within(button).getByText('Expand all')).toHaveClass('invisible')
        expect(within(button).getByText('Collapse all')).not.toHaveClass('invisible')
        await user.click(button)
        expect(screen.queryByLabelText('Clean the taps')).toBeNull()
    })

    it('says Expand all again once any one is closed', async () => {
        const user = open()
        await user.click(await screen.findByRole('button', { name: /Expand all/ }))
        await user.click(heading('Bar'))
        expect(within(screen.getByRole('button', { name: /Expand all/ })).getByText('Expand all')).not.toHaveClass('invisible')
    })

    it('remembers which are open on this tab, for a reload', async () => {
        const user = open()
        await screen.findByText('Kitchen')
        await user.click(heading('Bar'))
        expect(JSON.parse(sessionStorage.getItem('checklist-open-r1'))).toEqual(['c2'])
    })

    it('says on a closed heading that something in it is High priority, and opens it to go there', async () => {
        setUp({ earlier: EARLIER, categories: [...CATEGORIES, BAR], tasks: [...TASKS, TAPS] })
        const user = open()
        const box = await screen.findByRole('note')
        expect(within(heading('Kitchen')).getByText('2 high priority')).toBeInTheDocument()
        await user.click(within(box).getByRole('button', { name: 'Mop the floor' }))
        expect(screen.getByLabelText('Mop the floor')).toBeInTheDocument()
        expect(heading('Kitchen')).toHaveAttribute('aria-expanded', 'true')
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

    // No reason asked for: his call, 27 September.
    it('ends the round when a manager says so, saying what comes of it', async () => {
        role = 'store_manager'
        const user = open()
        await user.click(await screen.findByRole('button', { name: 'End this round now' }))
        await waitFor(() => expect(confirm).toHaveBeenCalled())
        expect(confirm.mock.calls.at(-1)[0].message).toBe('2 things are not done. They come back on the next round as High priority, and the weekly report shows them as not done.')
        await waitFor(() => expect(db.from.mock.results.map(r => r.value).some(q => q.update?.mock.calls.length)).toBe(true))
        const ended = db.from.mock.results.map(r => r.value).find(q => q.update?.mock.calls.length)
        expect(ended.update.mock.calls[0][0]).toEqual({ ended_at: expect.any(String) })
    })

    it('offers the record as a PDF', async () => {
        role = 'owner'
        open()
        const bar = (await screen.findByRole('heading', { name: 'Weekly Deep Clean' })).closest('div').parentElement
        expect(within(bar).getByRole('button', { name: 'PDF' })).toBeInTheDocument()
    })
})

// His idea, 27 September: what was not done when the last round was ended
// early is labelled High priority and tinted red on the next one.
describe('what was left last time', () => {
    it('is labelled High priority and tinted red, saying who ended that round', async () => {
        setUp({ earlier: EARLIER })
        open()
        const box = await screen.findByRole('note')
        expect(within(box).getByText('High priority')).toBeInTheDocument()
        expect(within(box).getByText(/These were not done last time, so do them first. Ciara ended the last round on Friday/)).toBeInTheDocument()
        expect(within(box).queryByText(/saying/)).toBeNull()
        expect(within(box).getByRole('button', { name: 'Small toaster area: Clean toaster sides' })).toBeInTheDocument()
        expect(within(box).getByRole('button', { name: 'Mop the floor' })).toBeInTheDocument()
        const row = screen.getByLabelText('Mop the floor').closest('[id^="row-"]')
        expect(row.className).toMatch(/bg-red-50/)
        expect(within(row).getByText('High priority')).toBeInTheDocument()
    })

    it('stops being High priority once it is ticked this time', async () => {
        setUp({ earlier: EARLIER, saved: [...SAVED, { id: 'k2', round_id: 'r1', task_id: 't3', done_by_name: 'Aoife', done_at: '2026-09-22T10:00:00+00:00', photos: [] }] })
        open()
        const box = await screen.findByRole('note')
        expect(within(box).queryByRole('button', { name: 'Small toaster area: Clean toaster sides' })).toBeNull()
        expect(within(box).getByRole('button', { name: 'Mop the floor' })).toBeInTheDocument()
    })

    it('marks nothing after a round that finished', async () => {
        setUp({ earlier: { ...EARLIER, ended_by: null, ended_by_name: null } })
        open()
        await screen.findByText('Kitchen')
        expect(screen.queryByRole('note')).toBeNull()
        expect(screen.queryByText('High priority')).toBeNull()
    })
})

// His, 11 October: a couple of things marked on the list as always High
// priority, red on every round until ticked. Marked on an element with sub
// elements, every sub element under it is.
describe('always high priority', () => {
    const marking = (...ids) => TASKS.map(t => (ids.includes(t.id) ? { ...t, high_priority: true } : t))

    it('puts a marked task in red at the top until it is ticked', async () => {
        setUp({ tasks: marking('t4') })
        open()
        const box = await screen.findByRole('note')
        expect(within(box).getByText('This is always high priority on this list, so do it first.')).toBeInTheDocument()
        expect(within(box).getByRole('button', { name: 'Mop the floor' })).toBeInTheDocument()
        const row = screen.getByLabelText('Mop the floor').closest('[id^="row-"]')
        expect(row.className).toMatch(/bg-red-50/)
        expect(within(row).getByText('High priority')).toBeInTheDocument()
    })

    it('makes every sub element red when the element is marked, until each is ticked', async () => {
        setUp({ tasks: marking('t1') })
        open()
        const box = await screen.findByRole('note')
        // Clean under the toaster is already ticked, so only the sides are left.
        expect(within(box).getByRole('button', { name: 'Small toaster area: Clean toaster sides' })).toBeInTheDocument()
        expect(within(box).queryByRole('button', { name: /Clean under the toaster/ })).toBeNull()
        expect(screen.getByLabelText('Clean toaster sides').closest('[id^="row-"]').className).toMatch(/bg-red-50/)
        expect(screen.getByLabelText('Clean under the toaster').closest('[id^="row-"]').className).not.toMatch(/bg-red-50/)
        expect(within(screen.getByText('Small toaster area').closest('[id^="group-"]')).getAllByText('High priority')).not.toHaveLength(0)
    })

    it('says which is which when some were left last time and some are marked', async () => {
        setUp({ tasks: marking('t4'), earlier: EARLIER, earlierTicks: [{ round_id: 'r0', task_id: 't2' }, { round_id: 'r0', task_id: 't4' }] })
        open()
        const box = await screen.findByRole('note')
        expect(within(box).getByText(/^Do these first. Ciara ended the last round on/)).toBeInTheDocument()
        expect(within(box).getByText('Kitchen · Not done last time')).toBeInTheDocument()
        expect(within(box).getByText('Kitchen · Always high priority')).toBeInTheDocument()
    })
})
