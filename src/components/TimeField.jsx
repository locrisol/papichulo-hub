import { timeOptions } from '../lib/timeOptions'
import { fieldClass } from '../lib/controlStyles'

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
export default function TimeField({
    value = '',
    onChange,
    dayStart = '',
    endOfDay = false,
    placeholder = 'Pick a time',
    className = '',
    ...rest
}) {
    const options = timeOptions({ value, dayStart, endOfDay })

    return (
        <select
            value={value}
            onChange={e => onChange(e.target.value)}
            className={`${fieldClass} ${className}`}
            {...rest}
        >
            {/* Only while nothing is chosen. Leaving it in the list afterwards
                offers "no time" as a thing to go back to, which on a shift that
                already has a start is not a choice anybody means to make. */}
            {!value && <option value="">{placeholder}</option>}
            {options.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
            ))}
        </select>
    )
}
