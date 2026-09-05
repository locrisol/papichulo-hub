import { useState } from 'react'

// The comments on a section: one card each, one thought each.
//
// Not a single text box. A week's notes on packaging are rarely one thing, and
// a paragraph holding four unrelated remarks cannot be read quickly, cannot be
// removed one at a time, and reads as an essay in the mail. A card each means
// each one arrives on its own line and can be dropped without editing around
// it.
//
// Editing is in place and saves when you leave the box. There is no save
// button, because a comment is a sentence and a sentence does not need
// ceremony. Leaving it empty removes it, which is what emptying a note means.

export default function ReportComments({ items, canEdit, onAdd, onSave, onRemove, label = 'Comments' }) {
    const [adding, setAdding] = useState('')
    const [busy, setBusy] = useState(false)

    async function add() {
        const text = adding.trim()
        if (!text) return
        setBusy(true)
        await onAdd(text)
        setAdding('')
        setBusy(false)
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
                                onClick={() => onRemove(item.id)}
                                aria-label="Remove this comment"
                                className="text-gray-400 hover:text-red-600 transition-colors text-lg leading-none px-1"
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
                        placeholder="Add a comment"
                        rows={2}
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                    />
                    {adding.trim() && (
                        <button
                            onClick={add}
                            disabled={busy}
                            className="mt-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold shadow-sm hover:bg-accent-ink transition-colors disabled:opacity-50"
                        >
                            {busy ? 'Adding' : 'Add comment'}
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
