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
        let last = 0

        function onScroll() {
            const at = Math.max(window.scrollY, ...boxes.map(box => box.scrollTop))

            // Only on the way back up.
            //
            // Sitting there the whole time it covered the corner of whatever
            // card was at the bottom of a phone screen, which is worse than not
            // having it: reading down a list is most of what anybody does here
            // and the button was in the way for all of it.
            //
            // Going up is the one moment somebody might want the top, so that
            // is when it appears. A few pixels of slack, or every wobble of a
            // thumb flickers it on and off.
            const up = at < last - 8
            const down = at > last + 8
            if (down) setShow(false)
            else if (up && at > 400) setShow(true)
            if (at <= 400) setShow(false)

            last = at
        }

        for (const box of boxes) box.addEventListener('scroll', onScroll, { passive: true })
        window.addEventListener('scroll', onScroll, { passive: true })

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
            // Bottom right, out of the way of a thumb reaching for the bottom
            // left. Smaller on a phone, where the screen it is covering is
            // smaller too.
            className="fixed bottom-4 right-4 md:bottom-5 md:right-5 z-40 w-11 h-11 md:w-12 md:h-12 rounded-full bg-sidebar/90 text-white shadow-lg flex items-center justify-center transition-colors hover:bg-sidebar-active focus:outline-none focus:ring-2 focus:ring-accent"
        >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
        </button>
    )
}
