import { useEffect, useState } from 'react'
import { STATE_KEYS, kindOf } from '@/lib/timesheet'
import { stepFrom } from '@/components/timesheet/boxes'
import { kindOf as absenceKind } from '@/lib/absences'

// Every keyboard command, as a button.
//
// A store on a big tablet has no Tab, no Enter, no arrow keys and no letters
// without a keyboard that covers half the screen. Typing survives on touch: the
// boxes ask for the number pad and the colons put themselves in, so a time is
// six taps on big digits. **Moving and commanding are what break**, so they get
// buttons, one for one. Nothing here is reachable only from a keyboard.
//
// It is on for any touch screen rather than only for phones, because somebody
// with a keyboard case still reaches up and taps.
export default function TouchBar({ gridRef, onState }) {
    const [box, setBox] = useState(null)

    // The focused box, watched rather than asked for, so the bar always talks
    // about the cell the cursor is actually in.
    useEffect(() => {
        function look() {
            const el = document.activeElement
            setBox(el?.dataset?.r !== undefined ? el : was => (
                was && document.contains(was) ? was : null
            ))
        }
        document.addEventListener('focusin', look)
        document.addEventListener('input', look)
        return () => {
            document.removeEventListener('focusin', look)
            document.removeEventListener('input', look)
        }
    }, [])

    // mousedown and touchstart are cancelled so pressing a button never takes
    // the cursor out of the box it is meant to act on.
    const hold = e => { if (e.target.closest('button')) e.preventDefault() }

    function step(dir) {
        if (box) stepFrom(gridRef.current, box, dir)
    }

    return (
        <div
            onMouseDown={hold}
            onTouchStart={hold}
            className={`flex flex-wrap items-center gap-1.5 px-3 py-2 border-t border-border bg-gray-100 ${
                box ? '' : 'opacity-60'
            }`}
        >
            <span className="text-[0.6rem] font-bold uppercase tracking-wider text-muted mr-1">
                The cell you are in
            </span>

            <Key onClick={() => step(-1)} label="Previous box">&lsaquo;</Key>
            <Key onClick={() => step(1)} label="Next box">&rsaquo;</Key>

            <span className="flex-1 min-w-[0.5rem]" />

            {STATE_KEYS.map(state => (
                <Key
                    key={state.key}
                    onClick={() => onState(box, state.key)}
                    disabled={!box}
                    tone={state.absence
                        ? absenceKind(state.value).colour
                        : kindOf(state.value).colour}
                >
                    {state.label}
                </Key>
            ))}
        </div>
    )
}

function Key({ children, onClick, disabled, label, tone }) {
    const look = 'border-gray-300 text-gray-900'

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            style={tone ? { borderColor: tone, color: tone } : undefined}
            className={`min-h-[2.125rem] min-w-[2.125rem] px-2.5 rounded-lg border bg-white text-xs font-semibold
                transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default
                focus:outline-none focus:ring-2 focus:ring-accent ${look}`}
        >
            {children}
        </button>
    )
}
