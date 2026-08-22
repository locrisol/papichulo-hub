// How every box that takes a number behaves.
//
// They all used to be type="number", which browsers decorate with little up and
// down arrows and, worse, wire to the scroll wheel. On a screen that is nothing
// but figures that is a real hazard: you scroll the page with the pointer over
// a cell, the wheel is taken as input, and a week's sales quietly change by a
// few cents with nothing on screen saying anything happened.
//
// type="text" has no arrows and ignores the wheel. inputMode still tells a
// phone to open the number keypad, so nothing is lost there. What type="number"
// did give us was rejecting letters, so that is done here instead.
//
// Stock take already worked this way. This is the rest of the app catching up.

// Keeps only what belongs in a number.
//
// Letters and symbols are dropped as they are typed rather than the box going
// red afterwards. A second decimal point is dropped too, so "12.3.4" cannot be
// typed at all.
//
// The value stays a string all the way through. It is not turned into a number
// here, because "" and "0" have to stay different: nothing entered is not the
// same as the till taking nothing, and that difference is what the sales grid
// uses to tell a day nobody has touched from a day that took no cash.
export function cleanNumberInput(raw, { whole = false } = {}) {
    if (raw == null) return ''

    const stripped = String(raw).replace(whole ? /[^0-9]/g : /[^0-9.]/g, '')
    if (whole) return stripped

    // Only the first decimal point survives.
    const firstDot = stripped.indexOf('.')
    if (firstDot === -1) return stripped
    return stripped.slice(0, firstDot + 1) + stripped.slice(firstDot + 1).replace(/\./g, '')
}

// The props every number box needs, ready to spread.
//
// Spread this rather than setting type and inputMode by hand, so no box can be
// added later that still has the arrows on it.
//
// `onChange` is handed the cleaned string, not the event, since no caller ever
// wanted the event for anything else.
export function numberField({ value, onChange, whole = false }) {
    return {
        type: 'text',
        inputMode: whole ? 'numeric' : 'decimal',
        value: value ?? '',
        onChange: e => onChange(cleanNumberInput(e.target.value, { whole })),
    }
}
