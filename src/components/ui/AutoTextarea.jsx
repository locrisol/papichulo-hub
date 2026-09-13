import { useLayoutEffect, useRef } from 'react'

// A box for writing in that is as tall as what is in it.
//
// Every note on the report started as a single line input, which is fine while
// somebody types four words and useless the moment they type a sentence: the
// beginning scrolls out of sight and there is no way to read back what you
// wrote without dragging through it. On a phone, where the box is already the
// width of the screen and a comment about a one star review is a sentence
// rather than a phrase, that is most of the time.
//
// It measures rather than counting characters. A count is a guess that is wrong
// as soon as the box is a different width, which on a phone it always is, and
// wrong again for a word too long to break. scrollHeight is what the browser
// actually needs, so it fits at any width in any font.
//
// The resize handle is off. It is a control that offers to fix a problem this
// does not have, and it lets somebody drag the box smaller than its own
// contents.
export default function AutoTextarea({ minRows = 1, className = '', onChange, onInput, ...rest }) {
    const ref = useRef(null)

    function fit(el) {
        if (!el) return
        // Reset first. Without it the box can only ever grow, because
        // scrollHeight of an already tall box is its own height.
        el.style.height = 'auto'
        el.style.height = `${el.scrollHeight}px`
    }

    // On arrival, and again whenever a controlled value is set from outside.
    useLayoutEffect(() => { fit(ref.current) }, [rest.value])

    return (
        <textarea
            {...rest}
            ref={ref}
            rows={minRows}
            onChange={e => { fit(e.currentTarget); if (onChange) onChange(e) }}
            onInput={e => { fit(e.currentTarget); if (onInput) onInput(e) }}
            className={`resize-none overflow-hidden ${className}`}
        />
    )
}
