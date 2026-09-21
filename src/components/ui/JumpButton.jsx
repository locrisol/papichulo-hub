import { jumpButton, jumpLabel } from '@/lib/controlStyles'

// The button that goes back to where a screen lives. "This week" when you are
// already on it, "Go to current week" when you are not, and the same pair for a
// day, a month, or the timesheet's last week.
//
// It is a component rather than two loose helpers for one reason, and it is
// not tidiness. The two labels are different lengths, so a button that shrinks
// to fit is a different width in each state. On the cost dashboard, the
// calendar and the week extras it sits between the two stepper arrows, so
// pressing back grows the label from "This week" to "Go to current week", the
// row grows with it, and the arrow that was under the pointer has moved. Going
// back four weeks is four presses in four different places.
//
// So it always takes the room the longer of its two labels needs. Both are
// drawn, one on top of the other in the same grid cell, and the one that does
// not apply is hidden rather than left out. That way the browser measures them
// in whatever font actually loaded, which is the thing a width in pixels
// cannot do: the fallback face is not the same width as DM Sans, and a number
// picked off this machine would be wrong on the first phone that had to wait
// for the font.
//
// Hidden here means visibility, not display: display would give the room back
// and put us where we started. It is marked hidden from a screen reader as
// well, and not left to the CSS to do it. Visibility alone does take a label
// out of what gets read, but only once the stylesheet is there, and a button
// that reads as "This weekGo to current week" for the one person who most
// needs it read properly is not a thing to leave to chance.
export default function JumpButton({ isCurrent, unit = 'week', onClick, className = '' }) {
    const label = (mine, on) => (
        <span
            className={`col-start-1 row-start-1 ${on ? '' : 'invisible'}`}
            aria-hidden={on ? undefined : 'true'}
        >
            {mine}
        </span>
    )

    return (
        <button
            type="button"
            onClick={onClick}
            className={`${jumpButton(isCurrent)} ${className}`.trim()}
        >
            <span className="grid">
                {label(jumpLabel(true, unit), isCurrent)}
                {label(jumpLabel(false, unit), !isCurrent)}
            </span>
        </button>
    )
}
