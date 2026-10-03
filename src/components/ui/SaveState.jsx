import { clockTime } from '@/lib/dates'

// The line that says where an autosave is up to, on a screen with no Save
// button: the Timesheet, the Report and the restaurant settings.
//
// It was the same ternary written into all three, and the Report's copy had
// no way to say a save had failed, so it went on saying "Saved at" with the
// time of the last one that worked. **Not saved** is the state that matters,
// so it is the loud one.
//
// Only the words are announced. Anything passed in sits on the same line after
// them, like the day the Timesheet was sent, without being read out on every
// keystroke or turning red with them.
export default function SaveState({
    problem = false,
    saving = false,
    savedAt = null,
    idle = 'Saves as you type',
    className = '',
    children,
}) {
    const words = problem
        ? 'Not saved'
        : saving
            ? 'Saving'
            : savedAt
                ? `Saved at ${clockTime(savedAt)}`
                : idle

    return (
        <p className={`text-xs ${className}`}>
            <span aria-live="polite" className={problem ? 'font-bold text-red-700' : 'text-muted'}>
                {words}
            </span>
            {children}
        </p>
    )
}
