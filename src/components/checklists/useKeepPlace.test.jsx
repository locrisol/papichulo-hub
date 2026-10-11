// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useEffect, useRef } from 'react'
import { render, act, fireEvent } from '@testing-library/react'
import useKeepPlace from './useKeepPlace'

// jsdom draws nothing, so every row stands in as 50 high, one under the other,
// in a box scrolled by its scrollTop. That is enough to see whether the same
// row is put back at the same height after rows are added above it.

const ROW = 50
let box

beforeEach(() => {
    sessionStorage.clear()
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
        if (this.id === 'box' || !box) return { top: 0, bottom: 400, height: 400 }
        const rows = [...box.querySelectorAll('[data-place], [data-fixed]')]
        const at = rows.indexOf(this)
        const top = at < 0 ? 0 : at * ROW - box.scrollTop
        return { top, bottom: top + ROW, height: ROW }
    })
})

afterEach(() => {
    vi.restoreAllMocks()
    box = null
})

// The hook's keepAt, handed out after each render for the test to call.
const handle = { keepAt: null }
function List({ rows, ready = true }) {
    const ref = useRef(null)
    const keepAt = useKeepPlace(ref, 'place-test', ready)
    useEffect(() => { handle.keepAt = keepAt })
    return (
        <div id="box" style={{ overflowY: 'auto' }}>
            <div ref={ref}>
                {rows.map(r => <div key={r} id={r} data-place>{r}</div>)}
            </div>
        </div>
    )
}

function show(rows, ready) {
    const view = render(<List rows={rows} ready={ready} />)
    box = document.getElementById('box')
    Object.defineProperty(box, 'scrollHeight', { configurable: true, value: 5000 })
    Object.defineProperty(box, 'clientHeight', { configurable: true, value: 400 })
    return view
}

const TEN = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']

describe('holding somebody\'s place', () => {
    it('keeps the row they were looking at where it was when rows arrive above it', () => {
        const view = show(TEN)
        box.scrollTop = 200
        fireEvent.scroll(box)
        view.rerender(<List rows={['new1', 'new2', ...TEN]} />)
        // e was at the top. Two rows above it later, it still is.
        expect(box.scrollTop).toBe(300)
    })

    it('leaves the page alone when nothing above moved', () => {
        const view = show(TEN)
        box.scrollTop = 200
        fireEvent.scroll(box)
        view.rerender(<List rows={[...TEN, 'k', 'l']} />)
        expect(box.scrollTop).toBe(200)
    })

    it('keeps the place for the tab, and puts it back once the list is there', () => {
        const first = show(TEN)
        box.scrollTop = 150
        fireEvent.scroll(box)
        expect(JSON.parse(sessionStorage.getItem('place-test'))).toEqual({ id: 'd', at: 0 })
        first.unmount()

        // A reload: the list arrives after the page does.
        const again = show([], false)
        box.scrollTop = 0
        again.rerender(<List rows={TEN} ready />)
        expect(box.scrollTop).toBe(150)
    })

    it('leaves what was pressed under the finger when part of the list opens', () => {
        const view = show(TEN)
        box.scrollTop = 100
        fireEvent.scroll(box)
        const pressed = document.getElementById('d')
        // Opening adds two rows above what was pressed.
        act(() => handle.keepAt(pressed, () => view.rerender(<List rows={['x', 'y', ...TEN]} />)))
        expect(pressed.getBoundingClientRect().top).toBe(50)
    })
})
