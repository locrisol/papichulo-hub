import { useState } from 'react'
import Modal from '../Modal'
import ModalSection from '../ModalSection'
import { modalFooter, secondaryButton } from '../../lib/controlStyles'
import { offerable } from '../../lib/menuChoices'

// Adding a whole choice at once.
//
// A breakfast that comes with any of nine drinks is nine components, and adding
// them one at a time through the ordinary form is nine trips through a product
// search. This fills the list from a menu category and you tick what is in.
//
// What it stores is plain components, the same as adding them by hand. It is a
// faster way of typing, not a different kind of thing, which matters: a group
// that pointed at the category itself would quietly pull in a drink added next
// month and raise the cost of every breakfast with nothing anywhere saying so.

export default function AddSeveral({
    menuCategories, menuItems, allComponents, products, existingGroups,
    alreadyOn, onAdd, onClose,
}) {
    const [group, setGroup] = useState(existingGroups?.[0] || '')
    const [categoryId, setCategoryId] = useState('')
    const [search, setSearch] = useState('')
    const [listSeparately, setListSeparately] = useState(false)
    const [everyQuantity, setEveryQuantity] = useState('1')
    // Ticked, and how much of each. Kept apart from the list itself so ticking
    // something, filtering it away and filtering it back does not lose it.
    const [picked, setPicked] = useState({})

    const inCategory = categoryId
        ? menuItems.filter(i => i.category_id === categoryId)
        : []
    const { offered, skipped } = offerable(inCategory, allComponents, products)

    const shown = offered.filter(({ product }) =>
        product.name.toLowerCase().includes(search.trim().toLowerCase()))

    const on = new Set(alreadyOn || [])
    const chosen = Object.keys(picked)

    function toggle(productId) {
        setPicked(was => {
            const next = { ...was }
            if (next[productId] !== undefined) delete next[productId]
            else next[productId] = everyQuantity
            return next
        })
    }

    // Typing in the box at the top moves every row that has not been given a
    // number of its own. Retyping each of nine cans of a drink is the thing
    // this screen exists to avoid.
    function setAll(value) {
        setEveryQuantity(value)
        setPicked(was => Object.fromEntries(
            Object.keys(was).map(id => [id, value]),
        ))
    }

    function add() {
        onAdd(chosen.map(productId => ({
            product_id: productId,
            quantity: parseFloat(picked[productId]),
            choice_group: group.trim() || null,
            list_separately: listSeparately,
        })))
    }

    const ready = chosen.length > 0
        && chosen.every(id => parseFloat(picked[id]) > 0)

    return (
        <Modal title="Add several components" onClose={onClose} width="max-w-2xl">
            <ModalSection title="Choice settings">
                <div className="flex flex-wrap gap-4">
                    <div className="flex-1 min-w-[12rem]">
                        <label htmlFor="several-group" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                            Customer choice
                        </label>
                        <input
                            id="several-group"
                            type="text"
                            list="several-groups"
                            value={group}
                            onChange={e => setGroup(e.target.value)}
                            placeholder="e.g. Free drink"
                            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                        />
                        <datalist id="several-groups">
                            {(existingGroups || []).map(g => <option key={g} value={g} />)}
                        </datalist>
                    </div>

                    <div className="w-32">
                        <label htmlFor="several-qty" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                            Quantity
                        </label>
                        <input
                            id="several-qty"
                            type="text"
                            inputMode="decimal"
                            value={everyQuantity}
                            onChange={e => setAll(e.target.value)}
                            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                        />
                    </div>
                </div>

                <p className="text-xs text-gray-500 mt-2">
                    The customer gets one of these, so only the most expensive is counted in
                    the cost. The quantity is applied to every item you tick, and you can
                    change any of them afterwards.
                </p>

                <label className="flex items-start gap-2 mt-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={listSeparately}
                        onChange={e => setListSeparately(e.target.checked)}
                        className="w-4 h-4 accent-accent mt-0.5"
                    />
                    <span className="text-sm text-gray-700">
                        List them separately on the allergen sheet
                        <span className="block text-xs text-gray-400">
                            Leave this off if they already appear in their own category.
                        </span>
                    </span>
                </label>
            </ModalSection>

            <ModalSection title="Items to add">
                <div className="flex flex-wrap gap-3 mb-4">
                    <select
                        value={categoryId}
                        onChange={e => setCategoryId(e.target.value)}
                        aria-label="Fill the list from"
                        className="flex-1 min-w-[10rem] border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                    >
                        <option value="">Choose a category...</option>
                        {menuCategories.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>

                    <input
                        type="search"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search"
                        aria-label="Search"
                        className="flex-1 min-w-[9rem] border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                    />
                </div>

                {!categoryId ? (
                    <p className="text-sm text-muted py-6 text-center">
                        Choose a category to see its items.
                    </p>
                ) : shown.length === 0 ? (
                    <p className="text-sm text-muted py-6 text-center">
                        No items match.
                    </p>
                ) : (
                    <div className="rounded-lg border border-border divide-y divide-border max-h-72 overflow-y-auto">
                        {shown.map(({ item, product }) => {
                            const already = on.has(product.id)
                            const ticked = picked[product.id] !== undefined
                            return (
                                <label
                                    key={product.id}
                                    className={`flex items-center gap-3 px-3 py-2.5 ${
                                        already ? 'bg-gray-50' : 'bg-white cursor-pointer hover:bg-gray-50'
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        disabled={already}
                                        checked={already || ticked}
                                        onChange={() => toggle(product.id)}
                                        className="w-4 h-4 accent-accent"
                                    />
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-sm text-gray-900">{item.name}</span>
                                        {/* The product behind it, when they are
                                            not called the same thing. Which one
                                            is being costed is the whole point. */}
                                        {product.name !== item.name && (
                                            <span className="block text-xs text-muted">{product.name}</span>
                                        )}
                                    </span>

                                    {already ? (
                                        <span className="text-xs text-muted">Already on this item</span>
                                    ) : ticked ? (
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={picked[product.id]}
                                            onChange={e => setPicked({ ...picked, [product.id]: e.target.value })}
                                            onClick={e => e.preventDefault()}
                                            aria-label={`Quantity of ${product.name}`}
                                            className="w-20 border border-border rounded-lg px-2 py-1 text-sm text-right bg-white"
                                        />
                                    ) : (
                                        <span className="text-xs text-muted">{product.unit}</span>
                                    )}
                                </label>
                            )
                        })}
                    </div>
                )}

                {/* Said out loud rather than left as a short list. Offering
                    eight of eleven quietly is how a group ends up missing
                    three options with no reason to go looking. */}
                {skipped > 0 && (
                    <p className="text-xs text-muted mt-3">
                        {skipped} {skipped === 1 ? 'item is' : 'items are'} made from more than one
                        product, so {skipped === 1 ? 'it cannot' : 'they cannot'} be added here.
                        Add {skipped === 1 ? 'it' : 'them'} one at a time instead.
                    </p>
                )}
            </ModalSection>

            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                <button
                    type="button"
                    onClick={add}
                    disabled={!ready}
                    className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                    {chosen.length === 0
                        ? 'Add them'
                        : `Add ${chosen.length} component${chosen.length === 1 ? '' : 's'}`}
                </button>
            </div>
        </Modal>
    )
}
