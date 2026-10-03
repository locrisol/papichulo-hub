import { useNavigate } from 'react-router-dom'
import { iconButton, secondaryButton } from '@/lib/controlStyles'

// Going back, as a button.
//
// Every screen that had one wrote its own, and they had drifted: some were a
// small grey text link, some accent orange, one was a bare arrow. All of them
// were text.
//
// Text is the wrong thing for this. It is the first control on the page and
// often the only one at the top, and a line of prose eleven pixels tall is
// hard to hit with a thumb, hard to see against a heading, and does not look
// like something that does anything. The rest of the app already decided that
// secondary controls are white boxes with a visible edge, for exactly these
// reasons. This is that decision reaching the last set of controls that had
// escaped it.
//
// It takes `to` rather than calling history back, so it always lands somewhere
// known. Browser back on a page reached by a link from a mail, or after a form
// redirect, goes somewhere nobody expects.
//
// With no words it is the arrow on its own, for the bar over a stock take or
// a checklist round where the title beside it already says where you are. The
// arrow there was a bare twenty pixel glyph, so it takes iconButton's thumb
// sized target, and `label` is what a screen reader says for it.
export default function BackButton({ to, label = 'Back', children, className = '' }) {
    const navigate = useNavigate()

    if (!children) {
        return (
            <button
                type="button"
                onClick={() => navigate(to)}
                aria-label={label}
                className={`${iconButton} ${className}`}
            >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
            </button>
        )
    }

    return (
        <button
            type="button"
            onClick={() => navigate(to)}
            className={`${secondaryButton} inline-flex items-center gap-1.5 ${className}`}
        >
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4 flex-shrink-0"
                aria-hidden="true"
            >
                <path d="M15 18l-6-6 6-6" />
            </svg>
            {children}
        </button>
    )
}
