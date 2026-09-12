import { timeOptions } from '../lib/timeOptions'
import { fieldClass, compactField } from '../lib/controlStyles'

// Picking a time, anywhere in the app.
//
// Twenty of these were <input type="time">, which hands the job to the browser
// and gets a different control on every machine: a clock dial on Android, a
// wheel on iPhone, three little boxes and a stepper on a computer. All three
// offer every minute of the day to set something that is always on the quarter
// hour, so picking 15:30 on a phone is a dial, a drag and a confirm.
//
// A <select> rather than a control of our own. On a phone it opens the list the
// operating system draws: full width, thumb sized rows, flick scrolling and
// typeahead, none of which we have to write or get wrong. On a computer, typing
// "15" jumps to three o'clock. It is one tap and one press either way, and it
// is the same control on every device, which the native time input never was.
//
// step={900} would have been the one line answer and it is not enough. It is
// specified for validation and the up and down stepper, not for what the picker
// draws, so browsers honour it in the wheel and ignore it in the dial, and on a
// computer it only marks a typed 15:07 invalid rather than stopping it.
//
// dayStart rotates the list rather than cutting it down: see timeOptions for
// why a shift finishing at 02:00 means the trading day cannot be a boundary.
// The narrow one, for a row that already has a day name and a remove on it:
// opening hours, the weekly extras, an availability stretch.
//
// A prop rather than letting those screens pass px-2 py-2 text-sm alongside the
// standard field. Two classes both setting padding do not resolve by the order
// they are written in the attribute, they resolve by the order they happen to
// sit in the compiled stylesheet, so an override like that works by luck and
// stops working when something unrelated is added. The style itself lives in
// controlStyles, because the availability dialog wanted the same box.

export default function TimeField({
    value = '',
    onChange,
    dayStart = '',
    endOfDay = false,
    allowEmpty = false,
    compact = false,
    placeholder = 'Pick a time',
    className = '',
    ...rest
}) {
    const options = timeOptions({ value, dayStart, endOfDay })

    return (
        <select
            value={value}
            onChange={e => onChange(e.target.value)}
            className={`${compact ? compactField : fieldClass} ${className}`}
            {...rest}
        >
            {/* Normally only while nothing is chosen, because offering "no time"
                back to somebody who has already set a shift start is not a
                choice anybody means to make.

                allowEmpty is for the places where empty is itself an answer
                rather than a gap. On a time off request, leaving the from box
                empty means "from opening", so taking the blank away once a time
                is picked would make a real state unreachable and the only way
                back would be to cancel the whole thing. */}
            {(allowEmpty || !value) && <option value="">{placeholder}</option>}
            {options.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
            ))}
        </select>
    )
}
