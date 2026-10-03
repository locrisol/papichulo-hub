import { Component } from 'react'
import { card, pageTitle, primaryButton } from '@/lib/controlStyles'

// What is on screen when a page breaks while it is being drawn.
//
// Without this, one error anywhere in a page left a blank white screen and the
// reason only in the console, and the only way out was knowing to reload. The
// commonest cause is not a bug at all: a tab left open across a deploy asks
// for a page file that is no longer there. main.jsx reloads once for that, and
// this is what shows if the reload did not fix it.
//
// resetKey clears it. The one around the pages is given the address, so going
// to another page tries again rather than leaving the message up for good.
//
// That one sits inside AppLayout, around the page alone, and says inPage. The
// menu and the header stay up around the message, because they are the way to
// another page, and the message takes the page's place rather than the whole
// screen. The one in main.jsx covers everything else, the layout included.
//
// A class, because catching an error while drawing is still something only a
// class component can do.
export default class ErrorBoundary extends Component {
    state = { failed: false }

    static getDerivedStateFromError() {
        return { failed: true }
    }

    componentDidCatch(error, info) {
        console.error('A page could not be shown:', error, info?.componentStack)
    }

    componentDidUpdate(previous) {
        if (this.state.failed && previous.resetKey !== this.props.resetKey) {
            // Only once the address has moved on, which is a new page to try.
            this.setState({ failed: false })
        }
    }

    render() {
        if (!this.state.failed) return this.props.children

        // Inside the layout the header already holds the page's h1.
        const { inPage } = this.props
        const Heading = inPage ? 'h2' : 'h1'

        return (
            <div className={inPage ? 'flex justify-center py-6' : 'min-h-screen bg-gray-50 flex items-center justify-center p-6'}>
                <div className={`${card} p-6 max-w-md w-full`}>
                    <Heading className={pageTitle}>Something went wrong</Heading>

                    <p className="text-sm text-gray-700 mt-3">
                        This page could not be shown. Reloading usually fixes it.
                    </p>

                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className={`${primaryButton('lg')} mt-5`}
                    >
                        Reload
                    </button>
                </div>
            </div>
        )
    }
}
