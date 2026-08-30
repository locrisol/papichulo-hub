import { useState, useEffect } from 'react'

// The way back to the top of a long page.
//
// The catalogue runs to a few hundred rows and the stock take to more, and on a
// phone getting back to the search box meant a lot of thumb. On a laptop it
// meant finding the scrollbar.
//
// Which thing is scrolling depends on the screen. On a computer it is the main
// area beside the sidebar, because the sidebar and the header stay put; on a
// phone that area has no overflow of its own and the whole window scrolls. This
// watches both rather than guessing, since guessing wrong means a button that
// never appears.
//
// It only turns up once there is something to go back to. A button offering to
// take you to the top of a page you are already at the top of is noise.
export default function BackToTop({ scroller }) {
    const [show, setShow] = useState(false)

    useEffect(() => {
        const main = scroller?.current
        const far = () => {
            const fromMain = main ? main.scrollTop : 0
            return Math.max(fromMain, window.scrollY) > 400
        }

        function onScroll() {
            setShow(far())
        }

        main?.addEventListener('scroll', onScroll, { passive: true })
        window.addEventListener('scroll', onScroll, { passive: true })
        onScroll()

        return () => {
            main?.removeEventListener('scroll', onScroll)
            window.removeEventListener('scroll', onScroll)
        }
    }, [scroller])

    if (!show) return null

    return (
        <button
            type="button"
            onClick={() => {
                scroller?.current?.scrollTo({ top: 0, behavior: 'smooth' })
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
