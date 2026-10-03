import { useState } from 'react'
import { readStored, writeStored } from '@/lib/browserStore'

// Whether a list is showing its switched off rows, remembered in this browser.
//
// Products, Menu Items and Suppliers each had this written out, reading the
// browser's store straight into the first render, so a private window that
// refused it blanked the page. Through the store helper a refusal is only a
// choice that is not remembered next time.
//
// key is the name it is kept under, like 'productsShowInactive', so each list
// remembers its own.
export default function useShowInactive(key) {
    const [showing, setShowingState] = useState(() => readStored('local', key) === 'true')

    // Takes a value or a function of the last one, like a state setter.
    function setShowing(next) {
        const value = Boolean(typeof next === 'function' ? next(showing) : next)
        setShowingState(value)
        writeStored('local', key, value)
    }

    return [showing, setShowing]
}
