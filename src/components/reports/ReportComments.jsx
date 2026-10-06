import { useRef, useState } from 'react'
import { useRemoveCard } from '@/components/reports/useRemoveCard'
import { removeButton, fieldClass } from '@/lib/controlStyles'
import AddButton from '@/components/ui/AddButton'
import RichEditor from '@/components/ui/RichEditor'
import RichText from '@/components/ui/RichText'
import { richOf, richPlain } from '@/lib/richText'

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
    // A new box after each comment is added: the box keeps its own words while
    // it is being typed in, and pressing Add leaves it being typed in.
    const [fresh, setFresh] = useState(0)
    const [busy, setBusy] = useState(false)
    const pending = useRef(false)

    // Comments are formatted (his, 7 October): bold, colour and size, stored
    // as the few marks in richText and said the same way in the mail.
    async function add(text = adding) {
        if (!richPlain(text).trim() || pending.current) return
        pending.current = true
        setBusy(true)
        // Cleared first. The write reloads the page's data and the new card
        // arrives from there, so leaving the text in the box until it returns
        // shows the same comment twice for as long as the round trip takes.
        setAdding('')
        setFresh(n => n + 1)
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
                            <div className="flex-1 min-w-0">
                                <RichEditor
                                    value={richOf(item)}
                                    label="Comment"
                                    onCommit={text => {
                                        if (text === richOf(item)) return
                                        if (!richPlain(text).trim()) return onRemove(item.id)
                                        onSave(item.id, text)
                                    }}
                                    className="bg-transparent text-base pointer-fine:text-sm text-gray-800 focus:outline-none"
                                />
                            </div>
                        ) : (
                            <RichText text={item.note} rich={item.meta?.rich} className="flex-1 text-sm text-gray-800" />
                        )}

                        {canEdit && (
                            <button
                                onClick={() => removeCard({
                                    what: 'comment',
                                    holds: item.meta?.rich ? richPlain(item.note) : item.note,
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
                    <RichEditor
                        key={fresh}
                        value=""
                        minRows={2}
                        onChange={setAdding}
                        onCommit={add}
                        placeholder="Add a comment"
                        className={fieldClass}
                    />
                    {richPlain(adding).trim() && (
                        <AddButton
                            className="mt-2 w-full sm:w-auto justify-center"
                            disabled={busy}
                            keepFocus
                            onClick={() => add()}
                        >
                            {busy ? 'Adding...' : 'Add comment'}
                        </AddButton>
                    )}
                </div>
            )}
        </div>
    )
}
