import { useEffect, useRef, useState } from 'react'
import { weeksOpen } from '@/lib/weeklyReport'
import { useRemoveCard } from '@/components/reports/useRemoveCard'
import { removeButton, fieldClass, denseField } from '@/lib/controlStyles'
import AutoTextarea from '@/components/ui/AutoTextarea'
import AddButton from '@/components/ui/AddButton'
import RichEditor from '@/components/ui/RichEditor'
import RichText from '@/components/ui/RichText'
import { richPlain } from '@/lib/richText'
import { newGroupId } from '@/lib/priceEvents'
import { shortDate, todayISO } from '@/lib/dates'

// Support and actions needed: the running list.
//
// These do not belong to a week. An action raised in July that nobody has done
// is still needed in September, so it carries from report to report until it is
// ticked off, and it carries how long it has been open with it.
//
// That is the whole point of the section. In the old mail every item was
// retyped each week from the week before, which meant one that was quietly
// dropped looked exactly like one that was finished, and nothing anywhere said
// a thing had been sitting there for two months. "4 weeks open" beside it is
// what makes somebody act.
//
// Ticking one off does not delete it. It stays on this week's report, struck
// through, so the week it was finished is on the record, and then it stops
// carrying.
//
// Removing is the other thing, and both are needed. Ticked means it was done.
// Removed means it should never have been on the list, and it goes without
// leaving a trace. Only from this week: an earlier report holds its own copy
// and is not touched, which is what makes removing safe to offer.

function weeksWords(n) {
    if (n === 0) return 'raised this week'
    if (n === 1) return '1 week open'
    return `${n} weeks open`
}

// Comments on one action (his, 7 October), kept on the action and carried
// with it, so what was said about the extractor fan in July is still under it
// in September. Each has the day it was written. This week's can be changed or
// taken off; an earlier week's went out on that week's report and stays.
export function ActionComments({ item, weekStart, canEdit, onSave }) {
    // Only ever a list: what is stored comes from the database.
    const comments = (Array.isArray(item.meta?.comments) ? item.meta.comments : [])
        .filter(c => c && typeof c === 'object')
    const [open, setOpen] = useState(false)
    const [draft, setDraft] = useState('')
    const [fresh, setFresh] = useState(0)

    // Every change is made to the latest list, not the one on screen. Editing
    // one and then removing another saved the edit and then a list from
    // before it, which lost the edit.
    const latest = useRef(comments)
    const shown = JSON.stringify(comments)
    useEffect(() => { latest.current = JSON.parse(shown) }, [shown])

    function save(change) {
        latest.current = change(latest.current)
        return onSave(item.id, { meta: { ...(item.meta || {}), comments: latest.current } })
    }

    async function add(text = draft) {
        if (!richPlain(text).trim()) return
        setDraft('')
        setFresh(n => n + 1)
        setOpen(false)
        await save(list => [...list, { id: newGroupId(), on: todayISO(), week: weekStart, text }])
    }

    return (
        <div className="pl-9 mt-1.5 space-y-1.5">
            {comments.map(c => {
                const mine = canEdit && c.week === weekStart
                return (
                    <div key={c.id} className="flex items-start gap-2 border-l-2 border-accent/40 pl-2">
                        <span className="text-xs text-muted whitespace-nowrap mt-0.5">{shortDate(c.on)}</span>
                        <div className="flex-1 min-w-0">
                            {mine ? (
                                <RichEditor
                                    value={c.text}
                                    label="Comment on this action"
                                    onCommit={text => {
                                        if (text === c.text) return
                                        save(list => (richPlain(text).trim()
                                            ? list.map(x => (x.id === c.id ? { ...x, text } : x))
                                            : list.filter(x => x.id !== c.id)))
                                    }}
                                    className="bg-transparent text-base pointer-fine:text-sm text-gray-800 focus:outline-none"
                                />
                            ) : (
                                <RichText text={c.text} rich className="text-sm text-gray-800" />
                            )}
                        </div>
                        {mine && (
                            <button
                                onClick={() => save(list => list.filter(x => x.id !== c.id))}
                                aria-label="Remove this comment"
                                className={removeButton}
                            >
                                &times;
                            </button>
                        )}
                    </div>
                )
            })}

            {canEdit && (open ? (
                <div>
                    <RichEditor
                        key={fresh}
                        value=""
                        minRows={1}
                        placeholder="Add a comment"
                        label="Add a comment on this action"
                        onChange={setDraft}
                        onCommit={text => (richPlain(text).trim() ? add(text) : setOpen(false))}
                        className={fieldClass}
                    />
                    {richPlain(draft).trim() && (
                        <AddButton className="mt-2" keepFocus onClick={() => add()}>Add comment</AddButton>
                    )}
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="text-xs font-semibold text-muted hover:text-accent-ink"
                >
                    + Comment
                </button>
            ))}
        </div>
    )
}

export default function ReportActions({ section, weekStart, canEdit, onAdd, onSave, onRemove }) {
    const removeCard = useRemoveCard()
    // The one being changed, opened by its Edit or by pressing its words.
    const [editingId, setEditingId] = useState(null)
    const cancelled = useRef(false)
    const [adding, setAdding] = useState('')
    const [busy, setBusy] = useState(false)
    const pending = useRef(false)

    const actions = section.items.filter(i => i.kind === 'action')
    // Longest open first. The one that has been waiting since July is the one
    // worth reading, and it is the one an ordinary list would bury at the top
    // where nobody scrolls to.
    // Done this week on top (his, 8 October): what got done is the first thing
    // worth reading, and it is only on this week's report.
    const ordered = actions.slice().sort((a, b) => {
        if (!!a.done_on !== !!b.done_on) return a.done_on ? -1 : 1
        return weeksOpen(b, weekStart) - weeksOpen(a, weekStart)
    })

    // Saves when you leave the box, and offers a button as well. On a phone
    // there has to be something to press: tapping away from a box is not an
    // obvious act, and dismissing the keyboard may not blur it at all.
    async function add() {
        const text = adding.trim()
        if (!text || pending.current) return
        pending.current = true
        setBusy(true)
        setAdding('')
        await onAdd(text, weekStart)
        setBusy(false)
        pending.current = false
    }

    return (
        <div>
            <p className="text-sm text-muted mb-3">
                These carry over from week to week until they are ticked off. Tick one when it is done, or
                remove it if it should not be on the list.
            </p>

            <div className="space-y-2">
                {ordered.map(item => {
                    const done = !!item.done_on
                    return (
                        // The age sits under the text rather than beside it.
                        //
                        // This row had four things on one line: the tick, the
                        // text, "3 weeks open" with whitespace-nowrap, and the
                        // remove. Only the text carried min-w-0, so only the
                        // text was allowed to give way, and on a phone it gave
                        // way until it was one word wide and the item read
                        // straight down the page a word at a time.
                        //
                        // More width was never the answer, because the ends of
                        // the row will not yield at any width. Taking the
                        // stubborn one off the row is. It goes back up beside
                        // the text from sm, where there is room for both.
                        <div
                            key={item.id}
                            className={`rounded-lg border px-3 py-2.5 ${
                                done ? 'border-border bg-app-bg' : 'border-border bg-white'}`}
                        >
                        <div className="flex items-start gap-3">
                            <button
                                onClick={() => canEdit && onSave(item.id, { done_on: done ? null : weekStart })}
                                disabled={!canEdit}
                                role="checkbox"
                                aria-checked={done}
                                aria-label={done ? 'Reopen this action' : 'Mark this action done'}
                                // A real target rather than a 14px square. This
                                // is the control the section exists for and it
                                // gets pressed with a thumb.
                                className={`flex-shrink-0 mt-0.5 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                                    done
                                        ? 'bg-green-700 border-green-700 text-white'
                                        : 'border-gray-300 bg-white hover:border-accent'} ${
                                    canEdit ? 'cursor-pointer' : 'cursor-default'}`}
                            >
                                {done && <span className="text-sm leading-none">✓</span>}
                            </button>

                            <div className="flex-1 min-w-0">
                                {canEdit && !done && editingId === item.id ? (
                                    <AutoTextarea
                                        defaultValue={item.label || ''}
                                        autoFocus
                                        aria-label="What needs doing"
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur() }
                                            if (e.key === 'Escape') { cancelled.current = true; e.currentTarget.blur() }
                                        }}
                                        onBlur={e => {
                                            setEditingId(null)
                                            if (cancelled.current) { cancelled.current = false; return }
                                            const text = e.target.value.trim()
                                            if (!text) return onRemove(item.id)
                                            if (text !== item.label) onSave(item.id, { label: text })
                                        }}
                                        className={denseField}
                                    />
                                ) : canEdit && !done ? (
                                    // The words open it too. It was always a box,
                                    // but one with no edge, and pressing it did
                                    // nothing anybody could see (his, 7 October).
                                    <button
                                        type="button"
                                        onClick={() => setEditingId(item.id)}
                                        className="w-full text-left text-sm text-gray-800 whitespace-pre-line break-words hover:text-accent-ink"
                                    >
                                        {item.label}
                                    </button>
                                ) : (
                                    <p className={`text-sm whitespace-pre-line break-words ${done ? 'text-muted line-through' : 'text-gray-800'}`}>
                                        {item.label}
                                    </p>
                                )}
                            </div>

                            <span className="hidden sm:block flex-shrink-0 text-xs text-muted whitespace-nowrap mt-0.5">
                                {done ? 'done this week' : weeksWords(weeksOpen(item, weekStart))}
                            </span>

                            {canEdit && !done && editingId !== item.id && (
                                <button
                                    type="button"
                                    onClick={() => setEditingId(item.id)}
                                    aria-label={`Edit: ${item.label}`}
                                    className="flex-shrink-0 min-h-[2.25rem] inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-accent-ink transition-colors"
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-3.5 h-3.5" aria-hidden="true">
                                        <path d="M4 20h4l10-10-4-4L4 16v4z" />
                                        <path d="M13.5 6.5l4 4" />
                                    </svg>
                                    Edit
                                </button>
                            )}

                            {canEdit && (
                                <button
                                    onClick={() => removeCard({
                                        what: 'task',
                                        holds: item.label,
                                        onRemove: () => onRemove(item.id),
                                    })}
                                    aria-label={`Remove: ${item.label}`}
                                    title="Remove this. Tick it instead if it was done."
                                    className={removeButton}
                                >
                                    &times;
                                </button>
                            )}
                        </div>

                        {/* Lined up under the text rather than under the tick,
                            so it reads as belonging to the item. */}
                        <p className="sm:hidden text-xs text-muted mt-1.5 pl-9">
                            {done ? 'done this week' : weeksWords(weeksOpen(item, weekStart))}
                        </p>
                        <ActionComments item={item} weekStart={weekStart} canEdit={canEdit} onSave={onSave} />
                        </div>
                    )
                })}

                {actions.length === 0 && (
                    <p className="text-sm text-muted">Nothing outstanding.</p>
                )}
            </div>

            {canEdit && (
                <div className="mt-3">
                    <AutoTextarea
                        value={adding}
                        minRows={2}
                        onChange={e => setAdding(e.target.value)}
                        onBlur={add}
                        placeholder="What needs doing"
                        className={fieldClass}
                    />
                    {adding.trim() && (
                        <AddButton
                            className="mt-2 w-full sm:w-auto justify-center"
                            disabled={busy}
                            keepFocus
                            onClick={add}
                        >
                            {busy ? 'Adding...' : 'Add task'}
                        </AddButton>
                    )}
                </div>
            )}
        </div>
    )
}
