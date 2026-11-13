import { useState } from 'react'
import AddButton from '@/components/ui/AddButton'
import { card, fieldClass, primaryButton, secondaryButton } from '@/lib/controlStyles'

// A section of the restaurant's own, at the foot of a report. It carries to
// the next report of the same kind, weekly or monthly, and can be removed.
export default function AddSection({ onAdd }) {
    const [open, setOpen] = useState(false)
    const [title, setTitle] = useState('')

    if (!open) {
        return (
            <AddButton onClick={() => setOpen(true)}>Add a section</AddButton>
        )
    }

    return (
        <div className={`${card} p-4`}>
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">A section of your own</p>
            <div className="flex flex-wrap gap-2">
                <div className="flex-1 min-w-[12rem]">
                    <input
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') { setTitle(''); setOpen(false) } }}
                        autoFocus
                        placeholder="What is it called"
                        className={fieldClass}
                    />
                </div>
                <button
                    onClick={async () => {
                        if (!title.trim()) return
                        await onAdd(title.trim())
                        setTitle('')
                        setOpen(false)
                    }}
                    className={primaryButton()}
                >
                    Add
                </button>
                <button
                    onClick={() => { setTitle(''); setOpen(false) }}
                    className={secondaryButton}
                >
                    Cancel
                </button>
            </div>
            <p className="text-xs text-muted mt-2">
                It appears on every report from now on, and can be removed at any time.
            </p>
        </div>
    )
}
