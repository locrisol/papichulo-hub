import { useState, useEffect } from 'react'

// The way back to the top of a long page.
//
// The catalogue runs to a few hundred rows and the stock take to more, and on a
// phone getting back to the search box meant a lot of thumb. On a laptop it
// meant finding the scrollbar.
//
// Which element is actually scrolling changes with the screen, which is the
// whole difficulty. On a computer the header stays put and the body below it
// scrolls; on a phone the header goes up with the page, so it is the column
// holding both that moves and the body inside it never scrolls at all. Watching
// the wrong one means a button that simply never appears, which is what
// happened the first time.
//
// So it is handed both and watches whichever is moving, and the window besides.
//
// It only turns up once there is something to go back to. A button offering to
// take you to the top of a page you are already at the top of is noise.
export default function BackToTop({ scrollers = [] }) {
    const [show, setShow] = useState(false)

    useEffect(() => {
        const boxes = scrollers.map(ref => ref?.current).filter(Boolean)

        function onScroll() {
            const furthest = Math.max(window.scrollY, ...boxes.map(box => box.scrollTop))
            setShow(furthest > 400)
        }

        for (const box of boxes) box.addEventListener('scroll', onScroll, { passive: true })
        window.addEventListener('scroll', onScroll, { passive: true })
        onScroll()

        return () => {
            for (const box of boxes) box.removeEventListener('scroll', onScroll)
            window.removeEventListener('scroll', onScroll)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    if (!show) return null

    return (
        <button
            type="button"
            onClick={() => {
                for (const ref of scrollers) {
                    ref?.current?.scrollTo({ top: 0, behavior: 'smooth' })
                }
                window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            aria-label="Back to the top"
            // Bottom right, above anything a page puts along the bottom, and
            // out of the way of a thumb reaching for the bottom left.
            className="fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full bg-sidebar text-white shadow-lg flex items-center justify-center transition-colors hover:bg-sidebar-active focus:outline-none focus:ring-2 focus:ring-accent"
        >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
        </button>
    )
}
