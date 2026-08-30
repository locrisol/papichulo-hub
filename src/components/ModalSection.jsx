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
    //
    // The chevron sits with the title rather than out at the far end, so the
    // toggle is one thing you press and everything to the right of it belongs
    // to the section rather than to the opening and closing of it. The action
    // comes before the summary, since the summary is what the action answers.
    //
    // It wraps on a narrow screen. A section can carry a control with real
    // words on it, and real words plus a heading plus a summary do not fit
    // across a phone.
    return (
        <div className={`${modalSectionHeader} ${edge} -mx-6 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 ${className}`}>
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                className="flex items-center gap-2 text-left py-2.5 -my-2.5"
            >
                <span>{title}</span>
                <svg
                    className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {action && <span className="ml-auto">{action}</span>}

            {summary && (
                <span className={`${action ? '' : 'ml-auto'} normal-case tracking-normal font-semibold text-sidebar/70`}>
                    {summary}
                </span>
            )}
        </div>
    )
}

// A small control living on a section bar, for the one answer that can be
// given without opening the section at all.
export const sectionBarAction =
    'px-3 py-1.5 rounded-full bg-white border border-sidebar/30 text-sidebar '
    + 'text-xs font-bold normal-case tracking-normal text-left '
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
