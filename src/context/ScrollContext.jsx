import { ScrollContext } from '@/context/scroll'

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

export function ScrollProvider({ mainRef, shellRef, children }) {
    return (
        <ScrollContext.Provider value={{ mainRef, shellRef }}>
            {children}
        </ScrollContext.Provider>
    )
}
