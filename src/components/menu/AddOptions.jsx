import { useState } from 'react'
import Modal from '../Modal'
import ModalSection from '../ModalSection'
import { modalFooter, secondaryButton, checkbox } from '../../lib/controlStyles'
import QuantityInUnit from '../QuantityInUnit'
import { offerable } from '../../lib/menuChoices'
import { canBeMenuComponent } from '../../lib/products'

// Adding a whole choice at once.
//
// A breakfast that comes with any of nine drinks is nine components, and adding
// them one at a time through the ordinary form is nine trips through a product
// search. This fills the list from a menu category or from the products, and
// you tick what is in.
//
// It only ever makes options, and the choice has to be named. It used to allow
// a blank one, which quietly turned it into a way of adding several ordinary
// ingredients at once: the same screen doing two jobs, with nothing on it
// saying which one you were doing.
//
// What it stores is plain components, the same as adding them by hand. It is a
// faster way of typing, not a different kind of thing, which matters: a group
// that pointed at the category itself would quietly pull in a drink added next
// month and raise the cost of every breakfast with nothing anywhere saying so.

// The value the dropdown uses for "not a category at all". A uuid can never
// collide with it.
const PRODUCTS = 'products'

export default function AddOptions({
    menuCategories, menuItems, allComponents, products, existingGroups,
    existing, onAdd, onClose,
}) {
    const [group, setGroup] = useState(existingGroups?.[0] || '')
    const [categoryId, setCategoryId] = useState('')
    const [search, setSearch] = useState('')
    const [listSeparately, setListSeparately] = useState(false)
    const [everyQuantity, setEveryQuantity] = useState('')
    // Ticked, and how much of each. Kept apart from the list itself so ticking
    // something, filtering it away and filtering it back does not lose it.
    const [picked, setPicked] = useState({})

    // Two ways to fill the list, because not everything you might choose
    // between is sold on its own.
    //
    // A drink and a salsa are menu items, so a category gives them. Chocolate
    // sauce is not sold separately and never will be, so it is only ever a
    // product, and a recipe made in house is only ever a product too. Without
    // this there was no way to offer either of them at all.
    const fromProducts = categoryId === PRODUCTS

    const inCategory = fromProducts || !categoryId
        ? []
        : menuItems.filter(i => i.category_id === categoryId)
    const { offered, skipped, packagingLeftOut } = offerable(inCategory, allComponents, products)

    const asProducts = fromProducts
        ? products
            .filter(canBeMenuComponent)
            .map(product => ({ item: product, product }))
        : []

    const wanted = search.trim().toLowerCase()
    const shown = [...offered, ...asProducts].filter(({ product }) =>
        product.name.toLowerCase().includes(wanted))

    // Already in the choice being typed, rather than already anywhere on the
    // item. A chicken quesadilla made with chipotle can still be served with a
    // dip pot of it, so the ingredient must not grey out the option.
    // What has been ticked, whatever the search or the category is showing now.
    //
    // Ticking chocolate, then searching for caramel, took chocolate off the
    // screen with nothing left saying it was still in. Resolved from the full
    // product list rather than from what is on screen, so switching source does
    // not lose it either.
    const chosenRows = Object.keys(picked)
        .map(pid => products.find(p => p.id === pid))
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name))

    const on = new Set((existing || [])
        .filter(c => (c.choice_group || '') === group.trim())
        .map(c => c.product_id))

    // The list underneath, without the ones already shown above it. One thing
    // in two places at once is a screen you have to read twice.
    const rest = shown.filter(({ product }) => picked[product.id] === undefined)
    const chosen = Object.keys(picked)

    // Everything on screen measured the same way, or nothing. A box that sets
    // every row at once can only exist when one number means the same thing on
    // all of them; a category holding both cans and sauces has no such number.
    const units = new Set(shown.map(({ product }) => product.unit))
    const commonUnit = units.size === 1 ? [...units][0] : null

    function toggle(productId) {
        setPicked(was => {
            const next = { ...was }
            if (next[productId] !== undefined) delete next[productId]
            else next[productId] = everyQuantity
            return next
        })
    }

    // Everything on the list at once, or none of it. "On the list" means what
    // the search has narrowed it to, not the whole category, because a button
    // that quietly ticks things you cannot see is worse than no button.
    const tickable = shown.filter(({ product }) => !on.has(product.id))
    const allTicked = tickable.length > 0
        && tickable.every(({ product }) => picked[product.id] !== undefined)

    function toggleAll() {
        setPicked(was => {
            const next = { ...was }
            if (allTicked) {
                for (const { product } of tickable) delete next[product.id]
            } else {
                for (const { product } of tickable) {
                    if (next[product.id] === undefined) next[product.id] = everyQuantity
                }
            }
            return next
        })
    }

    // Typing in the box moves every row that has not been given a
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
            choice_group: group.trim(),
            list_separately: listSeparately,
        })))
    }

    const named = group.trim().length > 0
    const ready = named
        && chosen.length > 0
        && chosen.every(id => parseFloat(picked[id]) > 0)

    return (
        <Modal title="Add options" onClose={onClose} width="max-w-2xl">
            <ModalSection title="Choice settings">
                <div className="flex flex-wrap gap-4">
                    <div className="flex-1 min-w-[12rem]">
                        <label htmlFor="several-group" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                            What the choice is called
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

                </div>

                <p className="text-xs text-gray-500 mt-2">
                    The customer gets one of these, so only the most expensive is counted in
                    the cost. Everything added here becomes an option, so the choice needs a
                    name.
                </p>

                <label className="flex items-start gap-2 mt-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={listSeparately}
                        onChange={e => setListSeparately(e.target.checked)}
                        className={`${checkbox} mt-0.5`}
                    />
                    <span className="text-sm text-gray-700">
                        List them separately on the allergen sheet
                        <span className="block text-xs text-gray-400">
                            Leave this off if they already appear in their own category.
                        </span>
                    </span>
                </label>
            </ModalSection>

            <ModalSection title="Options to add">
                <div className="flex flex-wrap gap-3 mb-4">
                    <select
                        value={categoryId}
                        onChange={e => setCategoryId(e.target.value)}
                        aria-label="Fill the list from"
                        className="flex-1 min-w-[10rem] border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                    >
                        <option value="">Choose a category...</option>
                        <optgroup label="Menu categories">
                            {menuCategories.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </optgroup>
                        <optgroup label="Anything else">
                            <option value={PRODUCTS}>All products</option>
                        </optgroup>
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

                {/* Under the list rather than above it. The quantity is only
                    worth setting once you can see what you are setting it on,
                    and having to scroll back up to a box in another section to
                    do it was the wrong way round. */}
                {/* Above the chosen ones rather than below them: it is the box
                    that fills their quantities, so reaching it should not mean
                    scrolling past the thing it acts on.

                    Kept on the whole time there is a list, not only while
                    something is left in it: ticking the last one must not take
                    Clear all off the screen with it. */}
                {categoryId && shown.length > 0 && (
                    <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
                        {commonUnit ? (
                            <div className="w-56">
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                    Quantity for all
                                </label>
                                {/* The same control as the ordinary component
                                    form, so a sauce is typed in grams here as
                                    well. A plain box stored 1 as one whole kilo
                                    with nothing on screen saying which unit it
                                    meant. */}
                                <QuantityInUnit
                                    value={everyQuantity}
                                    onChange={setAll}
                                    unit={commonUnit}
                                />
                            </div>
                        ) : (
                            <p className="text-xs text-gray-500 max-w-xs">
                                These are measured in different units, so set the quantity on
                                each one.
                            </p>
                        )}

                        <button type="button" onClick={toggleAll} className={secondaryButton}>
                            {allTicked ? 'Clear all' : 'Select all'}
                        </button>
                    </div>
                )}

                {/* Above the list and outside the search, because the whole
                    point of it is to be visible when what it names is not. */}
                {chosenRows.length > 0 && (
                    <div className="rounded-lg border border-accent/40 bg-accent-light/40 p-3 mb-4">
                        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                            Chosen ({chosenRows.length})
                        </p>
                        <div className="space-y-2">
                            {chosenRows.map(product => (
                                <div key={product.id} className="flex flex-wrap items-center gap-2">
                                    <span className="flex-1 min-w-[8rem] text-sm text-gray-900">
                                        {product.name}
                                    </span>
                                    <span className="w-44">
                                        <QuantityInUnit
                                            value={picked[product.id]}
                                            onChange={v => setPicked({ ...picked, [product.id]: v })}
                                            unit={product.unit}
                                        />
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => toggle(product.id)}
                                        aria-label={`Remove ${product.name}`}
                                        className="px-2 py-1 rounded-lg border border-border bg-white text-xs text-gray-600 hover:border-gray-400 transition-colors"
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {!categoryId ? (
                    <p className="text-sm text-muted py-6 text-center">
                        Choose a category to see what is in it, or All products for something
                        that is not sold on its own.
                    </p>
                ) : rest.length === 0 ? (
                    <p className="text-sm text-muted py-6 text-center">
                        {shown.length === 0 ? 'No items match.' : 'All of these are chosen already.'}
                    </p>
                ) : (
                    <div className="rounded-lg border border-border divide-y divide-border max-h-72 overflow-y-auto">
                        {rest.map(({ item, product }) => {
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
                                        className={checkbox}
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
                                        <span className="text-xs text-muted">Already added</span>
                                    ) : ticked ? (
                                        <span
                                            className="w-48"
                                            onClick={e => e.preventDefault()}
                                        >
                                            <QuantityInUnit
                                                value={picked[product.id]}
                                                onChange={v => setPicked({ ...picked, [product.id]: v })}
                                                unit={product.unit}
                                            />
                                        </span>
                                    ) : (
                                        <span className="text-xs text-muted">{product.unit}</span>
                                    )}
                                </label>
                            )
                        })}
                    </div>
                )}

                {/* Both of these are said out loud rather than left as a short
                    list. Offering eight of eleven quietly is how a group ends
                    up missing three options with no reason to go looking. */}
                {fromProducts && shown.length > 0 && (
                    <p className="text-xs text-gray-500 mt-3">
                        Every product, so search is the quick way through it. A recipe made
                        in house is here the same as anything bought in.
                    </p>
                )}
                {packagingLeftOut > 0 && (
                    <p className="text-xs text-gray-500 mt-3">
                        Packaging is not included. A salsa sold on its own comes in a dip pot,
                        but going into a dish it does not, so only the salsa is added.
                    </p>
                )}
                {skipped > 0 && (
                    <p className="text-xs text-muted mt-3">
                        {skipped} {skipped === 1 ? 'item is' : 'items are'} made from more than one
                        product, so {skipped === 1 ? 'it cannot' : 'they cannot'} be added here.
                        Add {skipped === 1 ? 'it' : 'them'} one at a time instead.
                    </p>
                )}
            </ModalSection>

            <div className={modalFooter}>
                {/* Why the button is off, rather than a dead button and no
                    reason for it. */}
                {!named && chosen.length > 0 && (
                    <p className="text-xs text-amber-800 mr-auto self-center">
                        Name the choice above to add these.
                    </p>
                )}
                <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                <button
                    type="button"
                    onClick={add}
                    disabled={!ready}
                    className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                    {chosen.length === 0
                        ? 'Add them'
                        : `Add ${chosen.length} option${chosen.length === 1 ? '' : 's'}`}
                </button>
            </div>
        </Modal>
    )
}
