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
// `decimals` caps how many places can be typed. Left off, there is no cap,
// which is right for a unit price the database holds to four places. Money
// passes 2: a box that lets somebody type 8.450 and then quietly stores 8.45 is
// a box that disagrees with itself.
export function cleanNumberInput(raw, { whole = false, decimals = null } = {}) {
    if (raw == null) return ''

    const stripped = String(raw).replace(whole ? /[^0-9]/g : /[^0-9.]/g, '')
    if (whole) return stripped

    // Only the first decimal point survives.
    const firstDot = stripped.indexOf('.')
    if (firstDot === -1) return stripped

    const out = stripped.slice(0, firstDot + 1) + stripped.slice(firstDot + 1).replace(/\./g, '')
    if (decimals == null) return out
    return out.slice(0, firstDot + 1 + decimals)
}

// The props every number box needs, ready to spread.
//
// Spread this rather than setting type and inputMode by hand, so no box can be
// added later that still has the arrows on it.
//
// `onChange` is handed the cleaned string, not the event, since no caller ever
// wanted the event for anything else.
//
// Focusing one selects what is in it, so typing replaces rather than adds. This
// is not a nicety. Every one of these boxes has a figure in it already, usually
// a nought, and a box you click into puts the cursor wherever you clicked. Type
// 25 into a box reading 0 and you get 250, which looks like a number somebody
// meant. It cost a real refund of two hundred and fifty euro to find, on a
// screen where every box works this way.
export function numberField({ value, onChange, whole = false, decimals = null }) {
    return {
        type: 'text',
        inputMode: whole ? 'numeric' : 'decimal',
        value: value ?? '',
        onFocus: e => e.target.select(),
        onChange: e => onChange(cleanNumberInput(e.target.value, { whole, decimals })),
    }
}
