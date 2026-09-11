import { useRef, useState } from 'react'
import { weeksOpen } from '../../lib/weeklyReport'
import { useRemoveCard } from './useRemoveCard'
import { removeButton } from '../../lib/controlStyles'
import AutoTextarea from '../AutoTextarea'
import AddButton from '../AddButton'

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

export default function ReportActions({ section, weekStart, canEdit, onAdd, onSave, onRemove }) {
    const removeCard = useRemoveCard()
    const [adding, setAdding] = useState('')
    const [busy, setBusy] = useState(false)
    const pending = useRef(false)

    const actions = section.items.filter(i => i.kind === 'action')
    // Longest open first. The one that has been waiting since July is the one
    // worth reading, and it is the one an ordinary list would bury at the top
    // where nobody scrolls to.
    const ordered = actions.slice().sort((a, b) => {
        if (!!a.done_on !== !!b.done_on) return a.done_on ? 1 : -1
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
                These carry from week to week on their own until they are ticked off. Nothing has to be retyped,
                and nothing quietly disappears because somebody forgot to mention it again. Tick one that is
                done; remove one that should never have been here.
            </p>

            <div className="space-y-2">
                {ordered.map(item => {
                    const done = !!item.done_on
                    return (
                        <div
                            key={item.id}
                            className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
                                done ? 'border-border bg-app-bg' : 'border-border bg-white'}`}
                        >
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
                                {canEdit && !done ? (
                                    <AutoTextarea
                                        defaultValue={item.label || ''}
                                        onBlur={e => {
                                            const text = e.target.value.trim()
                                            if (!text) return onRemove(item.id)
                                            if (text !== item.label) onSave(item.id, { label: text })
                                        }}
                                        className="w-full bg-transparent text-sm text-gray-800 focus:outline-none"
                                    />
                                ) : (
                                    <p className={`text-sm ${done ? 'text-muted line-through' : 'text-gray-800'}`}>
                                        {item.label}
                                    </p>
                                )}
                            </div>

                            <span className="flex-shrink-0 text-xs text-muted whitespace-nowrap mt-0.5">
                                {done ? 'closed this week' : weeksWords(weeksOpen(item, weekStart))}
                            </span>

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
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                    />
                    {adding.trim() && (
                        <AddButton
                            className="mt-2 w-full sm:w-auto justify-center"
                            disabled={busy}
                            keepFocus
                            onClick={add}
                        >
                            {busy ? 'Adding' : 'Add task'}
                        </AddButton>
                    )}
                </div>
            )}
        </div>
    )
}
