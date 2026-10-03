// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { mockSupabase, renderWithRouter } from '@/test/helpers'

// Making a list and changing one. The rule worth holding to: something ticked
// before is taken off the list, never deleted, so the rounds that ticked it
// keep it. Invented list.

const LIST = { id: 'L1', restaurant_id: 'r1', name: 'Weekly Deep Clean', repeats: 'weeks', every_weeks: 1, starts_on: '2026-09-01', finish_by: null, is_active: true }
const CATEGORIES = [{ id: 'c1', checklist_id: 'L1', name: 'Kitchen', sort_order: 1, is_active: true }]
const TASKS = [
    { id: 't1', checklist_id: 'L1', category_id: 'c1', parent_id: null, name: 'Small toaster area', sort_order: 1, is_active: true, guide_photos: ['r1/guides/g.jpg'] },
    { id: 't2', checklist_id: 'L1', category_id: 'c1', parent_id: null, name: 'Mop the floor', sort_order: 2, is_active: true, guide_photos: ['r1/guides/m1.jpg', 'r1/guides/m2.jpg', 'r1/guides/m3.jpg', 'r1/guides/m4.jpg'] },
]

let db
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'store_manager' } }) }))
vi.mock('@/context/restaurant', () => ({ useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Testville' } }) }))
const confirm = vi.fn(async () => true)
vi.mock('@/context/confirm', () => ({ useConfirm: () => confirm }))

const { default: ChecklistEditPage } = await import('./ChecklistEditPage')

const removed = vi.fn(async () => ({ error: null }))
beforeEach(() => {
    confirm.mockClear()
    removed.mockClear()
    db = mockSupabase({
        checklists: { data: LIST, error: null },
        checklist_categories: { data: CATEGORIES, error: null },
        checklist_tasks: { data: TASKS, error: null },
        checklist_rounds: { data: null, error: null, count: 2 },
        // Mop the floor has been ticked before; the toaster never has.
        checklist_last_done: { data: [{ task_id: 't2' }], error: null },
    })
    db.storage.from.mockImplementation(() => ({ remove: removed, createSignedUrls: vi.fn(async () => ({ data: [] })) }))
})

function open(route = '/checklists/L1/edit') {
    renderWithRouter(
        <Routes>
            <Route path="/checklists/new" element={<ChecklistEditPage />} />
            <Route path="/checklists/:id/edit" element={<ChecklistEditPage />} />
        </Routes>,
        { route },
    )
    return userEvent.setup()
}

const written = (table, step) => db.from.mock.results
    .filter((r, i) => db.from.mock.calls[i][0] === table)
    .map(r => r.value)
    .filter(q => q[step].mock.calls.length)
    .map(q => q[step].mock.calls[0][0])

describe('a new list', () => {
    it('is made with its name and how often, then opens for adding to', async () => {
        const user = open('/checklists/new')
        await user.type(screen.getByLabelText('Name'), 'Monthly Clean')
        await user.selectOptions(screen.getByLabelText('How often'), 'monthly')
        expect(screen.getByText(/The weekly report only warns when a month ends with it not finished./)).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Make the list' }))
        await waitFor(() => expect(written('checklists', 'insert')).toHaveLength(1))
        expect(written('checklists', 'insert')[0]).toMatchObject({
            name: 'Monthly Clean', repeats: 'monthly', every_weeks: null, finish_by: null, restaurant_id: 'r1', created_by: 'u1',
        })
    })

    it('asks for the days only when they mean something', async () => {
        const user = open('/checklists/new')
        expect(screen.queryByLabelText('Finish by (optional)')).toBeNull()
        await user.selectOptions(screen.getByLabelText('How often'), 'once')
        expect(screen.getByLabelText('Finish by (optional)')).toBeInTheDocument()
        await user.selectOptions(screen.getByLabelText('How often'), 'weeks:2')
        expect(screen.getByLabelText('Counting from the week of')).toBeInTheDocument()
    })
})

describe('taking things off', () => {
    it('deletes what was never ticked, and its guide picture with it', async () => {
        const user = open()
        const row = (await screen.findByText('Small toaster area')).closest('li')
        await user.click(within(row).getByRole('button', { name: 'Remove' }))
        await waitFor(() => expect(removed).toHaveBeenCalledWith(['r1/guides/g.jpg']))
        expect(confirm.mock.calls[0][0].confirmLabel).toBe('Delete')
        expect(confirm.mock.calls[0][0].dangerNote).toBe('This cannot be undone.')
        const deleted = db.from.mock.results.map(r => r.value).find(q => q.delete.mock.calls.length)
        expect(deleted.in).toHaveBeenCalledWith('id', ['t1'])
    })

    it('only takes off what has been ticked before, so its rounds keep it', async () => {
        const user = open()
        const row = (await screen.findByText('Mop the floor')).closest('li')
        await user.click(within(row).getByRole('button', { name: 'Remove' }))
        await waitFor(() => expect(written('checklist_tasks', 'update')).toEqual([{ is_active: false }]))
        expect(confirm.mock.calls[0][0].confirmLabel).toBe('Remove')
        expect(confirm.mock.calls[0][0].dangerNote).toBe('Its guide pictures are deleted tonight.')
        expect(removed).not.toHaveBeenCalled()
    })

    it('takes off a list that has been worked through rather than deleting it', async () => {
        const user = open()
        await user.click(await screen.findByRole('button', { name: 'Deactivate list' }))
        await waitFor(() => expect(written('checklists', 'update')).toEqual([{ is_active: false }]))
    })
})

// Up to four guide pictures on a task, his number, 27 September.
describe('guide pictures', () => {
    it('says how many a task has', async () => {
        open()
        const row = (await screen.findByText('Mop the floor')).closest('li')
        expect(within(row).getByText('4 pictures')).toBeInTheDocument()
        expect(within((await screen.findByText('Small toaster area')).closest('li')).getByText('1 picture')).toBeInTheDocument()
    })

    it('stops at four', async () => {
        const user = open()
        const row = (await screen.findByText('Mop the floor')).closest('li')
        await user.click(within(row).getByRole('button', { name: 'Edit' }))
        expect(screen.getByRole('button', { name: 'Add another picture' })).toBeDisabled()
        expect(screen.getByText('That is the most allowed.')).toBeInTheDocument()
    })

    it('saves without one taken off, and only then deletes it', async () => {
        const user = open()
        const row = (await screen.findByText('Mop the floor')).closest('li')
        await user.click(within(row).getByRole('button', { name: 'Edit' }))
        await user.click(screen.getByRole('button', { name: 'Take off picture 2' }))
        expect(removed).not.toHaveBeenCalled()
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(removed).toHaveBeenCalledWith(['r1/guides/m2.jpg']))
        expect(written('checklist_tasks', 'update')[0].guide_photos).toEqual(['r1/guides/m1.jpg', 'r1/guides/m3.jpg', 'r1/guides/m4.jpg'])
    })
})
