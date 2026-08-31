import { createContext, useContext, useEffect, useRef } from 'react'

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

// Put a page back where it was.
//
// key is what the position is filed under, so two lists do not inherit each
// other's. ready says the rows are on screen: restoring before then sets a
// position on a page one paragraph tall, and the browser clamps it to the top,
// which looks exactly like the bug it is meant to fix.
//
// sessionStorage rather than memory, because coming back is a fresh mount, and
// rather than localStorage, because where you were in a list last Tuesday is
// not worth remembering.
export function useKeepScroll(key, ready) {
    const { mainRef, shellRef } = useScrollers()
    const restored = useRef(false)

    useEffect(() => {
        const boxes = [mainRef?.current, shellRef?.current].filter(Boolean)
        if (boxes.length === 0) return

        const store = `scroll:${key}`

        function remember() {
            const at = Math.max(...boxes.map(box => box.scrollTop))
            if (at > 0) sessionStorage.setItem(store, String(at))
            else sessionStorage.removeItem(store)
        }

        for (const box of boxes) box.addEventListener('scroll', remember, { passive: true })
        return () => {
            remember()
            for (const box of boxes) box.removeEventListener('scroll', remember)
        }
    }, [key, mainRef, shellRef])

    useEffect(() => {
        if (!ready || restored.current) return
        const saved = Number(sessionStorage.getItem(`scroll:${key}`) || 0)
        if (!saved) { restored.current = true; return }

        // After the browser has laid the rows out, or there is nothing tall
        // enough to scroll yet and the position is thrown away.
        const frame = requestAnimationFrame(() => {
            for (const box of [mainRef?.current, shellRef?.current]) {
                if (box && box.scrollHeight > box.clientHeight) box.scrollTop = saved
            }
            restored.current = true
        })
        return () => cancelAnimationFrame(frame)
    }, [ready, key, mainRef, shellRef])
}
