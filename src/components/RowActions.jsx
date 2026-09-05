import { useEffect, useRef, useState } from 'react'
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

export default function RowActions({ primary, items, label = 'row' }) {
    const [open, setOpen] = useState(false)
    const box = useRef(null)

    // Clicking anywhere else closes it, including on another row's menu, so two
    // are never open at once. Escape closes it too, because a menu you cannot
    // get out of without aiming at something is a trap.
    useEffect(() => {
        if (!open) return

        const away = e => { if (!box.current?.contains(e.target)) setOpen(false) }
        const key = e => { if (e.key === 'Escape') setOpen(false) }

        document.addEventListener('mousedown', away)
        document.addEventListener('keydown', key)
        return () => {
            document.removeEventListener('mousedown', away)
            document.removeEventListener('keydown', key)
        }
    }, [open])

    const shown = (items || []).filter(Boolean)

    return (
        <div className="flex items-center gap-2 justify-end" ref={box}>
            {primary && (
                <button onClick={primary.onClick} className={rowButton(primary.tone || 'edit')}>
                    {primary.label}
                </button>
            )}

            {shown.length > 0 && (
                <div className="relative">
                    <button
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

                    {open && (
                        <div
                            role="menu"
                            className="absolute right-0 top-full mt-1 z-30 min-w-[10rem] rounded-lg border border-border bg-white shadow-lg py-1"
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
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
