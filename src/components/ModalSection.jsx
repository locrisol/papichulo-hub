import { modalSectionHeader } from '../lib/controlStyles'

// One part of a dialog.
//
// A filled bar in the app's dark green, the same family as the table headings
// and the card headings, and the description underneath it on white where it can
// actually be read.
//
// A tenth of the strength of the dialog's own heading, with the green as the
// text rather than the ground. At full strength the two bars sat on top of each
// other and a dialog opened looking like it had one very tall heading with two
// lines in it.
//
// This is the third attempt at it. A plain bold label was not enough of a break,
// and neither was a rule under the label, because both of them read as text with
// a line near it rather than as a heading. The rest of the project had already
// settled this: everywhere else a heading is a filled row, on the sales tables,
// on the till receipt rows, on every card. A dialog had no business inventing a
// fourth way of doing it.
//
// The description is a prop rather than something the caller writes first,
// because that is the bit that kept coming out in a different size and colour in
// each dialog.
// A heading on its own, for a dialog whose body is already one scrolling block
// and cannot easily be cut into sections. The negative margin is what lets it
// reach both edges from inside the padding, which is the whole point of it: a
// bar that stops short of the edges is not a heading, it is a box.
//
// It can also collapse what is under it, which is what the product form needed:
// a form that asks for the supplier and the fourteen allergens all at once is a
// wall, and most of the time you are typing a name and a section and nothing
// else. Collapsing is on the bar rather than on a separate control because the
// bar is already the thing that says where one part ends and the next begins.
//
// tone puts a colour down the left edge. It is the only thing that changes
// between one section and the next: the bar stays the app's one section bar,
// because two sections in the same form inventing two looks is how a form ends
// up reading as three different screens.
const TONES = {
    supplier: 'border-l-4 border-l-blue-500',
    allergens: 'border-l-4 border-l-amber-500',
}

export function ModalSectionBar({
    title, summary, tone, collapsible = false, open = true, onToggle, action, className = '',
}) {
    const edge = TONES[tone] || ''

    if (!collapsible) {
        return <div className={`${modalSectionHeader} ${edge} -mx-6 mb-4 ${className}`}>{title}</div>
    }

    // A div holding a button rather than one big button, because a section can
    // carry an action of its own and a button inside a button is not a thing.
    // The negative vertical margin on the toggle is so the tappable part is the
    // whole height of the bar and not just the line of text in the middle of it.
    return (
        <div className={`${modalSectionHeader} ${edge} -mx-6 mb-4 flex items-center gap-3 ${className}`}>
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                className="flex-1 min-w-0 flex items-center gap-3 text-left py-2.5 -my-2.5"
            >
                <span>{title}</span>
                {summary && (
                    <span className="ml-auto normal-case tracking-normal font-semibold text-sidebar/70 truncate">
                        {summary}
                    </span>
                )}
                <svg
                    className={`w-4 h-4 flex-shrink-0 transition-transform ${summary ? '' : 'ml-auto'} ${open ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {action}
        </div>
    )
}

// A small control living on a section bar, for the one answer that can be
// given without opening the section at all.
export const sectionBarAction =
    'flex-shrink-0 px-3 py-1.5 rounded-full bg-white border border-sidebar/30 text-sidebar '
    + 'text-xs font-bold normal-case tracking-normal whitespace-nowrap '
    + 'transition-colors hover:bg-sidebar hover:text-white'

export default function ModalSection({ title, description, children, className = '' }) {
    return (
        <div>
            {title && <div className={modalSectionHeader}>{title}</div>}
            <div className={`px-6 py-4 ${className}`}>
                {description && (
                    <p className="text-xs text-muted mb-3 leading-relaxed">{description}</p>
                )}
                {children}
            </div>
        </div>
    )
}
