import { secondaryButton } from '../lib/controlStyles'

// Adding a line, a refund, a section: the small add that lives inside a panel
// rather than at the top of a page.
//
// These were text links with a plus typed in front of them, which is the same
// fault the back links had. A line of orange prose is hard to hit with a thumb,
// hard to pick out of a page that already has orange in it, and does not look
// like something that does anything until you have already found it once.
//
// It is a secondary button, not an accent one. The app's rule is that the
// accent belongs to the one main action on a screen, and a report has half a
// dozen of these: six orange buttons down a page is six things shouting and
// nothing leading.
//
// The plus is drawn rather than typed, so it sits on the centre line of the
// text instead of hanging where the font happens to put it.
//
// `keepFocus` is for the two of these that commit something already typed into
// a box beside them. Without it, pressing the button blurs the box first, the
// box saves on blur, and then the click saves the same thing again.
export default function AddButton({ onClick, children, className = '', disabled, keepFocus }) {
    return (
        <button
            type="button"
            onClick={onClick}
            onMouseDown={keepFocus ? e => e.preventDefault() : undefined}
            disabled={disabled}
            className={`${secondaryButton} inline-flex items-center gap-1.5 ${className}`}
        >
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="w-3.5 h-3.5 flex-shrink-0"
                aria-hidden="true"
            >
                <path d="M12 5v14M5 12h14" />
            </svg>
            {children}
        </button>
    )
}
