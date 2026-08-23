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
export function ModalSectionBar({ title, className = '' }) {
    return <div className={`${modalSectionHeader} -mx-6 mb-4 ${className}`}>{title}</div>
}

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
