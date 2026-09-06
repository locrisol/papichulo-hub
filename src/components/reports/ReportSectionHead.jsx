import { cardHeader } from '../../lib/controlStyles'
import { canDropSection } from '../../lib/weeklyReport'
import { useConfirm } from '../../context/ConfirmContext'

// The bar across the top of a section.
//
// The only thing that can be done to one is drop it, and only to a section
// somebody added themselves. The seven the report comes with are its shape, and
// a report whose headings move around week to week is harder to read than one
// with an empty section in it.
//
// Nothing is renamed here either. A heading that says one thing in August and
// another in September is the same problem in slower motion, and the overhead
// lines are where naming is actually somebody's own business.
//
// A section dropped this week simply stops carrying into next week. Every
// earlier report keeps its own copy, so nothing already sent changes.

export default function ReportSectionHead({ section, canEdit, onRemove, note }) {
    const confirm = useConfirm()

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
            <span className="min-w-0">{section.title}</span>

            <span className="flex items-center gap-3 flex-shrink-0">
                {note && (
                    <span className="normal-case tracking-normal font-semibold text-[11px] opacity-75">
                        {note}
                    </span>
                )}

                {canEdit && canDropSection(section) && (
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
