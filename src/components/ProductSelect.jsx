import { useState, useRef, useEffect, useMemo } from 'react'
import { forDropdown } from '../lib/sections'

// Picking a product out of a few hundred.
//
// It was a plain dropdown of every name in whatever order they arrived, which
// told you nothing about what you were picking and made you scroll for it. Two
// things fix that, and it needed to stop being a native select to get either.
//
// You can type. Not jump-to-first-letter, which is all a native select gives:
// any part of the name, so "chick" finds Chicken Breast and Grilled Chicken
// both. On a list this long that is the difference between a second and half a
// minute.
//
// It is grouped and coloured. House-made first, then each section in the order
// the store is walked, each in the colour that section has on the stock take,
// so blue is the freezer wherever you are in the app.
//
// The keyboard drives all of it, because the two screens this is on are worked
// through one line after another: type, down, enter, on to the next.
export default function ProductSelect({
    value, onChange, products, placeholder = 'Select a product...', inputRef, className = '',
}) {
    const [open, setOpen] = useState(false)
    const [term, setTerm] = useState('')
    const [active, setActive] = useState(0)
    const box = useRef(null)
    const listRef = useRef(null)

    const chosen = (products || []).find(p => p.id === value) || null

    // Every match, flat, in the order they are drawn. The keyboard walks this
    // one; the groups below are only how it is laid out.
    const groups = useMemo(() => {
        const wanted = term.trim().toLowerCase()
        const matching = wanted
            ? (products || []).filter(p => (p.name || '').toLowerCase().includes(wanted))
            : (products || [])
        return forDropdown(matching)
    }, [products, term])

    const flat = useMemo(() => groups.flatMap(g => g.items.map(item => ({ item, ink: g.ink }))), [groups])

    // Where each product sits in that flat run, so a row can say whether it is
    // the highlighted one without anything being counted during the render.
    const positions = useMemo(
        () => new Map(flat.map((entry, i) => [entry.item.id, i])),
        [flat],
    )

    // Clicking anywhere else closes it and puts back whatever was chosen, so a
    // half typed search is never left looking like a selection.
    useEffect(() => {
        if (!open) return
        function onDown(e) {
            if (box.current && !box.current.contains(e.target)) {
                setOpen(false)
                setTerm('')
            }
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
    }, [open])

    // Keep the highlighted row in view when the keyboard is doing the moving.
    useEffect(() => {
        if (!open || !listRef.current) return
        const row = listRef.current.querySelector('[data-active="true"]')
        if (row) row.scrollIntoView({ block: 'nearest' })
    }, [active, open])

    function pick(product) {
        onChange(product.id)
        setOpen(false)
        setTerm('')
    }

    function onKeyDown(e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            if (!open) { setOpen(true); return }
            const step = e.key === 'ArrowDown' ? 1 : -1
            setActive(current => {
                if (flat.length === 0) return 0
                return (current + step + flat.length) % flat.length
            })
            return
        }
        if (e.key === 'Enter') {
            if (open && flat[active]) {
                e.preventDefault()
                pick(flat[active].item)
            }
            return
        }
        if (e.key === 'Escape') {
            setOpen(false)
            setTerm('')
        }
    }

    const field = className
        || 'w-full border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent'

    return (
        <div ref={box} className="relative">
            <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded={open}
                aria-autocomplete="list"
                value={open ? term : (chosen ? `${chosen.name} (${chosen.unit})` : '')}
                placeholder={placeholder}
                onChange={e => { setTerm(e.target.value); setActive(0); setOpen(true) }}
                onFocus={() => setOpen(true)}
                onKeyDown={onKeyDown}
                className={field}
                style={open || !chosen ? undefined : { color: inkOf(groups, chosen) }}
            />

            {/* Clearing it, and the arrow, in one. There is no empty option in
                the list any more, so this is the way back to nothing. */}
            {chosen && !open ? (
                <button
                    type="button"
                    onClick={() => { onChange(''); setTerm(''); setOpen(false) }}
                    aria-label="Clear"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            ) : (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                </span>
            )}

            {open && (
                <div
                    ref={listRef}
                    role="listbox"
                    className="absolute z-30 left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-white border border-gray-300 rounded-lg shadow-lg"
                >
                    {flat.length === 0 && (
                        <p className="px-3 py-3 text-sm text-muted">Nothing matching that.</p>
                    )}

                    {groups.map(group => (
                        <div key={group.label}>
                            <p
                                className="px-3 py-1.5 text-[0.625rem] font-bold uppercase tracking-wider bg-gray-50 border-b border-border sticky top-0"
                                style={{ color: group.ink }}
                            >
                                {group.label}
                            </p>
                            {group.items.map(product => {
                                const isActive = positions.get(product.id) === active
                                return (
                                    <button
                                        key={product.id}
                                        type="button"
                                        role="option"
                                        aria-selected={product.id === value}
                                        data-active={isActive}
                                        // mousedown rather than click, or the
                                        // input loses focus and the list is
                                        // gone before the click lands.
                                        onMouseDown={e => { e.preventDefault(); pick(product) }}
                                        className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${
                                            isActive ? 'bg-accent-light' : 'hover:bg-gray-50'
                                        }`}
                                    >
                                        <span
                                            className="w-1 h-5 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: group.ink }}
                                        />
                                        <span className="text-gray-900">{product.name}</span>
                                        <span className="text-xs text-muted ml-auto">{product.unit}</span>
                                    </button>
                                )
                            })}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// The colour of whatever is currently chosen, so the closed box says which
// section it came from without having to be opened.
function inkOf(groups, chosen) {
    for (const group of groups) {
        if (group.items.some(p => p.id === chosen.id)) return group.ink
    }
    return undefined
}
