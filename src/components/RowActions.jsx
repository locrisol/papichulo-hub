import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { rowButton } from '../lib/controlStyles'

// The things you can do to one row of a table.
//
// There were five buttons sitting side by side on every row, next to six
// columns of information. Five is too many for a table row at any width. On a
// wide window it merely looks cluttered, and as soon as the window is anything
// less than generous the buttons wrap into a stack and take the row with them,
// so one product becomes a block several lines deep and a list of forty is
// something you scroll through for a while.
//
// That is not a small screen problem to be fixed with a breakpoint. It is a row
// carrying more than a row can carry, so it is fixed the same way at every
// size: the one you actually use stays out where it is, and the rest go behind
// a button. Nothing is taken away and nothing is renamed. It is the same five
// things, one click further in for four of them.
//
// The phone does not use this, and that is not an exception to the above. Down
// there the table is not a table, it is a column of cards, the buttons sit in a
// row across the bottom of one with nothing beside them to collide with, and
// hiding them would cost a tap and buy nothing.
//
// The open menu is drawn on the body rather than inside the row, and that is
// not tidiness. A menu drawn where it sits is at the mercy of every parent
// above it: the team table is wrapped in overflow-hidden so its corners come
// out round, and that quietly cut the bottom half off the last row's menu, so
// it offered two of its four choices with no sign there were any more. On the
// body nothing can clip it, whatever anybody wraps a table in later.
//
// It costs having to place it by hand, which is the rect below, and having to
// shut it when the page moves under it, since a menu pinned to the window does
// not follow a row that has scrolled away.

export default function RowActions({ primary, items, label = 'row' }) {
    const [open, setOpen] = useState(false)
    const [at, setAt] = useState(null)
    const trigger = useRef(null)
    const menu = useRef(null)

    // Where to draw it, worked out from where the button actually is.
    //
    // Right edges lined up, because the menu hangs off the end of a row and a
    // list of table rows is read down its right hand side. Below the button
    // unless there is not room, and then above it, so the last row of a long
    // table opens upwards instead of off the bottom of the screen.
    useLayoutEffect(() => {
        if (!open) return

        const place = () => {
            const rect = trigger.current?.getBoundingClientRect()
            if (!rect) return
            // clientWidth and clientHeight rather than the window's own, so a
            // scrollbar is not counted as room there is not.
            const page = document.documentElement
            const height = menu.current?.offsetHeight || 0
            const below = page.clientHeight - rect.bottom
            const flip = height > below - 8 && rect.top > height

            setAt({
                right: Math.max(8, page.clientWidth - rect.right),
                top: flip ? null : rect.bottom + 4,
                bottom: flip ? page.clientHeight - rect.top + 4 : null,
            })
        }

        place()
        // Measured once with nothing in it and again once it has a height, so
        // the flip upwards knows how tall the thing it is flipping is.
        const again = requestAnimationFrame(place)
        return () => cancelAnimationFrame(again)
    }, [open])

    // Clicking anywhere else closes it, including on another row's menu, so two
    // are never open at once. Escape closes it too, because a menu you cannot
    // get out of without aiming at something is a trap.
    //
    // Scrolling closes it as well. It is pinned to the window rather than to
    // the row, so a page that moves underneath would leave it hanging over
    // somebody else's line. Capture, because the thing that scrolls is usually
    // the main area rather than the window.
    useEffect(() => {
        if (!open) return

        const away = e => {
            if (trigger.current?.contains(e.target)) return
            if (menu.current?.contains(e.target)) return
            setOpen(false)
        }
        const key = e => { if (e.key === 'Escape') setOpen(false) }
        const moved = () => setOpen(false)

        document.addEventListener('mousedown', away)
        document.addEventListener('keydown', key)
        window.addEventListener('scroll', moved, true)
        window.addEventListener('resize', moved)
        return () => {
            document.removeEventListener('mousedown', away)
            document.removeEventListener('keydown', key)
            window.removeEventListener('scroll', moved, true)
            window.removeEventListener('resize', moved)
        }
    }, [open])

    const shown = (items || []).filter(Boolean)

    return (
        <div className="flex items-center gap-2 justify-end">
            {primary && (
                <button onClick={primary.onClick} className={rowButton(primary.tone || 'edit')}>
                    {primary.label}
                </button>
            )}

            {shown.length > 0 && (
                <>
                    <button
                        ref={trigger}
                        type="button"
                        onClick={() => setOpen(v => !v)}
                        aria-haspopup="menu"
                        aria-expanded={open}
                        aria-label={`More for ${label}`}
                        className={rowButton()}
                    >
                        More
                        <span aria-hidden="true" className="ml-1 text-[0.6rem] align-middle">▾</span>
                    </button>

                    {open && createPortal(
                        <div
                            ref={menu}
                            role="menu"
                            style={{
                                position: 'fixed',
                                right: at?.right ?? 0,
                                top: at?.top ?? undefined,
                                bottom: at?.bottom ?? undefined,
                                // Hidden until it has been placed, or it
                                // appears in the corner and jumps.
                                visibility: at ? 'visible' : 'hidden',
                            }}
                            className="z-50 min-w-[10rem] rounded-lg border border-border bg-white shadow-lg py-1"
                        >
                            {shown.map((item, i) => (
                                <button
                                    key={item.label}
                                    type="button"
                                    role="menuitem"
                                    onClick={() => { setOpen(false); item.onClick() }}
                                    title={item.title}
                                    // The one that takes somebody off a list is
                                    // last, kept apart by a line, and red. It is
                                    // the only one here you would mind doing by
                                    // accident.
                                    className={`block w-full text-left px-3 py-2 text-xs font-semibold whitespace-nowrap
                                        ${item.tone === 'danger' ? 'text-red-700 hover:bg-red-50' : ''}
                                        ${item.tone === 'good' ? 'text-green-700 hover:bg-green-50' : ''}
                                        ${!item.tone ? 'text-gray-700 hover:bg-gray-50' : ''}
                                        ${item.tone && i > 0 ? 'border-t border-border mt-1 pt-2' : ''}`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>,
                        document.body,
                    )}
                </>
            )}
        </div>
    )
}
