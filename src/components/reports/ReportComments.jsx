import { useRef, useState } from 'react'
import { useRemoveCard } from './useRemoveCard'
import { removeButton } from '../../lib/controlStyles'

// The comments on a section: one card each, one thought each.
//
// Not a single text box. A week's notes on packaging are rarely one thing, and
// a paragraph holding four unrelated remarks cannot be read quickly, cannot be
// removed one at a time, and reads as an essay in the mail. A card each means
// each one arrives on its own line and can be dropped without editing around
// it.
//
// Editing a card is in place and writes when you leave the box. Leaving one
// empty removes it, which is what emptying a note means.
//
// The box at the bottom does both: it writes when you leave it, AND it offers a
// button once there is something in it. Neither on its own is enough. Without
// the button there is nothing on a phone to press, where tapping away from a
// box is not an obvious act and dismissing the keyboard may not blur it at all.
// Without the blur, a paragraph is lost by whoever forgets to press the button.
//
// The button refuses focus on the way down, so pressing it cannot blur the box
// and run both paths at once. The ref catches it anyway if a browser does it
// differently.

export default function ReportComments({ items, canEdit, onAdd, onSave, onRemove, label = 'Comments' }) {
    const removeCard = useRemoveCard()
    const [adding, setAdding] = useState('')
    const [busy, setBusy] = useState(false)
    const pending = useRef(false)

    async function add() {
        const text = adding.trim()
        if (!text || pending.current) return
        pending.current = true
        setBusy(true)
        // Cleared first. The write reloads the page's data and the new card
        // arrives from there, so leaving the text in the box until it returns
        // shows the same comment twice for as long as the round trip takes.
        setAdding('')
        await onAdd(text)
        setBusy(false)
        pending.current = false
    }

    if (!canEdit && items.length === 0) return null

    return (
        <div className="mt-5">
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">{label}</p>

            <div className="space-y-2">
                {items.map(item => (
                    <div
                        key={item.id}
                        className="flex items-start gap-2 rounded-lg border border-border border-l-[3px] border-l-accent bg-app-bg px-3 py-2"
                    >
                        {canEdit ? (
                            <textarea
                                defaultValue={item.note || ''}
                                rows={Math.max(1, Math.ceil((item.note || '').length / 70))}
                                onBlur={e => {
                                    const text = e.target.value.trim()
                                    if (text === (item.note || '')) return
                                    if (!text) return onRemove(item.id)
                                    onSave(item.id, text)
                                }}
                                className="flex-1 bg-transparent text-sm text-gray-800 resize-none focus:outline-none"
                            />
                        ) : (
                            <p className="flex-1 text-sm text-gray-800">{item.note}</p>
                        )}

                        {canEdit && (
                            <button
                                onClick={() => removeCard({
                                    what: 'comment',
                                    holds: item.note,
                                    onRemove: () => onRemove(item.id),
                                })}
                                aria-label="Remove this comment"
                                className={removeButton}
                            >
                                &times;
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {canEdit && (
                <div className="mt-2">
                    <textarea
                        value={adding}
                        onChange={e => setAdding(e.target.value)}
                        onBlur={add}
                        placeholder="Add a comment"
                        rows={2}
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                    />
                    {adding.trim() && (
                        <button
                            onMouseDown={e => e.preventDefault()}
                            onClick={add}
                            disabled={busy}
                            className="mt-2 w-full sm:w-auto px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold shadow-sm hover:bg-accent-ink transition-colors disabled:opacity-50"
                        >
                            {busy ? 'Adding' : 'Add comment'}
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
