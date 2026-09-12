import { createContext, useContext, useLayoutEffect, useRef } from 'react'

// Which element is doing the scrolling, and remembering where a page was.
//
// The app does not scroll the window. On a computer the sidebar and the header
// stay put and the area beside them scrolls; on a phone the header goes up with
// the page, so the column holding both is what moves. Anything that wants to
// know where somebody is has to be told which of the two it is, which is why
// they are handed down from the layout rather than found by guessing.
//
// It is also why the browser cannot put a page back where it was on its own.
// Going into a product's prices and coming back landed at the top of a few
// hundred rows every time, because the thing the browser restores is the window
// and the window never moved.

const ScrollContext = createContext({ mainRef: null, shellRef: null })

export function ScrollProvider({ mainRef, shellRef, children }) {
    return (
        <ScrollContext.Provider value={{ mainRef, shellRef }}>
            {children}
        </ScrollContext.Provider>
    )
}

// Not exported. Nothing outside this file needs the raw refs, and every extra
// export from a file that also exports a component is one more thing fast
// refresh cannot follow. The one hook below is the whole of the outside world's
// business with it.
function useScrollers() {
    return useContext(ScrollContext)
}

// Put a page back where it was, but only when coming back from the right
// place.
//
// key is what the position is filed under, so two lists do not inherit each
// other's. ready says the rows are on screen: restoring before then sets a
// position on a page one paragraph tall, and the browser clamps it to the top,
// which looks exactly like the bug it is meant to fix.
//
// belongsTo says which departures are worth remembering. Stepping into a
// product's prices and coming back is one errand and should land where it left
// off; going to the sales screen and coming back later is a new visit, and
// dropping somebody two hundred rows down a list they have not looked at since
// this morning is not helpfulness, it is a page that has lost its place.
//
// Given nothing it remembers every departure, which is the right default for a
// list with nowhere in particular to go.
//
// sessionStorage rather than memory, because coming back is a fresh mount, and
// rather than localStorage, because where you were in a list last Tuesday is
// not worth remembering.
export function useKeepScroll(key, ready, belongsTo) {
    const { mainRef, shellRef } = useScrollers()
    const restored = useRef(false)

    // Both of these are layout effects rather than ordinary ones, and that is
    // the whole difference between this working and not.
    //
    // An ordinary effect cleans up after the browser has painted. By then the
    // page has already been swapped for the next one, the scrolling box is
    // suddenly a few hundred pixels shorter, the browser has clamped it to the
    // top, and a scroll event has fired saying so. Everything that listens has
    // dutifully recorded a position of zero. A layout effect cleans up before
    // any of that, while the old page is still there and still where it was.
    useLayoutEffect(() => {
        const boxes = [mainRef?.current, shellRef?.current].filter(Boolean)
        if (boxes.length === 0) return

        const store = `scroll:${key}`

        // Where we are going is written down with the position. At cleanup the
        // address bar already says the destination, which is what makes this
        // possible at all.
        function remember() {
            const at = Math.max(...boxes.map(box => box.scrollTop))
            if (at > 0) {
                sessionStorage.setItem(store, JSON.stringify({ at, to: window.location.pathname }))
            }
        }

        for (const box of boxes) box.addEventListener('scroll', remember, { passive: true })
        return () => {
            for (const box of boxes) box.removeEventListener('scroll', remember)
            remember()
        }
    }, [key, mainRef, shellRef])

    useLayoutEffect(() => {
        if (!ready || restored.current) return
        const stored = readPlace(`scroll:${key}`)
        const saved = stored && (!belongsTo || belongsTo(stored.to)) ? stored.at : 0
        if (!saved) {
            sessionStorage.removeItem(`scroll:${key}`)
            restored.current = true
            return
        }

        const boxes = [mainRef?.current, shellRef?.current].filter(Boolean)
        const put = () => {
            let landed = false
            for (const box of boxes) {
                if (box.scrollHeight > box.clientHeight) { box.scrollTop = saved; landed = true }
            }
            return landed
        }

        // Before the paint if the rows are already there, which is the usual
        // case and means no jump. If nothing is tall enough to scroll yet, one
        // frame later, by which time it will be.
        if (put()) { restored.current = true; return }

        const frame = requestAnimationFrame(() => { put(); restored.current = true })
        return () => cancelAnimationFrame(frame)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, key, mainRef, shellRef])
}

function readPlace(store) {
    try {
        const raw = sessionStorage.getItem(store)
        if (!raw) return null
        const place = JSON.parse(raw)
        return place && place.at > 0 ? place : null
    } catch {
        // Written by an older version of this, or by nothing at all.
        return null
    }
}
