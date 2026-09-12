import { useState } from 'react'
import { cardHeader } from '../../lib/controlStyles'
import { isOwnSection } from '../../lib/weeklyReport'
import { useConfirm } from '../../context/ConfirmContext'

// The bar across the top of a section, and the two things that can be done to
// one somebody added themselves: rename it, or drop it. The seven the report
// comes with allow neither, so on those this is just a heading.
//
// Renaming is safe because the key underneath never changes. That is why the
// two are separate columns in the first place: a section can be called anything
// without orphaning a single note inside it, the same reason sales_tenders
// keeps its key apart from its label.
//
// A section dropped this week simply stops carrying into next week. Every
// earlier report keeps its own copy, so nothing already sent changes.

export default function ReportSectionHead({ section, canEdit, onRename, onRemove, note }) {
    const confirm = useConfirm()
    const own = canEdit && isOwnSection(section)
    const [renaming, setRenaming] = useState(false)
    const [title, setTitle] = useState(section.title)

    async function commit() {
        setRenaming(false)
        const next = title.trim()
        if (!next || next === section.title) { setTitle(section.title); return }
        await onRename(section.id, next)
    }

    async function drop() {
        const ok = await confirm({
            title: `Drop ${section.title}?`,
            message: 'Everything written in it this week goes with it, and it stops appearing on the weeks '
                + 'after. Reports already sent keep their own copy and do not change.',
            confirmLabel: 'Drop it',
        })
        if (ok) onRemove(section.id)
    }

    return (
        <div className={`${cardHeader} rounded-t-xl flex flex-wrap items-center justify-between gap-x-3 gap-y-2`}>
            {renaming ? (
                <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    onBlur={commit}
                    onKeyDown={e => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') { setTitle(section.title); setRenaming(false) }
                    }}
                    autoFocus
                    aria-label="What this section is called"
                    className="flex-1 min-w-[8rem] bg-white/15 border border-white/40 rounded px-2 py-1 text-white text-xs font-bold uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-white/60"
                />
            ) : (
                <span className="min-w-0">{section.title}</span>
            )}

            <span className="flex items-center gap-3 flex-shrink-0">
                {note && (
                    <span className="normal-case tracking-normal font-semibold text-[11px] opacity-75">
                        {note}
                    </span>
                )}

                {own && !renaming && (
                    <button
                        onClick={() => { setTitle(section.title); setRenaming(true) }}
                        className="normal-case tracking-normal text-[11px] font-semibold opacity-75 hover:opacity-100 transition-opacity"
                    >
                        Rename
                    </button>
                )}

                {own && !renaming && (
                    <button
                        onClick={drop}
                        aria-label={`Drop the ${section.title} section`}
                        className="normal-case tracking-normal text-[11px] font-semibold opacity-75 hover:opacity-100 transition-opacity"
                    >
                        Drop
                    </button>
                )}
            </span>
        </div>
    )
}
