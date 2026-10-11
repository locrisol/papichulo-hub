import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { readStored, writeStored } from '@/lib/browserStore'

// Keeping somebody's place on a list that changes under them (his, 11
// October). Seven phones on one round means ticks arriving every half minute,
// and a tick saved above where somebody is reading grows its row and pushes
// everything below it down the screen.
//
// The place is the first marked thing (data-place, with an id) whose top is in
// view, and how far below the top of the view it sits. It is taken on every
// scroll, and after every change the page makes the same thing is put back at
// the same height, before the screen is drawn. The browser does some of this
// itself, but not every browser, and doing it twice moves the page twice, so
// the page turns the browser's own off (overflow-anchor: none).
//
// It is also kept for the tab, so a reload opens where it was left.

// The box that scrolls the page: the list's own on a computer, the app's on a
// phone. Found each time, because turning a phone round can change which.
function scrollerOf(el) {
    for (let node = el?.parentElement; node; node = node.parentElement) {
        const { overflowY } = getComputedStyle(node)
        if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node
    }
    return document.scrollingElement || document.documentElement
}

const viewTop = scroller => (
    scroller === document.scrollingElement || scroller === document.documentElement ? 0 : scroller.getBoundingClientRect().top
)

function placeIn(root) {
    const top = viewTop(scrollerOf(root))
    let last = null
    for (const el of root.querySelectorAll('[data-place]')) {
        const at = el.getBoundingClientRect().top - top
        if (at >= 0) return { id: el.id, at }
        last = { id: el.id, at }
    }
    return last
}

function putBack(root, place) {
    const el = place && document.getElementById(place.id)
    if (!el || !root.contains(el)) return
    const scroller = scrollerOf(root)
    const moved = el.getBoundingClientRect().top - viewTop(scroller) - place.at
    if (Math.abs(moved) >= 1) scroller.scrollTop += moved
}

function readPlace(key) {
    try {
        const kept = JSON.parse(readStored('session', key) || 'null')
        return kept && typeof kept.id === 'string' && Number.isFinite(kept.at) ? kept : null
    } catch {
        // Not a place. Starts at the top.
        return null
    }
}

// rootRef is the box holding the list. Nothing is done until ready, so the
// place kept for a reload is put back on the list, not on "Loading".
//
// Returns keepAt(element, change, then): make a change that opens or closes
// part of the list and leave element where it was on the screen. A category
// heading opened or closed stays under the finger rather than the list jumping
// to keep some row further down in place. then, if given, runs after the
// change and before the new place is taken, for a change that means to move
// the page, such as going to a row.
export default function useKeepPlace(rootRef, key, ready) {
    const place = useRef(undefined)
    if (place.current === undefined) place.current = readPlace(key)
    const holding = useRef(false)

    const take = useCallback(() => {
        const root = rootRef.current
        if (!root) return
        place.current = placeIn(root)
        if (place.current) writeStored('session', key, JSON.stringify(place.current))
    }, [rootRef, key])

    const hold = useCallback(() => {
        const root = rootRef.current
        if (!root || holding.current) return
        putBack(root, place.current)
        take()
    }, [rootRef, take])

    // After every change the page makes. No list of what to watch, on purpose:
    // anything that moves a row is a reason to put it back.
    useLayoutEffect(() => {
        if (ready) hold()
    })

    useEffect(() => {
        if (!ready) return
        const root = rootRef.current
        // On the document while capturing, because a box's scroll does not
        // bubble and which box scrolls depends on the screen.
        const scrolled = () => { if (!holding.current) take() }
        document.addEventListener('scroll', scrolled, { capture: true, passive: true })
        // A size change nothing on this page made, a photo arriving in a
        // component of its own, say.
        const resized = typeof ResizeObserver === 'function' && root ? new ResizeObserver(hold) : null
        resized?.observe(root)
        return () => {
            document.removeEventListener('scroll', scrolled, { capture: true })
            resized?.disconnect()
        }
    }, [ready, rootRef, take, hold])

    return useCallback((element, change, then) => {
        const root = rootRef.current
        const before = element?.getBoundingClientRect().top
        holding.current = true
        try {
            flushSync(change)
        } finally {
            holding.current = false
        }
        if (root && element && before !== undefined) {
            const scroller = scrollerOf(root)
            const moved = element.getBoundingClientRect().top - before
            if (Math.abs(moved) >= 1) scroller.scrollTop += moved
        }
        then?.()
        take()
    }, [rootRef, take])
}
