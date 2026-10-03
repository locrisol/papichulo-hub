import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { useRestaurant } from '@/context/restaurant'
import { useConfirm } from '@/context/confirm'
import { todayISO } from '@/lib/dates'
import { friendlyError } from '@/lib/errors'
import {
    badge, card, cardHeader, checkbox, checkRow, fieldClass, hintClass, labelClass,
    modalFooter, pageTitle, pageSubtitle, primaryButton, rowButton, secondaryButton,
} from '@/lib/controlStyles'
import { listTree, repeatWords } from '@/lib/checklists'
import { PHOTO_BUCKET } from '@/lib/photo'
import ErrorBanner from '@/components/ui/ErrorBanner'
import BackButton from '@/components/ui/BackButton'
import AddButton from '@/components/ui/AddButton'
import ArrangeList from '@/components/ui/ArrangeList'
import AutoTextarea from '@/components/ui/AutoTextarea'
import Modal from '@/components/ui/Modal'
import PhotoButton from '@/components/checklists/PhotoButton'
import PhotoStrip from '@/components/checklists/PhotoStrip'
import PrintListButton from '@/components/checklists/PrintListButton'

// Making a list, and changing one. Managers and above.
//
// Built for a computer or a tablet first, because that is where he said lists
// get set up, and it still works on a phone: every row stacks, every control is
// a button rather than something to drag.
//
// Taking something off a list that has been ticked before does not delete it.
// It is taken off, so the rounds that ticked it still say what was done; a
// thing never ticked is deleted outright, since nothing points at it. Either
// way it is gone from the list staff see, and its guide picture goes with it,
// deleted by the nightly job once nothing on a list in use points at it. His
// rule for guide pictures, 27 September: kept until the task is deleted or the
// picture replaced.
const HOW_OFTEN = [
    ...Array.from({ length: 12 }, (_, i) => ({ value: `weeks:${i + 1}`, label: i === 0 ? 'Every week' : `Every ${i + 1} weeks` })),
    { value: 'monthly', label: 'Every month' },
    { value: 'once', label: 'Once' },
]

const oftenOf = list => (list.repeats === 'weeks' ? `weeks:${list.every_weeks}` : list.repeats)

// The most guide pictures a task can carry. The database holds to it as well.
const MAX_PICTURES = 4

export default function ChecklistEditPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const confirm = useConfirm()
    const { user } = useAuth()
    const { activeRestaurant } = useRestaurant()

    const [list, setList] = useState(null)
    const [categories, setCategories] = useState([])
    const [tasks, setTasks] = useState([])
    const [used, setUsed] = useState(new Set())
    const [roundCount, setRoundCount] = useState(0)
    const [loading, setLoading] = useState(Boolean(id))
    const [error, setError] = useState('')
    const [editing, setEditing] = useState(null)
    const [arranging, setArranging] = useState(null)
    const [newCategory, setNewCategory] = useState('')

    const load = useCallback(async () => {
        if (!id) return
        setError('')
        const [l, cats, tsk, rounds] = await Promise.all([
            supabase.from('checklists').select('*').eq('id', id).single(),
            supabase.from('checklist_categories').select('*').eq('checklist_id', id),
            supabase.from('checklist_tasks').select('*').eq('checklist_id', id),
            supabase.from('checklist_rounds').select('id', { count: 'exact', head: true }).eq('checklist_id', id),
        ])
        const failed = l.error || cats.error || tsk.error || rounds.error
        if (failed) { setError(friendlyError(failed)); setLoading(false); return }
        const ids = tsk.data.map(t => t.id)
        const done = ids.length
            ? await supabase.from('checklist_last_done').select('task_id').in('task_id', ids)
            : { data: [] }
        setList(l.data)
        setCategories(cats.data)
        setTasks(tsk.data)
        setUsed(new Set((done.data || []).map(d => d.task_id)))
        setRoundCount(rounds.count || 0)
        setLoading(false)
    }, [id])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load()
    }, [load])

    if (loading) return <p className="text-sm text-muted">Loading the list...</p>
    if (id && !list) {
        return (
            <div>
                <ErrorBanner>{error || 'That list could not be found.'}</ErrorBanner>
                <BackButton to="/checklists" className="mt-4">Back to checklists</BackButton>
            </div>
        )
    }

    const tree = listTree(categories, tasks)
    const nextOrder = rows => rows.reduce((m, r) => Math.max(m, r.sort_order ?? 0), -1) + 1

    async function addCategory() {
        const name = newCategory.trim()
        if (!name) return
        const { error: addErr } = await supabase.from('checklist_categories')
            .insert({ checklist_id: list.id, name, sort_order: nextOrder(categories.filter(c => c.is_active)) })
        if (addErr) { setError(friendlyError(addErr)); return }
        setNewCategory('')
        load()
    }

    function renameCategory(category) {
        setEditing({ kind: 'category', category })
    }

    // Deleting what nothing points at, taking off what something does. The
    // guide pictures of what is deleted go straight away; those of what is
    // taken off go with the nightly job.
    async function removeTasks(rows, what) {
        const ids = rows.map(r => r.id)
        const ticked = ids.some(i => used.has(i))
        const pictures = rows.flatMap(r => r.guide_photos || [])
        const ok = await confirm({
            title: ticked ? `Remove ${what} from the list?` : `Delete ${what}?`,
            message: ticked
                ? 'It has been ticked before, so past rounds keep it. It will not be on the list from now on.'
                : 'It has never been ticked, so it is deleted.',
            confirmLabel: ticked ? 'Remove' : 'Delete',
            tone: 'danger',
            dangerNote: !ticked ? 'This cannot be undone.'
                : pictures.length === 1 ? 'Its guide picture is deleted tonight.'
                    : pictures.length > 1 ? 'Its guide pictures are deleted tonight.' : '',
        })
        if (!ok) return false
        const { error: rmErr } = ticked
            ? await supabase.from('checklist_tasks').update({ is_active: false }).in('id', ids)
            : await supabase.from('checklist_tasks').delete().in('id', ids)
        if (rmErr) { setError(friendlyError(rmErr)); return false }
        if (!ticked && pictures.length) await supabase.storage.from(PHOTO_BUCKET).remove(pictures)
        return true
    }

    async function removeElement({ task, subs }) {
        if (await removeTasks([task, ...subs], subs.length ? `${task.name} and everything under it` : task.name)) load()
    }

    async function removeSub(sub) {
        if (await removeTasks([sub], sub.name)) load()
    }

    async function removeCategory(category) {
        const inside = tasks.filter(t => t.category_id === category.id)
        const ticked = inside.some(t => used.has(t.id))
        const ok = await confirm({
            title: ticked ? `Remove ${category.name} from the list?` : `Delete ${category.name}?`,
            message: ticked
                ? 'Things in it have been ticked before, so past rounds keep them. It will not be on the list from now on.'
                : `It is deleted, with ${inside.length === 1 ? 'the one thing' : `the ${inside.length} things`} in it.`,
            confirmLabel: ticked ? 'Remove' : 'Delete',
            tone: 'danger',
        })
        if (!ok) return
        const failed = ticked
            ? (await supabase.from('checklist_tasks').update({ is_active: false }).eq('category_id', category.id)).error
                || (await supabase.from('checklist_categories').update({ is_active: false }).eq('id', category.id)).error
            : (await supabase.from('checklist_categories').delete().eq('id', category.id)).error
        if (failed) { setError(friendlyError(failed)); return }
        const pictures = inside.flatMap(t => t.guide_photos || [])
        if (!ticked && pictures.length) await supabase.storage.from(PHOTO_BUCKET).remove(pictures)
        load()
    }

    async function saveOrder(table, order) {
        const results = await Promise.all(order.map((row, i) => supabase.from(table).update({ sort_order: i }).eq('id', row.id)))
        const failed = results.find(r => r.error)
        if (failed) setError(friendlyError(failed.error))
        setArranging(null)
        load()
    }

    async function removeList() {
        if (roundCount === 0) {
            const ok = await confirm({
                title: `Delete ${list.name}?`,
                message: 'It has never been started, so it is deleted with everything on it.',
                confirmLabel: 'Delete',
                tone: 'danger',
            })
            if (!ok) return
            const pictures = tasks.flatMap(t => t.guide_photos || [])
            const { error: delErr } = await supabase.from('checklists').delete().eq('id', list.id)
            if (delErr) { setError(friendlyError(delErr)); return }
            if (pictures.length) await supabase.storage.from(PHOTO_BUCKET).remove(pictures)
            navigate('/checklists')
            return
        }
        const ok = await confirm({
            title: `Deactivate ${list.name}?`,
            message: `Nobody will see it on their phone, and it leaves the weekly report. Its rounds are kept, with who did what.${tasks.some(t => (t.guide_photos || []).length > 0) ? ' Its guide pictures are deleted tonight.' : ''}`,
            confirmLabel: 'Deactivate',
            tone: 'danger',
            dangerNote: '',
        })
        if (!ok) return
        const { error: offErr } = await supabase.from('checklists').update({ is_active: false }).eq('id', list.id)
        if (offErr) { setError(friendlyError(offErr)); return }
        navigate('/checklists')
    }

    async function putBack() {
        const { error: backErr } = await supabase.from('checklists').update({ is_active: true }).eq('id', list.id)
        if (backErr) { setError(friendlyError(backErr)); return }
        load()
    }

    return (
        <div className="max-w-4xl">
            <BackButton to="/checklists">Back to checklists</BackButton>
            <header className="mt-4 mb-6 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className={`${pageTitle} break-words`}>{list ? list.name : 'New list'}</h2>
                    {list && (
                        <p className={pageSubtitle}>
                            {repeatWords(list)}{!list.is_active && ' · Inactive: nobody sees it'}
                        </p>
                    )}
                </div>
                {list?.is_active && tree.length > 0 && (
                    <PrintListButton list={list} restaurant={activeRestaurant} onError={setError} />
                )}
            </header>

            <ErrorBanner className="mb-4">{error}</ErrorBanner>

            <ListForm
                list={list}
                onSaved={saved => (list ? load() : navigate(`/checklists/${saved.id}/edit`, { replace: true }))}
                restaurantId={activeRestaurant?.id}
                userId={user?.id}
                onError={setError}
            />

            {list && (
                <section className="mt-8">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                        <h2 className={pageTitle}>What is on the list</h2>
                        {tree.length > 1 && (
                            <button type="button" className={secondaryButton} onClick={() => setArranging({
                                title: 'Arrange the categories', table: 'checklist_categories', items: tree.map(g => g.category),
                            })}>
                                Arrange categories
                            </button>
                        )}
                    </div>
                    <p className={`${hintClass} mb-4`}>
                        Categories hold elements, like Small toaster area, and an element can have sub elements under it,
                        like Clean under the toaster. Staff tick an element, or each of its sub elements if it has any.
                    </p>

                    {tree.length === 0 && (
                        <div className={`${card} p-6 text-sm text-muted`}>Add a category to start, like Kitchen or Toilets.</div>
                    )}

                    <div className="space-y-5">
                        {tree.map(({ category, elements }) => (
                            <div key={category.id} className={`${card} overflow-hidden`}>
                                <div className={`${cardHeader} flex flex-wrap items-center justify-between gap-2`}>
                                    <span className="normal-case text-sm tracking-normal">{category.name}</span>
                                    <span className="flex flex-wrap gap-2">
                                        {elements.length > 1 && (
                                            <button type="button" className={rowButton('plain')} onClick={() => setArranging({
                                                title: `Arrange ${category.name}`, table: 'checklist_tasks', items: elements.map(e => e.task),
                                            })}>Arrange</button>
                                        )}
                                        <button type="button" className={rowButton('plain')} onClick={() => renameCategory(category)}>Rename</button>
                                        <button type="button" className={rowButton('danger')} onClick={() => removeCategory(category)}>Remove</button>
                                    </span>
                                </div>

                                <ul className="divide-y divide-border">
                                    {elements.map(element => (
                                        <li key={element.task.id} className="px-4 py-3">
                                            <TaskLine
                                                task={element.task}
                                                bold
                                                hasSubs={element.subs.length > 0}
                                                onEdit={() => setEditing({ kind: 'task', task: element.task, hasSubs: element.subs.length > 0 })}
                                                onRemove={() => removeElement(element)}
                                                onAddSub={() => setEditing({ kind: 'task', parent: element.task, categoryId: category.id, order: nextOrder(element.subs) })}
                                            />
                                            {element.subs.length > 0 && (
                                                <ul className="mt-2 ml-4 sm:ml-6 border-l-2 border-border pl-3 space-y-2">
                                                    {element.subs.map(sub => (
                                                        <li key={sub.id}>
                                                            <TaskLine
                                                                task={sub}
                                                                onEdit={() => setEditing({ kind: 'task', task: sub })}
                                                                onRemove={() => removeSub(sub)}
                                                            />
                                                        </li>
                                                    ))}
                                                    {element.subs.length > 1 && (
                                                        <li>
                                                            <button type="button" className={rowButton('plain')} onClick={() => setArranging({
                                                                title: `Arrange ${element.task.name}`, table: 'checklist_tasks', items: element.subs,
                                                            })}>Arrange sub elements</button>
                                                        </li>
                                                    )}
                                                </ul>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                                <div className="px-4 py-3 bg-gray-50 border-t border-border">
                                    <AddButton onClick={() => setEditing({ kind: 'task', categoryId: category.id, order: nextOrder(elements.map(e => e.task)) })}>
                                        Add element
                                    </AddButton>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className={`${card} p-4 mt-5 flex flex-col sm:flex-row gap-2 sm:items-end`}>
                        <div className="flex-1">
                            <label htmlFor="new-category" className={labelClass}>New category</label>
                            <input
                                id="new-category"
                                className={fieldClass}
                                value={newCategory}
                                onChange={e => setNewCategory(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') addCategory() }}
                                placeholder="Kitchen"
                            />
                        </div>
                        <AddButton onClick={addCategory} disabled={!newCategory.trim()}>Add category</AddButton>
                    </div>

                    <div className="mt-10 pt-5 border-t border-border">
                        {list.is_active ? (
                            <>
                                <button type="button" onClick={removeList} className={rowButton('danger')}>
                                    {roundCount === 0 ? 'Delete list' : 'Deactivate list'}
                                </button>
                                <p className={hintClass}>
                                    {roundCount === 0
                                        ? 'It has never been started, so it can be deleted.'
                                        : 'It has been used before, so it can only be deactivated. Its rounds are kept.'}
                                </p>
                            </>
                        ) : (
                            <button type="button" onClick={putBack} className={rowButton('good')}>Reactivate list</button>
                        )}
                    </div>
                </section>
            )}

            {editing?.kind === 'task' && (
                <TaskDialog
                    list={list}
                    editing={editing}
                    restaurantId={list.restaurant_id}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); load() }}
                />
            )}
            {editing?.kind === 'category' && (
                <RenameDialog
                    category={editing.category}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); load() }}
                />
            )}
            {arranging && (
                <ArrangeList
                    title={arranging.title}
                    items={arranging.items}
                    onSave={order => saveOrder(arranging.table, order)}
                    onClose={() => setArranging(null)}
                />
            )}
        </div>
    )
}

// One element or sub element in the editor, with what it carries and its
// buttons.
function TaskLine({ task, bold, hasSubs, onEdit, onRemove, onAddSub }) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-start gap-2">
            <div className="flex-1 min-w-0">
                <p className={`${bold ? 'font-semibold' : 'font-medium'} text-gray-900 break-words`}>{task.name}</p>
                {task.how_to && <p className="text-sm text-gray-600 line-clamp-2 whitespace-pre-line">{task.how_to}</p>}
                <div className="flex flex-wrap gap-1.5 mt-1">
                    {task.guide_photos?.length > 0 && (
                        <span className={`${badge} bg-blue-50 text-blue-800`}>
                            {task.guide_photos.length === 1 ? '1 picture' : `${task.guide_photos.length} pictures`}
                        </span>
                    )}
                    {task.needs_photo && !hasSubs && <span className={`${badge} bg-amber-100 text-amber-900`}>Needs a photo</span>}
                </div>
            </div>
            <div className="flex flex-wrap gap-2 flex-shrink-0">
                <button type="button" onClick={onEdit} className={rowButton('edit')}>Edit</button>
                {onAddSub && <button type="button" onClick={onAddSub} className={rowButton('plain')}>Add sub element</button>}
                <button type="button" onClick={onRemove} className={rowButton('danger')}>Remove</button>
            </div>
        </div>
    )
}

// The name and how often, for a new list or an existing one.
function ListForm({ list, onSaved, restaurantId, userId, onError }) {
    const [name, setName] = useState(list?.name || '')
    const [often, setOften] = useState(list ? oftenOf(list) : 'weeks:1')
    const [startsOn, setStartsOn] = useState(list?.starts_on || todayISO())
    const [finishBy, setFinishBy] = useState(list?.finish_by || '')
    const [saving, setSaving] = useState(false)

    const changed = !list || name.trim() !== list.name || often !== oftenOf(list)
        || startsOn !== list.starts_on || (finishBy || null) !== (list.finish_by || null)
    const weeks = often.startsWith('weeks:') ? Number(often.slice(6)) : null

    async function save(e) {
        e.preventDefault()
        if (!name.trim()) return
        setSaving(true)
        const row = {
            name: name.trim(),
            repeats: weeks ? 'weeks' : often,
            every_weeks: weeks,
            starts_on: startsOn || todayISO(),
            finish_by: often === 'once' && finishBy ? finishBy : null,
        }
        const { data, error } = list
            ? await supabase.from('checklists').update(row).eq('id', list.id).select().single()
            : await supabase.from('checklists').insert({ ...row, restaurant_id: restaurantId, created_by: userId, sort_order: 0 }).select().single()
        setSaving(false)
        if (error) {
            onError(error.code === '23514' && row.finish_by ? 'The day to finish by cannot be before the day it starts.' : friendlyError(error))
            return
        }
        onSaved(data)
    }

    return (
        <form onSubmit={save} className={`${card} p-5 space-y-4`}>
            <div>
                <label htmlFor="list-name" className={labelClass}>Name</label>
                <input id="list-name" className={fieldClass} value={name} onChange={e => setName(e.target.value)} placeholder="Weekly deep clean" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <label htmlFor="list-often" className={labelClass}>How often</label>
                    <select id="list-often" className={fieldClass} value={often} onChange={e => setOften(e.target.value)}>
                        {HOW_OFTEN.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <p className={hintClass}>
                        {often === 'monthly'
                            ? 'Due once every calendar month. The weekly report only warns when a month ends with it not finished.'
                            : often === 'once'
                                ? 'Done one time only, like getting ready for an inspection.'
                                : weeks === 1
                                    ? 'Due every week, Sunday to Saturday.'
                                    : `Due once every ${weeks} weeks. The weekly report only warns when the ${weeks} weeks end with it not finished.`}
                    </p>
                </div>
                {(often === 'once' || (weeks && weeks > 1)) && (
                    <div>
                        <label htmlFor="list-starts" className={labelClass}>{often === 'once' ? 'Can be started from' : 'Counting from the week of'}</label>
                        <input id="list-starts" type="date" className={fieldClass} value={startsOn} onChange={e => setStartsOn(e.target.value)} />
                    </div>
                )}
                {often === 'once' && (
                    <div>
                        <label htmlFor="list-finish" className={labelClass}>Finish by (optional)</label>
                        <input id="list-finish" type="date" className={fieldClass} value={finishBy} min={startsOn} onChange={e => setFinishBy(e.target.value)} />
                        <p className={hintClass}>After this day the weekly report says it is late.</p>
                    </div>
                )}
            </div>
            <div className="flex justify-end">
                <button type="submit" disabled={saving || !name.trim() || !changed} className={primaryButton()}>
                    {saving ? 'Saving...' : list ? 'Save' : 'Make the list'}
                </button>
            </div>
        </form>
    )
}

// Adding or changing one element or sub element.
function TaskDialog({ list, editing, restaurantId, onClose, onSaved }) {
    const task = editing.task
    const isSub = Boolean(editing.parent || task?.parent_id)
    const [name, setName] = useState(task?.name || '')
    const [howTo, setHowTo] = useState(task?.how_to || '')
    // Up to four, his number, 27 September: the same as a tick's photos.
    const original = task?.guide_photos || []
    const [pictures, setPictures] = useState(original)
    const [needsPhoto, setNeedsPhoto] = useState(Boolean(task?.needs_photo))
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    // Uploaded while this was open and not saved to anything yet.
    const fresh = pictures.filter(p => !original.includes(p))

    async function close() {
        if (fresh.length) await supabase.storage.from(PHOTO_BUCKET).remove(fresh)
        onClose()
    }

    // A picture only this dialog knows about goes straight away. One already
    // saved stays until Save, so Cancel still puts it back.
    function takeOff(path) {
        if (fresh.includes(path)) supabase.storage.from(PHOTO_BUCKET).remove([path])
        setPictures(before => before.filter(p => p !== path))
    }

    async function save(e) {
        e.preventDefault()
        if (!name.trim()) return
        setSaving(true)
        setError('')
        const row = { name: name.trim(), how_to: howTo.trim() || null, guide_photos: pictures, needs_photo: needsPhoto }
        const { error: saveErr } = task
            ? await supabase.from('checklist_tasks').update(row).eq('id', task.id)
            : await supabase.from('checklist_tasks').insert({
                ...row,
                checklist_id: list.id,
                category_id: editing.categoryId || editing.parent?.category_id,
                parent_id: editing.parent?.id || null,
                sort_order: editing.order ?? 0,
            })
        setSaving(false)
        if (saveErr) { setError(friendlyError(saveErr)); return }
        // The pictures taken away are not needed by anything now.
        const gone = original.filter(p => !pictures.includes(p))
        if (gone.length) await supabase.storage.from(PHOTO_BUCKET).remove(gone)
        onSaved()
    }

    const title = task ? `Edit ${task.name}` : isSub ? `Add under ${editing.parent.name}` : 'Add an element'

    return (
        <Modal title={title} onClose={close} width="max-w-lg">
            <form onSubmit={save}>
                <div className="px-6 py-5 space-y-4">
                    <ErrorBanner>{error}</ErrorBanner>
                    <div>
                        <label htmlFor="task-name" className={labelClass}>{isSub ? 'Sub element' : 'Element'}</label>
                        <input
                            id="task-name"
                            className={fieldClass}
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder={isSub ? 'Clean under the toaster' : 'Small toaster area'}
                            required
                            autoFocus
                        />
                    </div>
                    <div>
                        <label htmlFor="task-how" className={labelClass}>How to do it (optional)</label>
                        <AutoTextarea
                            id="task-how"
                            className={fieldClass}
                            minRows={2}
                            value={howTo}
                            onChange={e => setHowTo(e.target.value)}
                            placeholder="Use the green spray and the blue roll."
                        />
                    </div>
                    <div>
                        <p className={labelClass}>Pictures showing what is meant (optional, up to {MAX_PICTURES})</p>
                        <PhotoStrip paths={pictures} onRemove={takeOff} label="Picture" />
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                            <PhotoButton
                                restaurantId={restaurantId}
                                kind="guide"
                                room={MAX_PICTURES - pictures.length}
                                onAdded={path => setPictures(before => [...before, path])}
                                onError={setError}
                            >
                                {pictures.length ? 'Add another picture' : 'Add picture'}
                            </PhotoButton>
                            {pictures.length >= MAX_PICTURES && <span className="text-xs text-muted">That is the most allowed.</span>}
                        </div>
                        <p className={hintClass}>Staff see a button for them and open them only if they need to.</p>
                    </div>
                    {!editing.hasSubs && (
                        <label className={`${checkRow} cursor-pointer`}>
                            <input type="checkbox" className={checkbox} checked={needsPhoto} onChange={e => setNeedsPhoto(e.target.checked)} />
                            <span>
                                <span className="text-sm font-medium text-gray-900 block">Needs a photo to be ticked</span>
                                <span className={hintClass}>Staff take a photo of it done, or pick one from their gallery.</span>
                            </span>
                        </label>
                    )}
                    {editing.hasSubs && (
                        <p className={hintClass}>This element is ticked through its sub elements, so a photo is asked for on those instead.</p>
                    )}
                </div>
                <div className={modalFooter}>
                    <button type="button" onClick={close} className={secondaryButton}>Cancel</button>
                    <button type="submit" disabled={saving || !name.trim()} className={primaryButton()}>{saving ? 'Saving...' : 'Save'}</button>
                </div>
            </form>
        </Modal>
    )
}

function RenameDialog({ category, onClose, onSaved }) {
    const [name, setName] = useState(category.name)
    const [error, setError] = useState('')

    async function save(e) {
        e.preventDefault()
        if (!name.trim()) return
        const { error: saveErr } = await supabase.from('checklist_categories').update({ name: name.trim() }).eq('id', category.id)
        if (saveErr) { setError(friendlyError(saveErr)); return }
        onSaved()
    }

    return (
        <Modal title={`Rename ${category.name}`} onClose={onClose} width="max-w-md">
            <form onSubmit={save}>
                <div className="px-6 py-5">
                    <ErrorBanner className="mb-3">{error}</ErrorBanner>
                    <label htmlFor="category-name" className={labelClass}>Category</label>
                    <input id="category-name" className={fieldClass} value={name} onChange={e => setName(e.target.value)} autoFocus required />
                </div>
                <div className={modalFooter}>
                    <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                    <button type="submit" disabled={!name.trim()} className={primaryButton()}>Save</button>
                </div>
            </form>
        </Modal>
    )
}
